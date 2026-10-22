import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { login, tty } from "../../src/commands/login.ts";
import { loadStore } from "../../src/store.ts";
import { expectAxiError, jwt, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const TOKEN = jwt({ idusuario: 1 });
const CUITS = {
  items: [
    { id: 11, cuit: "20123456789", razonsocial: "Ana Perez" },
    { id: 22, cuit: "30712345671", razonsocial: "Estudio SRL" },
  ],
};
/** Simulates a terminal answering the prompts in order. */
function terminal(...answers: string[]) {
  spyOn(tty, "interactive").mockReturnValue(true);
  const ask = spyOn(tty, "ask");
  for (const a of answers) ask.mockResolvedValueOnce(a);
  return ask;
}
const ok = (listado: unknown = CUITS) => mockApi({ "POST /login": { jwt: TOKEN }, "GET /cuit/listado": listado });

describe("validation", () => {
  test("without a terminal, asks for the user to log in instead of prompting", async () => {
    const err = await expectAxiError(login.run([], undefined), "VALIDATION_ERROR", "needs the user's terminal");
    expect(err.suggestions[0]).toContain("Ask the user to run `sosc-axi login`");
  });

  test("without a terminal and no password, keeps the usuario in the hint", async () => {
    const err = await expectAxiError(login.run(["--usuario", "ana@x.com"], undefined), "VALIDATION_ERROR");
    expect(err.suggestions[0]).toContain("sosc-axi login --usuario ana@x.com");
  });

  test("rejects unknown flags", async () => {
    await expectAxiError(login.run(["--password", "x"], undefined), "VALIDATION_ERROR", "unknown flag --password");
  });
});

describe("tty.ask", () => {
  test("reads a visible answer", async () => {
    spyOn(process.stderr, "write").mockImplementation(() => true);
    const input = new PassThrough();
    const answer = tty.ask("usuario: ", false, input);
    input.end(" ana@x.com \n");
    expect(await answer).toBe("ana@x.com");
  });

  test("reads a hidden answer without echoing it", async () => {
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    const input = new PassThrough();
    const answer = tty.ask("Password: ", true, input);
    input.end("secret\n");
    expect(await answer).toBe("secret");
    expect(write.mock.calls.map((c) => String(c[0])).join("")).not.toContain("secret");
  });
});

describe("login", () => {
  test("posts credentials, stores the token (never the password) and lists CUITs", async () => {
    const ask = terminal("secret");
    const calls = ok();

    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as Record<string, unknown>;

    expect(calls).toEqual([
      { method: "POST", path: "/login", auth: undefined, body: { usuario: "ana@x.com", password: "secret" } },
      { method: "GET", path: "/cuit/listado", auth: `Bearer ${TOKEN}`, body: undefined },
    ]);
    expect(ask).toHaveBeenCalledWith("Password: ", true);
    expect(out.login).toBe("ana@x.com logged in (default account)");
    expect(out.count).toBe("2 CUITs available");
    expect(out.cuits).toEqual([
      { cuit: "20123456789", nombre: "Ana Perez", active: "" },
      { cuit: "30712345671", nombre: "Estudio SRL", active: "" },
    ]);
    const store = loadStore();
    expect(store.default).toBe("ana@x.com");
    expect(store.accounts["ana@x.com"]!.jwt).toBe(TOKEN);
    expect(readFileSync(join(process.env.SOSC_AXI_HOME!, "accounts.json"), "utf8")).not.toContain("secret");
  });

  test("--password-stdin reads the password from stdin, trimming the trailing newline", async () => {
    const stdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
    Object.defineProperty(process, "stdin", { value: Readable.from(["sec", "ret\n"]), configurable: true });
    try {
      const calls = ok();
      await login.run(["--usuario", "ana@x.com", "--password-stdin"], undefined);
      expect(calls[0]!.body).toEqual({ usuario: "ana@x.com", password: "secret" });
    } finally {
      Object.defineProperty(process, "stdin", stdin);
    }
  });

  test("prompts for the usuario too when omitted", async () => {
    const ask = terminal("ana@x.com", "secret");
    const calls = ok();
    await login.run([], undefined);
    expect(ask.mock.calls).toEqual([["SOS Contador usuario (email): "], ["Password: ", true]]);
    expect(calls[0]!.body).toEqual({ usuario: "ana@x.com", password: "secret" });
  });

  test("auto-selects the only CUIT", async () => {
    terminal("secret");
    ok({ items: [CUITS.items[0]] });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as { help: string[] };
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBe("11");
    expect(out.help[0]).toContain("Active CUIT: 20123456789");
  });

  test("re-login keeps the previously active CUIT", async () => {
    terminal("secret");
    seed({ default: "ana@x.com", accounts: { "ana@x.com": { jwt: "old", cuits: [], cuit: "22" } } });
    ok();
    await login.run(["--usuario", "ana@x.com"], undefined);
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBe("22");
  });

  test("falls back to the CUITs embedded in the login response", async () => {
    terminal("secret");
    mockApi({
      "POST /login": { jwt: TOKEN, cuits: [{ id: 5, cuit: "27111111111" }] },
      "GET /cuit/listado": { items: [] },
    });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as Record<string, unknown>;
    expect(out.count).toBe("1 CUITs available");
  });

  test("user without CUITs gets a next step", async () => {
    terminal("secret");
    ok({ items: [] });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as { help: string[] };
    expect(out.help[0]).toContain("no CUITs yet");
  });

  test("surfaces the API error for bad credentials", async () => {
    terminal("nope");
    mockApi({ "POST /login": { error: "Error: Usuario o clave no válidos" } });
    await expectAxiError(
      login.run(["--usuario", "ana@x.com"], undefined),
      "API_ERROR",
      "SOS Contador: Usuario o clave no válidos",
    );
    expect(loadStore().accounts).toEqual({});
  });

  test("fails when the API returns no token", async () => {
    terminal("secret");
    mockApi({ "POST /login": {} });
    await expectAxiError(login.run(["--usuario", "ana@x.com"], undefined), "AUTH_REQUIRED");
  });
});
