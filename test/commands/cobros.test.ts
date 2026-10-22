import { expect, test } from "bun:test";
import { cobros } from "../../src/commands/cobros.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists cobros of the month, naming the cliente, without a cae column", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /cobro/listado/mes?pagina=1&registros=50": {
      items: [{ id: 1, cae: null, montototal: 10, cliente: { cuit: "30677237119", clipro: "Consumidor Final" } }],
    },
  });
  const out = (await cobros.run([], undefined)) as { cobros: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.cobros[0]).toEqual({
    id: "1",
    fecha: "",
    factura: "",
    cliente: "Consumidor Final",
    cuit: "30677237119",
    total: 10,
  });
});

test("has no date range (the API rejects entre_fechas)", async () => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(
    cobros.run(["--desde", "2026-01-01", "--hasta", "2026-01-31"], undefined),
    "VALIDATION_ERROR",
    "unknown flag --desde",
  );
  expect(calls).toEqual([]);
});

test("view <id> reads /pago/detalle (the API's /cobro/detalle is broken)", async () => {
  loggedIn();
  mockApi({ "GET /pago/detalle/945761326": { cabecera: { clipro: "Consumidor Final", letra: "R", numero: 4900 } } });
  const out = (await cobros.run(["view", "945761326"], undefined)) as Record<string, unknown>;
  expect(out.cliente).toBe("Consumidor Final");
  expect(out.factura).toBe("R-0000-00004900");
});

test("view of an unknown id is NOT_FOUND", async () => {
  loggedIn();
  mockApi({ "GET /pago/detalle/1": { error: "Error: Imposible cargar detalles del cobro/pago" } });
  await expectAxiError(cobros.run(["view", "1"], undefined), "NOT_FOUND", "cobros 1 not found");
});
