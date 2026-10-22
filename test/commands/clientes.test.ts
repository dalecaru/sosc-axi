import { expect, test } from "bun:test";
import { clientes } from "../../src/commands/clientes.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists clientes and proveedores by default", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /cliente/listado?pagina=1&registros=50&cliente=true&proveedor=true": {
      paginas: 1,
      items: [
        { id: 7, cuit: "30500001735", clipro: " Banco de Galicia ", idcondicioniva: 1 },
        { id: 8, cuit: "20111111112", clipro: "Juan" },
      ],
    },
  });
  const out = (await clientes.run([], undefined)) as Record<string, unknown>;
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.cuit).toBe("20123456789");
  expect(out.count).toBe("2 clientes, page 1 of 1");
  expect(out.clientes).toEqual([
    { id: "7", cuit: "30500001735", nombre: "Banco de Galicia" },
    { id: "8", cuit: "20111111112", nombre: "Juan" },
  ]);
  expect(out.help).toBeUndefined();
});

test("--tipo proveedor asks only for proveedores and labels them so", async () => {
  loggedIn();
  mockApi({
    "GET /cliente/listado?pagina=2&registros=50&proveedor=true": {
      paginas: 3,
      items: [{ id: 9, cuit: "1", clipro: "Acme" }],
    },
  });
  const out = (await clientes.run(["--tipo", "proveedor", "--pagina", "2"], undefined)) as Record<string, unknown>;
  expect(out.clientes).toEqual([{ id: "9", cuit: "1", nombre: "Acme", tipo: "proveedor" }]);
  expect(out.count).toBe("1 proveedores, page 2 of 3");
  expect(out.help).toEqual(["Run with `--pagina 3` for more"]);
});

test("--tipo cliente asks only for clientes", async () => {
  loggedIn();
  const calls = mockApi({ "GET /cliente/listado?pagina=1&registros=50&cliente=true": { items: [] } });
  expect(await clientes.run(["--tipo", "cliente"], undefined)).toEqual({ clientes: "0 clientes" });
  expect(calls).toHaveLength(1);
});

test("an empty later page says so", async () => {
  loggedIn();
  mockApi({ "GET /cliente/listado?pagina=4&registros=50&cliente=true&proveedor=true": {} });
  expect(await clientes.run(["--pagina", "4"], undefined)).toEqual({ clientes: "0 clientes on page 4" });
});

test("rejects a bad --tipo or --pagina before calling the API", async () => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(clientes.run(["--tipo", "ambos"], undefined), "VALIDATION_ERROR", "--tipo must be one of");
  await expectAxiError(clientes.run(["--pagina", "0"], undefined), "VALIDATION_ERROR", "--pagina must be");
  expect(calls).toEqual([]);
});
