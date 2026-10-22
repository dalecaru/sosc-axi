import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub, exp: 4102444800 })).toString("base64url")}.s`;

const PDF = Buffer.from("%PDF-1.4\n\xff\x00binary\n%%EOF");

const server = Bun.serve({
  port: 0,
  routes: {
    "/login": {
      POST: async (req) => {
        const { usuario, password } = (await req.json()) as { usuario: string; password: string };
        return Response.json(
          password === "secret" ? { jwt: jwt(usuario) } : { error: "Error: Usuario o clave no válidos" },
        );
      },
    },
    "/cuit/listado": (req) =>
      req.headers.get("authorization")?.startsWith("Bearer h.")
        ? Response.json({
            items: [
              { idcuit: 11, cuit: "20-12345678-9", razonsocial: "Ana Perez" },
              { idcuit: 22, cuit: "30-71234567-1", razonsocial: "Estudio SRL" },
            ],
          })
        : new Response("unauthorized", { status: 401 }),
    "/cuit/credentials/:id": (req) => Response.json({ jwt: jwt(`cuit-${req.params.id}`) }),
    "/cuit/parametros": () => Response.json({}),
    // Bun.serve drops GET bodies, so this only proves Node sends the GET-with-body request at all.
    "/cuentacorriente/listado": (req) =>
      Response.json(
        req.method === "GET" && req.headers.get("content-length") !== "0"
          ? { items: [{ idclipro: "7", clipro: "30712345671 Estudio SRL", montodebe: 10, montohaber: 4 }] }
          : { error: "Error: no body" },
      ),
    "/venta/pdf/:id": () => new Response(PDF),
  },
});
afterAll(() => server.stop());

// Run the bundle users get via npx, on Node (whatever `node` is on PATH; CI sets the version matrix).
const bin = join(import.meta.dir, "../dist/sosc-axi.js");
beforeAll(() => {
  if (Bun.spawnSync(["bun", "run", "build"], { cwd: join(import.meta.dir, "..") }).exitCode !== 0)
    throw new Error("build failed");
});

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sosc-axi-"));
});

async function run(args: string[], stdin?: string) {
  const { bytes, code } = await runBytes(args, stdin);
  return { out: bytes.toString(), code };
}

async function runBytes(args: string[], stdin?: string) {
  const proc = Bun.spawn(["node", bin, ...args], {
    env: { ...process.env, SOSC_AXI_HOME: home, SOSC_API_URL: server.url.href },
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
  });
  const bytes = Buffer.from(await new Response(proc.stdout).arrayBuffer());
  return { bytes, code: await proc.exited };
}

const login = (usuario: string) => run(["login", "--usuario", usuario, "--password-stdin"], "secret\n");

test("--version prints bare version", async () => {
  const { out, code } = await run(["--version"]);
  expect(code).toBe(0);
  expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
});

test("home view without accounts is a definitive empty state", async () => {
  const { out, code } = await run([]);
  expect(code).toBe(0);
  expect(out).toContain("description:");
  expect(out).toContain("accounts: 0 accounts logged in");
});

test("unknown flags are rejected with exit 2 and valid flags listed", async () => {
  const { out, code } = await run(["login", "--usr", "x"]);
  expect(code).toBe(2);
  expect(out).toContain("unknown flag --usr");
  expect(out).toContain("--usuario, --password-stdin");
});

test("login without a terminal asks for the user to log in instead of prompting", async () => {
  const { out, code } = await run(["login", "--usuario", "ana@x.com"]);
  expect(code).toBe(2);
  expect(out).toContain("Ask the user to run `sosc-axi login --usuario ana@x.com` in their own terminal");
});

test("bad credentials surface the API message", async () => {
  const { out, code } = await run(["login", "--usuario", "ana@x.com", "--password-stdin"], "nope");
  expect(code).toBe(1);
  expect(out).toContain("Usuario o clave no válidos");
});

test("login stores tokens privately and lists CUITs", async () => {
  const { out, code } = await login("ana@x.com");
  expect(code).toBe(0);
  expect(out).toContain("ana@x.com logged in");
  expect(out).toContain("2 CUITs available");
  expect(out).toContain("Estudio SRL");
  expect(statSync(join(home, "accounts.json")).mode & 0o777).toBe(0o600);
  const stored = await Bun.file(join(home, "accounts.json")).text();
  expect(stored).not.toContain("secret");
});

test("multiple accounts, switching default, selecting CUITs, logout", async () => {
  await login("ana@x.com");
  await login("bob@x.com");

  let r = await run(["accounts"]);
  expect(r.out).toContain("2 accounts logged in");

  r = await run(["accounts", "use", "ana@x.com"]);
  expect(r.out).toContain("default account is now ana@x.com");
  r = await run(["accounts", "use", "ana@x.com"]);
  expect(r.out).toContain("(no-op)");

  r = await run(["cuits", "use", "30712345671"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("30712345671 (Estudio SRL) is now active for ana@x.com");

  r = await run(["cuits", "use", "20123456789", "--usuario", "bob@x.com"]);
  expect(r.out).toContain("is now active for bob@x.com");

  r = await run(["cuits", "use", "27999999999"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain("NOT_FOUND");

  r = await run(["status"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("30712345671 (Estudio SRL) connected");

  r = await run([]);
  expect(r.out).toContain("usuario: ana@x.com");
  expect(r.out).toContain("Estudio SRL");

  r = await run(["logout"]);
  expect(r.out).toContain("ana@x.com logged out");
  r = await run(["logout", "--usuario", "ana@x.com"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("(no-op)");
});

test("cuentacorriente sends its filters as a GET body on Node", async () => {
  await login("ana@x.com");
  await run(["cuits", "use", "30712345671"]);
  const { out, code } = await run(["cuentacorriente", "--desde", "2026-01-01", "--hasta", "2026-01-31"]);
  expect(code).toBe(0);
  expect(out).toContain("1 clientes in 2026-01-01 to 2026-01-31");
  expect(out).toContain("Estudio SRL");
});

test("ventas create reads the venta from stdin with --file -", async () => {
  const venta = { cuitclipro: "50000000016", fcncnd: "F", letra: "C", puntoventa: 1, imputaciones: [{ v: 1 }] };
  const { out, code } = await run(["ventas", "create", "--file", "-", "--dry-run"], JSON.stringify(venta));
  expect(code).toBe(0);
  expect(out).toContain("PUT /venta (dry run, nothing sent)");
  expect(out).toContain("50000000016");
});

test("ventas pdf --output - writes the PDF bytes to stdout", async () => {
  await login("ana@x.com");
  await run(["cuits", "use", "30712345671"]);
  const { bytes, code } = await runBytes(["ventas", "pdf", "5", "--output", "-"]);
  expect(code).toBe(0);
  expect(bytes.subarray(0, PDF.length)).toEqual(PDF);
});
