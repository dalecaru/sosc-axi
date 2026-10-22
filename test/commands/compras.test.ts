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

test("filters search /compra/consulta by proveedor and tipo R", async () => {
  loggedIn();
  const calls = mockApi({ "POST /compra/consulta?pagina=1&registros=50": { items: [{ id: 1 }] } });
  await compras.run(
    ["--proveedor", "8769368", "--tipo", "R", "--desde", "2026-01-01", "--hasta", "2026-01-31"],
    undefined,
  );
  expect(calls[0]!.body).toMatchObject({ idclipro: [8769368], tipo_factura: ["R"] });
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

test("view <id> shows one compra", async () => {
  loggedIn();
  mockApi({ "GET /compra/detalle/931760031": { cabecera: { clipro: "X" } } });
  const out = (await compras.run(["view", "931760031"], undefined)) as Record<string, unknown>;
  expect(out.proveedor).toBe("X");
});
