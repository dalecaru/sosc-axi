import { expect, test } from "bun:test";
import { puntosventa } from "../../src/commands/puntosventa.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("lists puntos de venta with number and name", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /puntoventa/listado": {
      items: [
        { id: 3106, puntoventa: 5, nombre: "Casa central ", codactividad: "620100", ticket: "1" },
        { id: 3107, puntoventa: "2", nombre: "" },
      ],
    },
  });
  const out = (await puntosventa.run([], undefined)) as Record<string, unknown>;
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.cuit).toBe("20123456789");
  expect(out.count).toBe("2 puntos de venta");
  expect(out.puntosventa).toEqual([
    { id: "3106", numero: 5, nombre: "Casa central" },
    { id: "3107", numero: 2, nombre: "" },
  ]);
});

test("empty listing, bare array response", async () => {
  loggedIn();
  mockApi({ "GET /puntoventa/listado": [] });
  expect(await puntosventa.run([], undefined)).toEqual({ puntosventa: "0 puntos de venta" });
});

test("takes no paging flags", async () => {
  loggedIn();
  await expectAxiError(puntosventa.run(["--pagina", "2"], undefined), "VALIDATION_ERROR", "unknown flag --pagina");
});
