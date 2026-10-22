import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub, exp: 4102444800 })).toString("base64url")}.s`;

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
  const proc = Bun.spawn(["node", bin, ...args], {
    env: { ...process.env, SOSC_AXI_HOME: home, SOSC_API_URL: server.url.href, SOSC_PASSWORD: "" },
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  return { out, code: await proc.exited };
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

test("login requires a password without prompting", async () => {
  const { out, code } = await run(["login", "--usuario", "ana@x.com"]);
  expect(code).toBe(2);
  expect(out).toContain("No password provided");
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
  expect(r.out).toContain("30-71234567-1 (Estudio SRL) is now active for ana@x.com");

  r = await run(["cuits", "use", "11", "--usuario", "bob@x.com"]);
  expect(r.out).toContain("is now active for bob@x.com");

  r = await run(["cuits", "use", "99"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain("NOT_FOUND");

  r = await run([]);
  expect(r.out).toContain("usuario: ana@x.com");
  expect(r.out).toContain("Estudio SRL");

  r = await run(["logout"]);
  expect(r.out).toContain("ana@x.com logged out");
  r = await run(["logout", "--usuario", "ana@x.com"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("(no-op)");
});
