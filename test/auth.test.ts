import { describe, expect, test } from "bun:test";
import { activeCuit, cuitRows, findCuits, resolveAccount, token } from "../src/auth.ts";
import { loadStore } from "../src/store.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "./helpers.ts";

useSandbox();

describe("resolveAccount", () => {
  const store = {
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "a", cuits: [] }, "bob@x.com": { jwt: "b", cuits: [] } },
  };

  test("uses --usuario, else the default", () => {
    expect(resolveAccount(store)[0]).toBe("ana@x.com");
    expect(resolveAccount(store, "bob@x.com")).toEqual(["bob@x.com", { jwt: "b", cuits: [] }]);
  });

  test("nobody logged in", () => {
    expect(() => resolveAccount({ accounts: {} })).toThrow(
      expect.objectContaining({ code: "AUTH_REQUIRED", message: "No SOS Contador account is logged in" }),
    );
  });

  test("named account not logged in suggests logging it in", () => {
    expect(() => resolveAccount(store, "zoe@x.com")).toThrow(
      expect.objectContaining({
        code: "AUTH_REQUIRED",
        suggestions: ["Run `sosc-axi login --usuario zoe@x.com --password-stdin`"],
      }),
    );
  });
});

describe("findCuits", () => {
  test("walks nested payloads, accepts id variants and dedupes by id", () => {
    const payload = {
      cuits: [{ idcuit: 1, cuit: "20-12345678-9", razonsocial: " Ana " }],
      nested: {
        list: [
          { id_cuit: 2, cuit: 30712345671, razon_social: "SRL" },
          { id: 3, cuit: "27111111111" },
        ],
      },
      dup: { idcuit: 1, cuit: "20123456789", nombre: "later wins" },
    };
    expect(findCuits(payload)).toEqual([
      { id: "1", cuit: "20123456789", nombre: "later wins" },
      { id: "2", cuit: "30712345671", nombre: "SRL" },
      { id: "3", cuit: "27111111111", nombre: undefined },
    ]);
  });

  test("ignores objects without an id or with a too-short cuit", () => {
    expect(findCuits({ a: { cuit: "20123456789" }, b: { id: 1, cuit: "123" }, c: null, d: "x" })).toEqual([]);
  });
});

describe("token", () => {
  test("first non-empty string key wins, bearer prefix stripped", () => {
    expect(token({ jwt: "", token: "Bearer abc" }, ["jwt", "token"])).toBe("abc");
  });

  test("missing or non-object payload", () => {
    expect(token({ jwt: 1 }, ["jwt"])).toBeUndefined();
    expect(token("jwt", ["jwt"])).toBeUndefined();
    expect(token(null, ["jwt"])).toBeUndefined();
  });
});

test("cuitRows marks the active CUIT", () => {
  expect(
    cuitRows(
      [
        { id: "1", cuit: "20123456789" },
        { id: "2", cuit: "30712345671", nombre: "SRL" },
      ],
      "2",
    ),
  ).toEqual([
    { id: "1", cuit: "20123456789", nombre: "", active: "" },
    { id: "2", cuit: "30712345671", nombre: "SRL", active: "*" },
  ]);
});

describe("activeCuit", () => {
  const store = (jwtc?: string, cuit = "11") => ({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "user-jwt", cuit, cuits: [{ id: "11", cuit: "20123456789", jwtc }] } },
  });

  test("returns the cached per-CUIT token without calling the API", async () => {
    const calls = mockApi({});
    expect(await activeCuit(store("cached"))).toEqual(["ana@x.com", expect.objectContaining({ id: "11" }), "cached"]);
    expect(calls).toEqual([]);
  });

  test("fetches and stores missing credentials with the user token", async () => {
    const s = store();
    seed(s);
    const calls = mockApi({ "GET /cuit/credentials/11": { jwt: "fresh" } });
    expect((await activeCuit(s))[2]).toBe("fresh");
    expect(calls[0]!.auth).toBe("Bearer user-jwt");
    expect(loadStore().accounts["ana@x.com"]!.cuits[0]!.jwtc).toBe("fresh");
  });

  test("no credentials in the response", async () => {
    mockApi({ "GET /cuit/credentials/11": {} });
    await expectAxiError(activeCuit(store()), "API_ERROR", "no credentials for CUIT 20123456789");
  });

  test("no active CUIT points at cuits use", async () => {
    const e = await expectAxiError(activeCuit(store("x", "")), "VALIDATION_ERROR", "No active CUIT for ana@x.com");
    expect(e.suggestions[0]).toContain("sosc-axi cuits use");
  });
});
