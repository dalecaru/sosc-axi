import { describe, expect, spyOn, test } from "bun:test";
import { api } from "../src/api.ts";
import { expectAxiError, mockApi, useSandbox } from "./helpers.ts";

useSandbox();

describe("request", () => {
  test("defaults to the public base URL, GET and no auth", async () => {
    delete process.env.SOSC_API_URL;
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    await api("/cuit/listado");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.sos-contador.com/api-comunidad/cuit/listado");
    expect(init).toMatchObject({ method: "GET", body: undefined, headers: { "Content-Type": "application/json" } });
  });

  test("SOSC_API_URL override tolerates a trailing slash", async () => {
    process.env.SOSC_API_URL = "http://api.test/";
    const calls = mockApi({ "GET /x": {} });
    await api("/x");
    expect(calls[0]!.path).toBe("/x");
  });

  test("sends the bearer token and a JSON body", async () => {
    const calls = mockApi({ "POST /login": { ok: 1 } });
    expect(await api("/login", { method: "POST", token: "t", body: { a: 1 } })).toEqual({ ok: 1 });
    expect(calls[0]).toEqual({ method: "POST", path: "/login", auth: "Bearer t", body: { a: 1 } });
  });

  test("keeps non-JSON bodies as text and empty bodies as null", async () => {
    mockApi({ "GET /txt": new Response("plain"), "GET /empty": new Response("") });
    expect(await api("/txt")).toBe("plain");
    expect(await api("/empty")).toBeNull();
  });
});

describe("errors", () => {
  test("network failure is NETWORK_ERROR", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expectAxiError(api("/x"), "NETWORK_ERROR", "Could not reach the SOS Contador API (ECONNREFUSED)");
  });

  test.each([401, 403])("HTTP %d is AUTH_REQUIRED with a re-login hint for the user", async (status) => {
    mockApi({ "GET /x": Response.json({ mensaje: "token vencido" }, { status }) });
    const e = await expectAxiError(api("/x", { usuario: "ana@x.com" }), "AUTH_REQUIRED", "Not authorized: token vencido");
    expect(e.suggestions).toEqual(["Run `sosc-axi login --usuario ana@x.com --password-stdin` to refresh the session"]);
  });

  test("HTTP 200 with an error field is API_ERROR without the 'Error:' prefix", async () => {
    mockApi({ "GET /x": { error: "Error: CUIT inexistente" } });
    await expectAxiError(api("/x"), "API_ERROR", /^SOS Contador: CUIT inexistente$/);
  });

  test("non-ok status falls back to a truncated text body, then to the status", async () => {
    mockApi({ "GET /long": new Response("x".repeat(500), { status: 500 }), "GET /blank": new Response("", { status: 502 }) });
    const e = await expectAxiError(api("/long"), "API_ERROR");
    expect(e.message).toBe(`SOS Contador: ${"x".repeat(300)}`);
    await expectAxiError(api("/blank"), "API_ERROR", "SOS Contador: HTTP 502");
  });
});

test("SOSC_DEBUG logs to stderr with tokens redacted", async () => {
  process.env.SOSC_DEBUG = "1";
  const stderr = spyOn(process.stderr, "write").mockReturnValue(true);
  mockApi({ "POST /login": { jwt: "secret-jwt", jwtc: "secret-jwtc", idusuario: 1 } });
  await api("/login", { method: "POST" });
  const out = String(stderr.mock.calls[0]![0]);
  expect(out).toStartWith("[sosc-axi] POST /login -> 200\n");
  expect(out).toContain('"jwt":"<redacted>"');
  expect(out).toContain('"jwtc":"<redacted>"');
  expect(out).not.toContain("secret");
});
