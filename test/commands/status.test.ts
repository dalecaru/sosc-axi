import { expect, test } from "bun:test";
import { status } from "../../src/commands/status.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = (cuit?: string, jwtc?: string) =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit, cuits: [{ id: "11", cuit: "20123456789", nombre: "Ana", jwtc }] } },
  });

test("checks the user token and the active CUIT token", async () => {
  loggedIn("11", "jwtc-11");
  const calls = mockApi({ "GET /cuit/listado": { items: [] }, "GET /cuit/parametros": {} });
  expect(await status.run([], undefined)).toEqual({
    usuario: "ana@x.com",
    session: "connected",
    cuit: "20123456789 (Ana) connected",
  });
  expect(calls.map((c) => [c.path, c.auth])).toEqual([
    ["/cuit/listado", "Bearer u"],
    ["/cuit/parametros", "Bearer jwtc-11"],
  ]);
});

test("fetches missing CUIT credentials first", async () => {
  loggedIn("11");
  const calls = mockApi({
    "GET /cuit/listado": { items: [] },
    "GET /cuit/credentials/11": { jwt: "fresh" },
    "GET /cuit/parametros": {},
  });
  await status.run([], undefined);
  expect(calls.at(-1)!.auth).toBe("Bearer fresh");
});

test("no active CUIT points at cuits use", async () => {
  loggedIn();
  mockApi({ "GET /cuit/listado": { items: [] } });
  expect(await status.run([], undefined)).toMatchObject({ cuit: "none selected" });
});

test("not logged in is AUTH_REQUIRED asking the user to log in", async () => {
  const e = await expectAxiError(status.run([], undefined), "AUTH_REQUIRED");
  expect(e.suggestions[0]).toContain("Ask the user to run `sosc-axi login`");
});

test("rejected session is AUTH_REQUIRED", async () => {
  loggedIn("11", "jwtc-11");
  mockApi({ "GET /cuit/listado": new Response("", { status: 401 }) });
  await expectAxiError(status.run([], undefined), "AUTH_REQUIRED");
});
