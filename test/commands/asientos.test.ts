import { expect, test } from "bun:test";
import { asientos } from "../../src/commands/asientos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const ROW = {
  id: 951099901,
  fecha: "2026-09-30T03:00:00.000Z",
  comprobante: "U-0000-00000582",
  montototal: 153325.62,
  idcentrocosto: 51106,
  eliminado: false,
  memo: "Asiento de cierre de IIBB - CABA",
};

test("lists the asientos of the month, leaving deleted ones out", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /asiento/listado/mes?pagina=1&registros=50": { items: [ROW, { ...ROW, id: 2, eliminado: true }] },
  });
  expect(await asientos.run([], undefined)).toEqual({
    cuit: "20123456789",
    count: "1 asientos in mes, page 1",
    asientos: [
      {
        id: "951099901",
        fecha: "2026-09-30",
        comprobante: "U-0000-00000582",
        total: 153325.62,
        memo: "Asiento de cierre de IIBB - CABA",
      },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("pages by row offset and hints the next page when full, even if every row was deleted", async () => {
  loggedIn();
  mockApi({ "GET /asiento/listado/anio?pagina=3&registros=2": { items: [{ eliminado: true }, { eliminado: true }] } });
  expect(await asientos.run(["--periodo", "anio", "--pagina", "2", "--registros", "2"], undefined)).toEqual({
    asientos: "0 asientos on page 2 (anio)",
    help: ["Run with `--pagina 3` for more"],
  });
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /asiento/listado/hoy?pagina=1&registros=50": { items: [] } });
  expect(await asientos.run(["--periodo", "hoy"], undefined)).toEqual({ asientos: "0 asientos in hoy" });
});

test("rejects an unknown --periodo before calling the API", async () => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(asientos.run(["--periodo", "entre_fechas"], undefined), "VALIDATION_ERROR", "--periodo");
  expect(calls).toEqual([]);
});

test("view <id> shows the asiento with its imputaciones", async () => {
  loggedIn();
  mockApi({
    "GET /asiento/detalle/951099901": {
      cabecera: {
        id: 951099901,
        fecha: ROW.fecha,
        letra: "U",
        puntoventa: 0,
        numero: 582,
        centrocosto: "General",
        memo: ROW.memo,
      },
      imputaciones: [
        { identificador: "mov_fondo", montodebe: 153325.62, montohaber: 0, cuenta: "Ingresos Brutos" },
        { identificador: "mov_fondo", montodebe: 0, montohaber: 153325.62, cuenta: "Impuesto IIBB A Pagar CABA" },
      ],
    },
  });
  expect(await asientos.run(["view", "951099901"], undefined)).toEqual({
    id: "951099901",
    fecha: "2026-09-30",
    comprobante: "U-0000-00000582",
    centrocosto: "General",
    memo: "Asiento de cierre de IIBB - CABA",
    imputaciones: [
      { cuenta: "Ingresos Brutos", debe: 153325.62, haber: 0 },
      { cuenta: "Impuesto IIBB A Pagar CABA", debe: 0, haber: 153325.62 },
    ],
  });
});

test("view of an empty detail falls back to the requested id", async () => {
  loggedIn();
  mockApi({ "GET /asiento/detalle/5": {} });
  expect(await asientos.run(["view", "5"], undefined)).toMatchObject({ id: "5", imputaciones: [] });
});

test("view of an unknown id is NOT_FOUND", async () => {
  loggedIn();
  mockApi({ "GET /asiento/detalle/1": { error: "Error: Imposible cargar detalles del asiento" } });
  await expectAxiError(asientos.run(["view", "1"], undefined), "NOT_FOUND", "asiento 1 not found");
});

test("view passes other API errors through", async () => {
  loggedIn();
  mockApi({ "GET /asiento/detalle/1": { error: "Error: boom" } });
  await expectAxiError(asientos.run(["view", "1"], undefined), "API_ERROR", "boom");
});

test("view needs a numeric id", async () => {
  loggedIn();
  await expectAxiError(asientos.run(["view", "x"], undefined), "VALIDATION_ERROR", "numeric asiento id");
});
