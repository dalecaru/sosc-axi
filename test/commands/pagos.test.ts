import { expect, test } from "bun:test";
import { pagos } from "../../src/commands/pagos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists pagos of the month, naming the proveedor, without a cae column", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /pago/listado/mes?pagina=1&registros=50": {
      items: [{ id: 1, cae: null, montototal: 10, cliente: { cuit: "30677237119", clipro: "AUTOPISTAS DEL SOL S A" } }],
    },
  });
  const out = (await pagos.run([], undefined)) as { pagos: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.pagos[0]).toEqual({
    id: "1",
    fecha: "",
    factura: "",
    proveedor: "AUTOPISTAS DEL SOL S A",
    cuit: "30677237119",
    total: 10,
  });
});

test("has no date range (the API rejects entre_fechas)", async () => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(
    pagos.run(["--desde", "2026-01-01", "--hasta", "2026-01-31"], undefined),
    "VALIDATION_ERROR",
    "unknown flag --desde",
  );
  expect(calls).toEqual([]);
});

test("view <id> shows one pago", async () => {
  loggedIn();
  mockApi({ "GET /pago/detalle/930159905": { cabecera: { clipro: "AUTOPISTAS DEL SOL S A" } } });
  const out = (await pagos.run(["view", "930159905"], undefined)) as Record<string, unknown>;
  expect(out.proveedor).toBe("AUTOPISTAS DEL SOL S A");
});
