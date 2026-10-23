import { expect, test } from "bun:test";
import { provincias } from "../../src/commands/provincias.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists provincias", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /provincia/listado": {
      items: [
        { id: 7, provincia: "Buenos Aires " },
        { id: 1, nombre: "Córdoba" },
      ],
    },
  });
  expect(await provincias.run([], undefined)).toEqual({
    count: "2 provincias",
    provincias: [
      { id: "7", provincia: "Buenos Aires" },
      { id: "1", provincia: "Córdoba" },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("accepts a bare array", async () => {
  loggedIn();
  mockApi({ "GET /provincia/listado": [{ id: 2, descripcion: "Salta" }] });
  expect(await provincias.run([], undefined)).toEqual({
    count: "1 provincias",
    provincias: [{ id: "2", provincia: "Salta" }],
  });
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /provincia/listado": {} });
  expect(await provincias.run([], undefined)).toEqual({ provincias: "0 provincias" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(provincias.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
