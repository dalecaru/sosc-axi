import { expect, test } from "bun:test";
import { indices } from "../../src/commands/indices.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists índices de ajuste", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /indiceaniomes/listado": {
      items: [
        { id: 413, idindice: 1, anio: 2025, mes: 10, indice: 9603.8623, axic: "Sí", axii: "Sí. Mayor al 15%" },
        { id: 405, idindice: 1, anio: 2025, mes: 2, indice: "8000.5", axic: "No", axii: "No" },
      ],
    },
  });
  expect(await indices.run([], undefined)).toEqual({
    count: "2 indices",
    indices: [
      { periodo: "2025-10", indice: 9603.8623, axic: "Sí", axii: "Sí. Mayor al 15%" },
      { periodo: "2025-02", indice: 8000.5, axic: "No", axii: "No" },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("empty listing", async () => {
  loggedIn();
  mockApi({ "GET /indiceaniomes/listado": {} });
  expect(await indices.run([], undefined)).toEqual({ indices: "0 indices" });
});

test("takes no extra flags", async () => {
  loggedIn();
  await expectAxiError(indices.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
