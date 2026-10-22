import { expect, test } from "bun:test";
import { productos } from "../../src/commands/productos.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists productos with price, IVA rate and unit", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /producto/listado?pagina=1&registros=50": {
      items: [
        { id: 63, codigo: "1234", producto: "Tornillo ", precio1: "10.5", tasaiva: 21, unidad: "unidades" },
        { id: 64, producto: "Servicio" },
      ],
    },
  });
  const out = (await productos.run([], undefined)) as Record<string, unknown>;
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.cuit).toBe("20123456789");
  expect(out.count).toBe("2 productos, page 1");
  expect(out.productos).toEqual([
    { id: "63", codigo: "1234", producto: "Tornillo", precio: 10.5, iva: 21, unidad: "unidades" },
    { id: "64", codigo: "", producto: "Servicio", precio: 0, iva: 0, unidad: "" },
  ]);
});

test("pages, hinting the next page when this one is full", async () => {
  loggedIn();
  mockApi({ "GET /producto/listado?pagina=2&registros=1": [{ id: 1, producto: "A" }] });
  const out = (await productos.run(["--pagina", "2", "--registros", "1"], undefined)) as Record<string, unknown>;
  expect(out.help).toEqual(["Run with `--pagina 3` for more"]);
});

test("empty listing", async () => {
  loggedIn();
  mockApi({
    "GET /producto/listado?pagina=1&registros=50": { items: [] },
    "GET /producto/listado?pagina=2&registros=50": { items: [] },
  });
  expect(await productos.run([], undefined)).toEqual({ productos: "0 productos" });
  expect(await productos.run(["--pagina", "2"], undefined)).toEqual({ productos: "0 productos on page 2" });
});

test("rejects unknown flags", async () => {
  loggedIn();
  await expectAxiError(productos.run(["--buscar", "x"], undefined), "VALIDATION_ERROR", "unknown flag --buscar");
});
