import { expect, test } from "bun:test";
import { cuentas } from "../../src/commands/cuentas.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists cuentas with code, name and rubro, skipping rubro headings", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /cuentacontable/listado": {
      items: [
        { id: null, rubro: "01.01.01.", arbol: "01.01.01.000", cuenta: null },
        {
          id: 14389570,
          rubro: "01.01.01.003.Banco",
          arbol: "01.01.01.003.001",
          cuenta: "01.01.01.003.001 Banco Galicia Cta.Cte.Pesos",
        },
      ],
    },
  });
  expect(await cuentas.run([], undefined)).toEqual({
    cuit: "20123456789",
    count: "1 cuentas",
    cuentas: [{ id: "14389570", codigo: "01.01.01.003.001", cuenta: "Banco Galicia Cta.Cte.Pesos", rubro: "Banco" }],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("empty chart", async () => {
  loggedIn();
  mockApi({ "GET /cuentacontable/listado": { items: [{ id: null }] } });
  expect(await cuentas.run([], undefined)).toEqual({ cuentas: "0 cuentas" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(cuentas.run(["Caja"], undefined), "VALIDATION_ERROR");
});
