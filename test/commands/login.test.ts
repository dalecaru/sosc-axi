import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { login } from "../../src/commands/login.ts";
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
const ok = (listado: unknown = CUITS) => mockApi({ "POST /login": { jwt: TOKEN }, "GET /cuit/listado": listado });

describe("validation", () => {
  test("requires --usuario", async () => {
    await expectAxiError(login.run([], undefined), "VALIDATION_ERROR", "--usuario is required");
  });

  test("requires a password", async () => {
    await expectAxiError(login.run(["--usuario", "ana@x.com"], undefined), "VALIDATION_ERROR", "No password");
  });

  test("rejects unknown flags", async () => {
    await expectAxiError(login.run(["--password", "x"], undefined), "VALIDATION_ERROR", "unknown flag --password");
  });
});

describe("login", () => {
  test("posts credentials, stores the token (never the password) and lists CUITs", async () => {
    process.env.SOSC_PASSWORD = "secret";
    const calls = ok();

    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as Record<string, unknown>;

    expect(calls).toEqual([
      { method: "POST", path: "/login", auth: undefined, body: { usuario: "ana@x.com", password: "secret" } },
      { method: "GET", path: "/cuit/listado", auth: `Bearer ${TOKEN}`, body: undefined },
    ]);
    expect(out.login).toBe("ana@x.com logged in (default account)");
    expect(out.count).toBe("2 CUITs available");
    expect(out.cuits).toEqual([
      { id: "11", cuit: "20123456789", nombre: "Ana Perez", active: "" },
      { id: "22", cuit: "30712345671", nombre: "Estudio SRL", active: "" },
    ]);
    const store = loadStore();
    expect(store.default).toBe("ana@x.com");
    expect(store.accounts["ana@x.com"]!.jwt).toBe(TOKEN);
    expect(readFileSync(join(process.env.SOSC_AXI_HOME!, "accounts.json"), "utf8")).not.toContain("secret");
  });

  test("reads the user from SOSC_USERNAME", async () => {
    Object.assign(process.env, { SOSC_USERNAME: "env@x.com", SOSC_PASSWORD: "secret" });
    const calls = ok();
    await login.run([], undefined);
    expect(calls[0]!.body).toEqual({ usuario: "env@x.com", password: "secret" });
  });

  test("auto-selects the only CUIT", async () => {
    process.env.SOSC_PASSWORD = "secret";
    ok({ items: [CUITS.items[0]] });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as { help: string[] };
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBe("11");
    expect(out.help[0]).toContain("Active CUIT: 11");
  });

  test("re-login keeps the previously active CUIT", async () => {
    process.env.SOSC_PASSWORD = "secret";
    seed({ default: "ana@x.com", accounts: { "ana@x.com": { jwt: "old", cuits: [], cuit: "22" } } });
    ok();
    await login.run(["--usuario", "ana@x.com"], undefined);
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBe("22");
  });

  test("falls back to the CUITs embedded in the login response", async () => {
    process.env.SOSC_PASSWORD = "secret";
    mockApi({ "POST /login": { jwt: TOKEN, cuits: [{ id: 5, cuit: "27111111111" }] }, "GET /cuit/listado": { items: [] } });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as Record<string, unknown>;
    expect(out.count).toBe("1 CUITs available");
  });

  test("user without CUITs gets a next step", async () => {
    process.env.SOSC_PASSWORD = "secret";
    ok({ items: [] });
    const out = (await login.run(["--usuario", "ana@x.com"], undefined)) as { help: string[] };
    expect(out.help[0]).toContain("no CUITs yet");
  });

  test("surfaces the API error for bad credentials", async () => {
    process.env.SOSC_PASSWORD = "nope";
    mockApi({ "POST /login": { error: "Error: Usuario o clave no válidos" } });
    await expectAxiError(login.run(["--usuario", "ana@x.com"], undefined), "API_ERROR", "SOS Contador: Usuario o clave no válidos");
    expect(loadStore().accounts).toEqual({});
  });

  test("fails when the API returns no token", async () => {
    process.env.SOSC_PASSWORD = "secret";
    mockApi({ "POST /login": {} });
    await expectAxiError(login.run(["--usuario", "ana@x.com"], undefined), "AUTH_REQUIRED");
  });
});
