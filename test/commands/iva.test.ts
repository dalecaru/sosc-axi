import { expect, test } from "bun:test";
import { iva } from "../../src/commands/iva.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const EMPTY = {
  inconsistencia: [],
  debitofiscal: [],
  debitofiscal_bu: [],
  ncrecibidas: [],
  creditofiscal: [],
  ncemitidas: [],
  ngexentas: [],
  cfacuenta: [],
  retenciones: [{ descripcion: "01.01.03.047 Crédito Fiscal A Cuenta De Iva", montoneto: null }],
  percepciones: [],
  ivatomableacuenta: [],
  ivaacuenta: [],
  saldoanterior: [],
  historial: [],
};
const DEBITO = {
  codactividad: "620100",
  descripcionactividad: "Servicios de consultores en informática",
  descripcion: "1. Responsables Insc (2)",
  alicuota: 21,
  montoneto: 5616183.31,
  montoiva: 1179398.4951,
  total: 6795581.8051,
};
const CREDITO = {
  descripcion: "Prestaciones de servicios",
  alicuota: 10.5,
  montoneto: 1428049.24,
  montoiva: 149945.1702,
  montoivanocomputable: 0,
  total: 1577994.4102,
};

test("maps the F2002 sections of one month, omitting empty ones", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /iva/listado/2026?anio=2026&mes=09": {
      ...EMPTY,
      debitofiscal: [DEBITO],
      ncemitidas: [DEBITO],
      creditofiscal: [CREDITO],
      ncrecibidas: [CREDITO],
      cfacuenta: [
        { descripcion: "Compras No Gravadas y Exentas", condicioniva: "Responsable Monotributo", montoneto: 450000 },
      ],
      retenciones: [
        ...EMPTY.retenciones,
        { descripcion: "01.01.03.150 Crédito Fiscal por uso terminal POS", montoneto: 12.5 },
      ],
      ivatomableacuenta: [
        {
          cuit: "30677237119",
          fecha: "2026-09-01T03:00:00.000Z",
          numeropercepcion: "A 0840-00633546",
          montoneto: -182.4,
        },
      ],
      inconsistencia: [{ memo_inconsistencia: "Sin imputación a cuentas de Compras", total: 10233.84 }],
    },
  });
  const debito = {
    actividad: "620100",
    descripcion: "1. Responsables Insc (2)",
    alicuota: 21,
    neto: 5616183.31,
    iva: 1179398.5,
    total: 6795581.81,
  };
  const credito = {
    descripcion: "Prestaciones de servicios",
    alicuota: 10.5,
    neto: 1428049.24,
    iva: 149945.17,
    no_computable: 0,
    total: 1577994.41,
  };
  expect(await iva.run(["--ejercicio", "2026", "--mes", "09"], undefined)).toEqual({
    cuit: "20123456789",
    periodo: "2026-09",
    debito: [debito],
    nc_emitidas: [debito],
    credito: [credito],
    nc_recibidas: [credito],
    no_gravadas: [{ descripcion: "Compras No Gravadas y Exentas", condicion: "Responsable Monotributo", neto: 450000 }],
    retenciones: [{ descripcion: "01.01.03.150 Crédito Fiscal por uso terminal POS", monto: 12.5 }],
    percepciones: [{ fecha: "2026-09-01", cuit: "30677237119", comprobante: "A 0840-00633546", monto: 182.4 }],
    inconsistencias: [{ memo: "Sin imputación a cuentas de Compras", total: 10233.84 }],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("nothing declared is an empty state", async () => {
  loggedIn();
  mockApi({ "GET /iva/listado/2025?anio=2025&mes=00": EMPTY });
  expect(await iva.run(["--ejercicio", "2025"], undefined)).toEqual({ iva: "0 movimientos in 2025" });
});

test.each([
  [["--mes", "13"], "--mes must be MM"],
  [["--anio", "26"], "--anio must be AAAA"],
  [["--anio", "2026"], "--anio requires --mes"],
  [["ventas"], "unexpected argument ventas"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(iva.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
