import { expect, test } from "bun:test";
import { recibos } from "../../src/commands/recibos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists recibos of the month, naming the cliente, without a cae column", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /recibo/listado/mes?pagina=1&registros=50": {
      items: [{ id: 1, cae: null, montototal: 10, cliente: { cuit: "30677237119", clipro: "Consumidor Final" } }],
    },
  });
  const out = (await recibos.run([], undefined)) as { recibos: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.recibos[0]).toEqual({
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
    recibos.run(["--desde", "2026-01-01", "--hasta", "2026-01-31"], undefined),
    "VALIDATION_ERROR",
    "unknown flag --desde",
  );
  expect(calls).toEqual([]);
});

test("has no view (the API has no recibo detalle)", async () => {
  loggedIn();
  await expectAxiError(recibos.run(["view", "1"], undefined), "VALIDATION_ERROR", "unexpected argument");
});
