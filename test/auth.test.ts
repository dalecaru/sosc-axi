import { describe, expect, test } from "bun:test";
import { cuitRows, findCuits, resolveAccount, token } from "../src/auth.ts";

describe("resolveAccount", () => {
  const store = { default: "ana@x.com", accounts: { "ana@x.com": { jwt: "a", cuits: [] }, "bob@x.com": { jwt: "b", cuits: [] } } };

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
      expect.objectContaining({ code: "AUTH_REQUIRED", suggestions: ["Run `sosc-axi login --usuario zoe@x.com --password-stdin`"] }),
    );
  });
});

describe("findCuits", () => {
  test("walks nested payloads, accepts id variants and dedupes by id", () => {
    const payload = {
      cuits: [{ idcuit: 1, cuit: "20-12345678-9", razonsocial: " Ana " }],
      nested: { list: [{ id_cuit: 2, cuit: 30712345671, razon_social: "SRL" }, { id: 3, cuit: "27111111111" }] },
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
  expect(cuitRows([{ id: "1", cuit: "20123456789" }, { id: "2", cuit: "30712345671", nombre: "SRL" }], "2")).toEqual([
    { id: "1", cuit: "20123456789", nombre: "", active: "" },
    { id: "2", cuit: "30712345671", nombre: "SRL", active: "*" },
  ]);
});
