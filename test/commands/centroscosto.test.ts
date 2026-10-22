import { expect, test } from "bun:test";
import { centroscosto } from "../../src/commands/centroscosto.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists centros de costo", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /centrocosto/listado": {
      items: [
        { id: 51106, centrocosto: "General " },
        { id: 208659, centrocosto: "Proyecto" },
      ],
    },
  });
  expect(await centroscosto.run([], undefined)).toEqual({
    cuit: "20123456789",
    count: "2 centros de costo",
    centroscosto: [
      { id: "51106", centrocosto: "General" },
      { id: "208659", centrocosto: "Proyecto" },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /centrocosto/listado": {} });
  expect(await centroscosto.run([], undefined)).toEqual({ centroscosto: "0 centros de costo" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(centroscosto.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
