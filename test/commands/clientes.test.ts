import { expect, test } from "bun:test";
import { clientes } from "../../src/commands/clientes.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists clientes and proveedores by default, labeling each row's tipo", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /cliente/listado?pagina=1&registros=50&cliente=true&proveedor=true": {
      paginas: 1,
      items: [
        { id: 7, cuit: "30500001735", clipro: " Banco de Galicia ", idcondicioniva: 1 },
        { id: 8, cuit: "20111111112", clipro: "Juan" },
      ],
    },
    "GET /cliente/listado?pagina=1&registros=500&cliente=true": { paginas: 1, items: [{ id: 8 }] },
    "GET /cliente/listado?pagina=1&registros=500&proveedor=true": { paginas: 1, items: [{ id: 7 }] },
  });
  const out = (await clientes.run([], undefined)) as Record<string, unknown>;
  expect(calls.map((c) => c.auth)).toEqual(["Bearer jwtc-11", "Bearer jwtc-11", "Bearer jwtc-11"]);
  expect(out.cuit).toBe("20123456789");
  expect(out.count).toBe("2 clientes, page 1 of 1");
  expect(out.clientes).toEqual([
    { id: "7", cuit: "30500001735", nombre: "Banco de Galicia", tipo: "proveedor" },
    { id: "8", cuit: "20111111112", nombre: "Juan", tipo: "cliente" },
  ]);
  expect(out.help).toBeUndefined();
});

test("labels ambos for ids in both lists, even when they sit on different pages", async () => {
  loggedIn();
  mockApi({
    "GET /cliente/listado?pagina=2&registros=2&cliente=true&proveedor=true": {
      paginas: 2,
      items: [
        { id: 3, cuit: "1", clipro: "Both" },
        { id: 4, cuit: "2", clipro: "Prov" },
      ],
    },
    "GET /cliente/listado?pagina=1&registros=500&cliente=true": { paginas: 2, items: [{ id: 1 }] },
    "GET /cliente/listado?pagina=2&registros=500&cliente=true": { paginas: 2, items: [{ id: 3 }] },
    "GET /cliente/listado?pagina=1&registros=500&proveedor=true": { paginas: 1, items: [{ id: 3 }, { id: 4 }] },
  });
  const out = (await clientes.run(["--pagina", "2", "--registros", "2"], undefined)) as Record<string, unknown>;
  expect(out.clientes).toEqual([
    { id: "3", cuit: "1", nombre: "Both", tipo: "ambos" },
    { id: "4", cuit: "2", nombre: "Prov", tipo: "proveedor" },
  ]);
});

test("stops paging a side list at its first empty page, whatever paginas claims", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /cliente/listado?pagina=1&registros=50&cliente=true&proveedor=true": {
      paginas: 1,
      items: [{ id: 5, cuit: "1", clipro: "Ana" }],
    },
    "GET /cliente/listado?pagina=1&registros=500&cliente=true": { paginas: 1e9, items: [{ id: 5 }] },
    "GET /cliente/listado?pagina=2&registros=500&cliente=true": { paginas: 1e9, items: [] },
    "GET /cliente/listado?pagina=1&registros=500&proveedor=true": { paginas: 1, items: [] },
  });
  const out = (await clientes.run([], undefined)) as Record<string, unknown>;
  expect(out.clientes).toEqual([{ id: "5", cuit: "1", nombre: "Ana", tipo: "cliente" }]);
  expect(calls).toHaveLength(4);
});

test("fails instead of guessing a tipo for a row in neither side list", async () => {
  loggedIn();
  mockApi({
    "GET /cliente/listado?pagina=1&registros=50&cliente=true&proveedor=true": {
      paginas: 1,
      items: [{ id: 5, cuit: "1", clipro: "Gone" }],
    },
    "GET /cliente/listado?pagina=1&registros=500&cliente=true": { paginas: 1, items: [{ id: 6 }] },
    "GET /cliente/listado?pagina=1&registros=500&proveedor=true": { paginas: 1, items: [{ id: 7 }] },
  });
  const error = await expectAxiError(clientes.run([], undefined), "API_ERROR", "neither");
  expect(error.suggestions.join()).toContain("--tipo");
});

test("gives up after 50 pages of a side list instead of mislabeling rows", async () => {
  loggedIn();
  const endless = Object.fromEntries(
    Array.from({ length: 51 }, (_, i) => [
      `GET /cliente/listado?pagina=${i + 1}&registros=500&cliente=true`,
      { paginas: 1e9, items: [{ id: i }] },
    ]),
  );
  const calls = mockApi({
    "GET /cliente/listado?pagina=1&registros=50&cliente=true&proveedor=true": {
      paginas: 1,
      items: [{ id: 5, cuit: "1", clipro: "Ana" }],
    },
    "GET /cliente/listado?pagina=1&registros=500&proveedor=true": { paginas: 1, items: [] },
    ...endless,
  });
  const error = await expectAxiError(clientes.run([], undefined), "API_ERROR", "more than 50 pages");
  expect(error.suggestions.join()).toContain("--tipo");
  expect(calls.filter((c) => c.path.endsWith("registros=500&cliente=true"))).toHaveLength(50);
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

test("an empty --tipo proveedor listing says no proveedores", async () => {
  loggedIn();
  mockApi({ "GET /cliente/listado?pagina=1&registros=50&proveedor=true": { paginas: 0, items: [] } });
  expect(await clientes.run(["--tipo", "proveedor"], undefined)).toEqual({ clientes: "0 proveedores" });
});

test("an empty later --tipo proveedor page says no proveedores", async () => {
  loggedIn();
  mockApi({ "GET /cliente/listado?pagina=4&registros=50&proveedor=true": { paginas: 3, items: [] } });
  expect(await clientes.run(["--tipo", "proveedor", "--pagina", "4"], undefined)).toEqual({
    clientes: "0 proveedores on page 4",
  });
});

test("rejects a bad --tipo or --pagina before calling the API", async () => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(clientes.run(["--tipo", "ambos"], undefined), "VALIDATION_ERROR", "--tipo must be one of");
  await expectAxiError(clientes.run(["--pagina", "0"], undefined), "VALIDATION_ERROR", "--pagina must be");
  expect(calls).toEqual([]);
});
