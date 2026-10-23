import { expect, test } from "bun:test";
import { modificadores } from "../../src/commands/modificadores.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists grupos with their modifiers", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /grupomodificador/listado": {
      items: [
        {
          id: 3,
          grupomodificador: "Salsas ",
          productos: [{ id: 1, producto: "Ketchup", precio: 50 }, { id: 2, nombre: "Mayonesa" }, 9],
        },
        { id: 4, nombre: "Extras" },
      ],
    },
  });
  expect(await modificadores.run([], undefined)).toEqual({
    count: "2 grupos",
    grupos: [
      {
        id: "3",
        grupo: "Salsas",
        modificadores: [
          { id: "1", nombre: "Ketchup", precio: "50" },
          { id: "2", nombre: "Mayonesa", precio: "" },
          { id: "9", nombre: "", precio: "" },
        ],
      },
      { id: "4", grupo: "Extras" },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("accepts a bare array", async () => {
  loggedIn();
  mockApi({ "GET /grupomodificador/listado": [{ id: 2, descripcion: "Bebidas" }] });
  expect(await modificadores.run([], undefined)).toEqual({
    count: "1 grupos",
    grupos: [{ id: "2", grupo: "Bebidas" }],
  });
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /grupomodificador/listado": {} });
  expect(await modificadores.run([], undefined)).toEqual({ grupos: "0 grupos" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(modificadores.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
