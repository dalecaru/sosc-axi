import { expect, test } from "bun:test";
import { ventas } from "../../src/commands/ventas.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("defaults to facturas of the month, all CAE states, naming the cliente", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /venta/listado/facturas/mes/todas?pagina=1&registros=50": { items: [{ id: 1, clipro: { clipro: "CF" } }] },
  });
  const out = (await ventas.run([], undefined)) as { ventas: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.ventas[0]!.cliente).toBe("CF");
});

test("--modo and --cae go in the path", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /venta/listado/notascredito/mes_anterior/sincae?pagina=1&registros=50": { items: [] },
  });
  expect(
    await ventas.run(["--modo", "notascredito", "--cae", "sincae", "--periodo", "mes_anterior"], undefined),
  ).toEqual({ ventas: "0 ventas in mes_anterior" });
  expect(calls).toHaveLength(1);
});

test("invalid --modo / --cae are validation errors", async () => {
  loggedIn();
  mockApi({});
  await expectAxiError(ventas.run(["--modo", "x"], undefined), "VALIDATION_ERROR", "--modo must be one of");
  await expectAxiError(ventas.run(["--cae", "x"], undefined), "VALIDATION_ERROR", "--cae must be one of");
});

test("requires an active CUIT", async () => {
  seed({ default: "ana@x.com", accounts: { "ana@x.com": { jwt: "u", cuits: [] } } });
  await expectAxiError(ventas.run([], undefined), "VALIDATION_ERROR", "No active CUIT");
});
