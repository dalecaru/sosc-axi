import { describe, expect, test } from "bun:test";
import { cuits } from "../../src/commands/cuits.ts";
import { loadStore } from "../../src/store.ts";
import { expectAxiError, jwt, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const JWT = jwt({ idusuario: 1 });
const LISTADO = {
  items: [
    { id: 11, cuit: "20123456789", razonsocial: "Ana Perez" },
    { id: 22, cuit: "30712345671", razonsocial: "Estudio SRL" },
  ],
};
const loggedIn = (extra: Partial<{ cuit: string; cached: boolean }> = {}) =>
  seed({
    default: "ana@x.com",
    accounts: {
      "ana@x.com": {
        jwt: JWT,
        cuits: extra.cached === false ? [] : [{ id: "11", cuit: "20123456789", nombre: "Ana Perez", jwtc: "cached" }],
        cuit: extra.cuit,
      },
      "bob@x.com": { jwt: "bob-jwt", cuits: [] },
    },
  });

describe("list", () => {
  test("requires a logged-in account", async () => {
    await expectAxiError(cuits.run([], undefined), "AUTH_REQUIRED", "No SOS Contador account is logged in");
  });

  test("lists CUITs with the user token and refreshes the cache, keeping per-CUIT tokens", async () => {
    loggedIn({ cuit: "11" });
    const calls = mockApi({ "GET /cuit/listado": LISTADO });

    const out = (await cuits.run([], undefined)) as Record<string, unknown>;

    expect(calls).toEqual([{ method: "GET", path: "/cuit/listado", auth: `Bearer ${JWT}`, body: undefined }]);
    expect(out.count).toBe("2 CUITs");
    expect(out.cuits).toEqual([
      { id: "11", cuit: "20123456789", nombre: "Ana Perez", active: "*" },
      { id: "22", cuit: "30712345671", nombre: "Estudio SRL", active: "" },
    ]);
    expect(loadStore().accounts["ana@x.com"]!.cuits.map((c) => c.jwtc)).toEqual(["cached", undefined]);
  });

  test("--usuario lists another account", async () => {
    loggedIn();
    const calls = mockApi({ "GET /cuit/listado": LISTADO });
    const out = (await cuits.run(["--usuario", "bob@x.com"], undefined)) as Record<string, unknown>;
    expect(out.usuario).toBe("bob@x.com");
    expect(calls[0]!.auth).toBe("Bearer bob-jwt");
  });

  test("empty state", async () => {
    loggedIn();
    mockApi({ "GET /cuit/listado": { items: [] } });
    expect(await cuits.run([], undefined)).toEqual({ cuits: "0 CUITs available for ana@x.com" });
  });
});

describe("use", () => {
  const creds = (token = "jwtc-11") => ({ "GET /cuit/credentials/11": { jwt: token } });

  test("selects a cached CUIT by id, fetching its credentials with the user token", async () => {
    loggedIn();
    const calls = mockApi(creds());
    const out = (await cuits.run(["use", "11"], undefined)) as Record<string, unknown>;
    expect(calls).toEqual([{ method: "GET", path: "/cuit/credentials/11", auth: `Bearer ${JWT}`, body: undefined }]);
    expect(out.cuit).toBe("20123456789 (Ana Perez) is now active for ana@x.com");
    const account = loadStore().accounts["ana@x.com"]!;
    expect(account.cuit).toBe("11");
    expect(account.cuits[0]!.jwtc).toBe("jwtc-11");
  });

  test("matches a formatted CUIT number", async () => {
    loggedIn();
    mockApi(creds());
    await cuits.run(["use", "20-12345678-9"], undefined);
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBe("11");
  });

  test("refetches the list when the CUIT is not cached", async () => {
    loggedIn({ cached: false });
    const calls = mockApi({ "GET /cuit/listado": LISTADO, ...creds() });
    await cuits.run(["use", "11"], undefined);
    expect(calls.map((c) => c.path)).toEqual(["/cuit/listado", "/cuit/credentials/11"]);
  });

  test("re-selecting the active CUIT refreshes its credentials", async () => {
    loggedIn({ cuit: "11" });
    mockApi(creds("fresh"));
    const out = (await cuits.run(["use", "11"], undefined)) as Record<string, unknown>;
    expect(out.cuit).toContain("is already active, credentials refreshed");
    expect(loadStore().accounts["ana@x.com"]!.cuits[0]!.jwtc).toBe("fresh");
  });

  test("unknown CUIT is NOT_FOUND", async () => {
    loggedIn();
    mockApi({ "GET /cuit/listado": LISTADO });
    await expectAxiError(cuits.run(["use", "99"], undefined), "NOT_FOUND", "CUIT 99 is not available for ana@x.com");
  });

  test("missing credentials token is an API_ERROR", async () => {
    loggedIn();
    mockApi({ "GET /cuit/credentials/11": {} });
    await expectAxiError(cuits.run(["use", "11"], undefined), "API_ERROR");
    expect(loadStore().accounts["ana@x.com"]!.cuit).toBeUndefined();
  });

  test("requires a CUIT", async () => {
    await expectAxiError(cuits.run(["use"], undefined), "VALIDATION_ERROR", "CUIT id or number is required");
  });
});
