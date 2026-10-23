import { expect, setSystemTime, test } from "bun:test";
import { cuentacorriente } from "../../src/commands/cuentacorriente.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const SALDO = {
  idcomprobante: null,
  idclipro: "25101884",
  fecha: "2025-12-31T03:00:00.000Z",
  clipro: "30712345671 Estudio SRL",
  fcncnd: "",
  letra: "Saldo anterior - Al 31/12/2025",
  sucursal: null,
  numero: null,
  montodebe: 100,
  montohaber: 99.5,
};
const FACTURA = {
  ...SALDO,
  idcomprobante: "766007202",
  fecha: "2026-01-31T03:00:00.000Z",
  fcncnd: "F",
  letra: "A",
  sucursal: 5,
  numero: 102,
  montodebe: 6050000,
  montohaber: null,
};
const COBRO = {
  ...FACTURA,
  idcomprobante: "780649794",
  fcncnd: null,
  letra: "R",
  sucursal: 0,
  numero: 4845,
  montodebe: null,
  montohaber: 5951343.4,
};
const OTRO = { ...SALDO, idclipro: "4857191", clipro: "00000000000 Consumidor Final", montodebe: 0.1, montohaber: 0 };

const range = ["--desde", "2026-01-01", "--hasta", "2026-10-22"];

test("lists the balance per cliente, sending the filters as a GET body", async () => {
  loggedIn();
  const calls = mockApi({ "GET /cuentacorriente/listado": { items: [SALDO, FACTURA, OTRO, COBRO] } });
  expect(await cuentacorriente.run(range, undefined)).toEqual({
    cuit: "20123456789",
    cuentacorriente: "2 clientes in 2026-01-01 to 2026-10-22",
    clientes: [
      {
        clipro: "25101884",
        cuit: "30712345671",
        cliente: "Estudio SRL",
        debe: 6050100,
        haber: 5951442.9,
        saldo: 98657.1,
      },
      { clipro: "4857191", cuit: "00000000000", cliente: "Consumidor Final", debe: 0.1, haber: 0, saldo: 0.1 },
    ],
    saldo: 98657.2,
    help: ["Run `sosc-axi cuentacorriente --clipro <clipro> --desde 2026-01-01 --hasta 2026-10-22` for its movements"],
  });
  expect(calls[0]).toEqual({
    method: "GET",
    path: "/cuentacorriente/listado",
    auth: "Bearer jwtc-11",
    body: { CP: "C", tipo: "T", fechadesde: "2026-01-01", fechahasta: "2026-10-23" },
  });
});

test("--proveedores and --pendientes pick the side and only unmatched movements", async () => {
  loggedIn();
  const calls = mockApi({ "GET /cuentacorriente/listado": { items: [] } });
  expect(await cuentacorriente.run(["--proveedores", "--pendientes", ...range], undefined)).toEqual({
    cuentacorriente: "0 proveedores with pending movements in 2026-01-01 to 2026-10-22",
  });
  expect(calls[0]!.body).toMatchObject({ CP: "P", tipo: "P" });
});

test("defaults to this year up to today, today included", async () => {
  loggedIn();
  setSystemTime(new Date(2026, 11, 31, 12));
  try {
    const calls = mockApi({ "GET /cuentacorriente/listado": { items: [] } });
    expect(await cuentacorriente.run([], undefined)).toEqual({
      cuentacorriente: "0 clientes with movements in 2026-01-01 to 2026-12-31",
    });
    // The API excludes fechahasta itself.
    expect(calls[0]!.body).toMatchObject({ fechadesde: "2026-01-01", fechahasta: "2027-01-01" });
  } finally {
    setSystemTime();
  }
});

test("--clipro shows the movements of one party with a running saldo", async () => {
  loggedIn();
  const calls = mockApi({ "GET /cuentacorriente/listado": { items: [SALDO, FACTURA, COBRO] } });
  expect(await cuentacorriente.run(["--clipro", "25101884", ...range], undefined)).toEqual({
    cliente: "Estudio SRL",
    cuit: "30712345671",
    periodo: "2026-01-01 to 2026-10-22",
    movimientos: [
      {
        fecha: "2025-12-31",
        comprobante: "Saldo anterior - Al 31/12/2025",
        id: "",
        debe: 100,
        haber: 99.5,
        saldo: 0.5,
      },
      {
        fecha: "2026-01-31",
        comprobante: "FA-0005-00000102",
        id: "766007202",
        debe: 6050000,
        haber: 0,
        saldo: 6050000.5,
      },
      {
        fecha: "2026-01-31",
        comprobante: "R-0000-00004845",
        id: "780649794",
        debe: 0,
        haber: 5951343.4,
        saldo: 98657.1,
      },
    ],
    saldo: 98657.1,
  });
  expect(calls[0]!.body).toMatchObject({ idclipro: 25101884 });
});

test("--clipro without movements is an empty state", async () => {
  loggedIn();
  mockApi({ "GET /cuentacorriente/listado": { items: [] } });
  expect(await cuentacorriente.run(["--clipro", "7", ...range], undefined)).toEqual({
    movimientos: "0 movimientos for clipro 7 in 2026-01-01 to 2026-10-22",
  });
});

test("an unknown --clipro is NOT_FOUND (the API answers with a misleading fechadesde error)", async () => {
  loggedIn();
  mockApi({
    "GET /cuentacorriente/listado": {
      error: "Error: TypeError: Cannot read properties of undefined (reading 'fechadesde')",
    },
  });
  await expectAxiError(cuentacorriente.run(["--clipro", "1"], undefined), "NOT_FOUND", "cliente 1 not found");
  await expectAxiError(cuentacorriente.run([], undefined), "API_ERROR", "fechadesde");
});

test.each([
  [["--clipro", "x"], "--clipro must be a numeric id"],
  [["--desde", "01/01/2026"], "--desde must be AAAA-MM-DD"],
  [["--hasta", "2026"], "--hasta must be AAAA-MM-DD"],
  [["--periodo", "mes"], "unknown flag --periodo"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(cuentacorriente.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
