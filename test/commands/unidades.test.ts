import { expect, test } from "bun:test";
import { unidades } from "../../src/commands/unidades.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists unidades", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /unidad/listado": {
      items: [
        { id: 7, unidad: "unidades " },
        { id: 1, nombre: "kilogramos" },
      ],
    },
  });
  expect(await unidades.run([], undefined)).toEqual({
    count: "2 unidades",
    unidades: [
      { id: "7", unidad: "unidades" },
      { id: "1", unidad: "kilogramos" },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("accepts a bare array", async () => {
  loggedIn();
  mockApi({ "GET /unidad/listado": [{ id: 2, descripcion: "metros" }] });
  expect(await unidades.run([], undefined)).toEqual({ count: "1 unidades", unidades: [{ id: "2", unidad: "metros" }] });
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /unidad/listado": {} });
  expect(await unidades.run([], undefined)).toEqual({ unidades: "0 unidades" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(unidades.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
