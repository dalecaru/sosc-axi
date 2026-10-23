import { expect, test } from "bun:test";
import { tipos } from "../../src/commands/tipos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("searches a modulo, name read from the field named after it", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /tipo/listado/condicioniva/Consumidor": {
      items: [{ id: 5, condicionIVA: "Consumidor Final", condicionmini: "CF" }],
    },
  });
  expect(await tipos.run(["condicioniva", "Consumidor"], undefined)).toEqual({
    count: "1 tipos",
    tipos: [{ id: "5", nombre: "Consumidor Final" }],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("without busca lists the whole modulo", async () => {
  loggedIn();
  mockApi({ "GET /tipo/listado/moneda/": { items: [{ id: 1, moneda: "ARS" }] } });
  expect(await tipos.run(["moneda"], undefined)).toEqual({ count: "1 tipos", tipos: [{ id: "1", nombre: "ARS" }] });
});

test("no match", async () => {
  loggedIn();
  mockApi({ "GET /tipo/listado/moneda/zzz": { items: [] } });
  expect(await tipos.run(["moneda", "zzz"], undefined)).toEqual({ tipos: "0 tipos" });
});

test("unknown modulo lists the known ones without calling the API", async () => {
  loggedIn();
  const calls = mockApi({});
  const error = await expectAxiError(tipos.run(["foo"], undefined), "VALIDATION_ERROR", "unknown modulo foo");
  expect(error.suggestions.join(" ")).toContain("creditofiscal");
  expect(calls).toHaveLength(0);
});

test("modulo is required", async () => {
  loggedIn();
  await expectAxiError(tipos.run([], undefined), "VALIDATION_ERROR", "modulo is required");
});
