import { expect, test } from "bun:test";
import { mayor } from "../../src/commands/mayor.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const ROW = {
  cuenta: "01.01.01.001.001 CAJA",
  fecha: "2025-09-12T03:00:00.000Z",
  cuit: "00000000000",
  clipro: "Consumidor Final ",
  centrocosto: "General",
  numero: "R-00004821",
  montodebe: 1400000,
  montohaber: 0,
  montosaldo: 1400000,
};

test("lists the movements of one cuenta for the ejercicio", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /mayor/listado/2025?arbol=01.01.01.001.001&pagina=1&registros=50": {
      fechadesde: "2025-01-01T03:00:00.000Z",
      items: [ROW, { ...ROW, cuit: null, montodebe: 0, montohaber: 0.02 }],
    },
  });
  expect(await mayor.run(["01.01.01.001.001", "--ejercicio", "2025"], undefined)).toEqual({
    cuit: "20123456789",
    count: "2 movimientos for cuenta 01.01.01.001.001 in 2025, page 1",
    movimientos: [
      {
        fecha: "2025-09-12",
        cuenta: "01.01.01.001.001 CAJA",
        comprobante: "R-00004821",
        clipro: "Consumidor Final",
        cuit: "00000000000",
        debe: 1400000,
        haber: 0,
      },
      {
        fecha: "2025-09-12",
        cuenta: "01.01.01.001.001 CAJA",
        comprobante: "R-00004821",
        clipro: "Consumidor Final",
        cuit: "",
        debe: 0,
        haber: 0.02,
      },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("pages by row offset, defaults to this year, hints the next page when full", async () => {
  loggedIn();
  const year = new Date().getFullYear();
  mockApi({ [`GET /mayor/listado/${year}?arbol=01.01&pagina=3&registros=2`]: { items: [ROW, ROW] } });
  const out = (await mayor.run(["01.01", "--pagina", "2", "--registros", "2"], undefined)) as { help: string[] };
  expect(out.help).toEqual(["Run with `--pagina 3` for more"]);
});

test("empty pages", async () => {
  loggedIn();
  mockApi({
    "GET /mayor/listado/2025?arbol=01&pagina=1&registros=50": { items: [] },
    "GET /mayor/listado/2025?arbol=01&pagina=51&registros=50": {},
  });
  expect(await mayor.run(["01", "--ejercicio", "2025"], undefined)).toEqual({
    mayor: "0 movimientos for cuenta 01 in 2025",
  });
  expect(await mayor.run(["01", "--ejercicio", "2025", "--pagina", "2"], undefined)).toEqual({
    mayor: "0 movimientos on page 2 (cuenta 01 in 2025)",
  });
});

test("a cuenta the CUIT does not have is NOT_FOUND", async () => {
  loggedIn();
  mockApi({
    "GET /mayor/listado/2025?arbol=99&pagina=1&registros=50": {
      error: "TypeError: Cannot read properties of undefined (reading 'fechadesde')",
    },
  });
  await expectAxiError(mayor.run(["99", "--ejercicio", "2025"], undefined), "NOT_FOUND", "cuenta 99 not found");
});

test("passes other API errors through", async () => {
  loggedIn();
  mockApi({ "GET /mayor/listado/2025?arbol=01&pagina=1&registros=50": { error: "Error: boom" } });
  await expectAxiError(mayor.run(["01", "--ejercicio", "2025"], undefined), "API_ERROR", "boom");
});

test.each([
  [[], "cuenta code is required"],
  [["Caja"], "cuenta code is required"],
  [["01", "--ejercicio", "25"], "--ejercicio must be AAAA"],
  [["01", "--desde", "2025-01-01"], "unknown flag --desde"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(mayor.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
