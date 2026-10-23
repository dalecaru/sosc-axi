import { expect, test } from "bun:test";
import { productos } from "../../src/commands/productos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists productos with price and IVA rate (the API names no unit, only idunidad)", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /producto/listado": {
      items: [
        { id: 63, codigo: "1234", producto: "Tornillo ", precio1: "10.5", tasaiva: 21, idunidad: 7 },
        { id: 64, producto: "Servicio" },
      ],
    },
  });
  const out = (await productos.run([], undefined)) as Record<string, unknown>;
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.cuit).toBe("20123456789");
  expect(out.count).toBe("2 productos");
  expect(out.help).toBeUndefined();
  expect(out.productos).toEqual([
    { id: "63", codigo: "1234", producto: "Tornillo", precio: 10.5, iva: 21 },
    { id: "64", codigo: "", producto: "Servicio", precio: 0, iva: 0 },
  ]);
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /producto/listado": { items: [] } });
  expect(await productos.run([], undefined)).toEqual({ productos: "0 productos" });
});

test("rejects --pagina and --registros: the API ignores both and returns the whole catalog", async () => {
  loggedIn();
  await expectAxiError(productos.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
  await expectAxiError(productos.run(["--registros", "5"], undefined), "VALIDATION_ERROR", "unknown flag --registros");
});

test("rejects unknown flags", async () => {
  loggedIn();
  await expectAxiError(productos.run(["--buscar", "x"], undefined), "VALIDATION_ERROR", "unknown flag --buscar");
});
