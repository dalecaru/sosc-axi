import { expect, test } from "bun:test";
import { libroiva } from "../../src/commands/libroiva.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const ROW = {
  fecha: "2026-09-01T03:00:00.000Z",
  fcncnd: "F",
  letra: "A",
  sucursal: "00840",
  numero: 633546,
  clipro: "AUTOPISTAS DEL SOL S A ",
  cuit: "30677237119",
  gravado_total: 6079.94,
  no_gravado: 0,
  exento: 0,
  iva_total: 1276.79,
  percepciones_total: 608,
  montototal: 7964.7274,
};
const TOTAL = {
  gravado: 3039119.47,
  no_gravado: 450000,
  exento: 0,
  iva_total: 488269.93,
  percepciones: 160035.21,
  total: 4137424.5865,
};

test("compras lists one month of the libro with its totals", async () => {
  loggedIn();
  const calls = mockApi({ "GET /libroivacompra/listado/2026?anio=2026&mes=09": { libro: [ROW], total: [TOTAL] } });
  expect(await libroiva.run(["compras", "--ejercicio", "2026", "--mes", "09"], undefined)).toEqual({
    cuit: "20123456789",
    libroiva: "1 compras in 2026-09",
    compras: [
      {
        fecha: "2026-09-01",
        comprobante: "FA-0840-00633546",
        proveedor: "AUTOPISTAS DEL SOL S A",
        cuit: "30677237119",
        gravado: 6079.94,
        no_gravado: 0,
        iva: 1276.79,
        percepciones: 608,
        total: 7964.73,
      },
    ],
    totales: { gravado: 3039119.47, no_gravado: 450000, iva: 488269.93, percepciones: 160035.21, total: 4137424.59 },
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("ventas names the cliente and folds exento into no_gravado; defaults to the whole current year", async () => {
  loggedIn();
  const year = new Date().getFullYear();
  mockApi({
    [`GET /libroivaventa/listado/${year}?anio=${year}&mes=00`]: {
      libro: [{ ...ROW, clipro: "Consumidor Final", no_gravado: 1, exento: 2 }],
      total: [],
    },
  });
  const out = (await libroiva.run(["ventas"], undefined)) as {
    libroiva: string;
    ventas: Record<string, unknown>[];
    totales?: unknown;
  };
  expect(out.libroiva).toBe(`1 ventas in ${year}`);
  expect(out.ventas[0]).toMatchObject({ cliente: "Consumidor Final", no_gravado: 3 });
  expect(out.totales).toBeUndefined();
});

test("empty libro", async () => {
  loggedIn();
  mockApi({ "GET /libroivaventa/listado/2025?anio=2025&mes=00": { libro: [], total: [{}] } });
  expect(await libroiva.run(["ventas", "--ejercicio", "2025"], undefined)).toEqual({ libroiva: "0 ventas in 2025" });
});

test.each([
  [[], "ventas or compras is required"],
  [["iva"], "ventas or compras is required"],
  [["ventas", "--mes", "9"], "--mes must be MM"],
  [["compras", "--ejercicio", "x"], "--ejercicio must be AAAA"],
  [["compras", "--desde", "2026-01-01"], "unknown flag --desde"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(libroiva.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
