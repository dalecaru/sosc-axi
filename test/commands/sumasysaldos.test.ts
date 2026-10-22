import { expect, test } from "bun:test";
import { sumasysaldos } from "../../src/commands/sumasysaldos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const CAJA = {
  codigo: "01.01.01.001.001",
  cuenta: "Caja",
  montosaldo_ini: 21959.92,
  montodebe: 6500000,
  montohaber: 3518601.03,
  montosaldo: 2981398.97,
  montosaldo_fin: 3003358.89,
};
const BANCO = { ...CAJA, codigo: "01.01.01.003.001", cuenta: "Banco", montodebe: 0.1, montohaber: 0.2 };

test("sends each date a day later, since the API reads them one day early, and reports the range it used", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /sumasysaldos/listado/2026?fechadesde=2026-10-01&fechahasta=2026-10-01": {
      fechadesde: "2026-09-30T03:00:00.000Z",
      fechahasta: "2026-09-30T03:00:00.000Z",
      items: [CAJA, BANCO],
    },
  });
  expect(await sumasysaldos.run(["--desde", "2026-09-30", "--hasta", "2026-09-30"], undefined)).toEqual({
    cuit: "20123456789",
    sumasysaldos: "2 cuentas in 2026-09-30 to 2026-09-30",
    cuentas: [
      {
        codigo: "01.01.01.001.001",
        cuenta: "Caja",
        saldo_inicial: 21959.92,
        debe: 6500000,
        haber: 3518601.03,
        saldo: 3003358.89,
      },
      {
        codigo: "01.01.01.003.001",
        cuenta: "Banco",
        saldo_inicial: 21959.92,
        debe: 0.1,
        haber: 0.2,
        saldo: 3003358.89,
      },
    ],
    totales: { debe: 6500000.1, haber: 3518601.23 },
    help: ["Run `sosc-axi mayor <codigo>` for the movements of one cuenta"],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("--ejercicio covers the whole year, crossing into the next for the last day", async () => {
  loggedIn();
  mockApi({
    "GET /sumasysaldos/listado/2025?fechadesde=2025-01-02&fechahasta=2026-01-01": { items: [] },
  });
  expect(await sumasysaldos.run(["--ejercicio", "2025"], undefined)).toEqual({
    sumasysaldos: "0 cuentas with movements in 2025-01-01 to 2025-12-31",
  });
});

test("ejercicio defaults to the year of --hasta, else this year", async () => {
  loggedIn();
  const year = new Date().getFullYear();
  mockApi({
    "GET /sumasysaldos/listado/2024?fechadesde=2024-01-02&fechahasta=2024-03-01": { items: [] },
    [`GET /sumasysaldos/listado/${year}?fechadesde=${year}-01-02&fechahasta=${year + 1}-01-01`]: { items: [] },
  });
  expect(await sumasysaldos.run(["--hasta", "2024-02-29"], undefined)).toEqual({
    sumasysaldos: "0 cuentas with movements in 2024-01-01 to 2024-02-29",
  });
  expect(await sumasysaldos.run([], undefined)).toEqual({
    sumasysaldos: `0 cuentas with movements in ${year}-01-01 to ${year}-12-31`,
  });
});

test.each([
  [["--desde", "2026-02-30"], "--desde must be AAAA-MM-DD"],
  [["--hasta", "x"], "--hasta must be AAAA-MM-DD"],
  [["--ejercicio", "26"], "--ejercicio must be AAAA"],
  [["--mes", "09"], "unknown flag --mes"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(sumasysaldos.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
