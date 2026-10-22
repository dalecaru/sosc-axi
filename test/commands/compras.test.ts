import { expect, test } from "bun:test";
import { compras } from "../../src/commands/compras.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists purchases of the month, naming the proveedor", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /compra/listado/mes?pagina=1&registros=50": { items: [{ id: 1, clipro: { clipro: "TELECOM" } }] },
  });
  const out = (await compras.run([], undefined)) as { compras: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.compras[0]!.proveedor).toBe("TELECOM");
});

test("has no --modo flag", async () => {
  loggedIn();
  await expectAxiError(compras.run(["--modo", "facturas"], undefined), "VALIDATION_ERROR", "unknown flag --modo");
});

test("surfaces API errors", async () => {
  loggedIn();
  mockApi({ "GET /compra/listado/mes?pagina=1&registros=50": { error: "Error: Período no válido" } });
  await expectAxiError(compras.run([], undefined), "API_ERROR", "Período no válido");
});
