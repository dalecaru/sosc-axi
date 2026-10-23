import { expect, test } from "bun:test";
import { actividades } from "../../src/commands/actividades.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("searches actividades by description", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /actividad/listado/pan%20dulce": {
      items: [{ codactividad: "107129", actividad: "Elaboración de productos de panadería n.c.p." }],
    },
  });
  expect(await actividades.run(["pan dulce"], undefined)).toEqual({
    count: "1 actividades",
    actividades: [{ codigo: "107129", actividad: "Elaboración de productos de panadería n.c.p." }],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("strips accents, the API matches nothing with them", async () => {
  loggedIn();
  const calls = mockApi({ "GET /actividad/listado/Panaderia": { items: [] } });
  expect(await actividades.run(["Panadería"], undefined)).toEqual({ actividades: "0 actividades" });
  expect(calls[0]!.path).toBe("/actividad/listado/Panaderia");
});

test("without busca lists them all", async () => {
  loggedIn();
  mockApi({ "GET /actividad/listado/": [{ codactividad: "131300", actividad: "Acabado de productos textiles" }] });
  expect(await actividades.run([], undefined)).toEqual({
    count: "1 actividades",
    actividades: [{ codigo: "131300", actividad: "Acabado de productos textiles" }],
  });
});

test("takes one busca", async () => {
  loggedIn();
  await expectAxiError(actividades.run(["a", "b"], undefined), "VALIDATION_ERROR", "unexpected argument b");
});
