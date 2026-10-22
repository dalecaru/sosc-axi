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

  test("sends a GET with a JSON body (fetch refuses one) through the same error handling", async () => {
    const calls = mockApi({
      "GET /cc": { items: [1] },
      "GET /cc-error": { error: "Error: Invalid date" },
      "GET /cc-empty": new Response(null, { status: 204 }),
    });
    expect(await api("/cc", { token: "t", body: { CP: "C" } })).toEqual({ items: [1] });
    expect(calls[0]).toEqual({ method: "GET", path: "/cc", auth: "Bearer t", body: { CP: "C" } });
    await expectAxiError(api("/cc-error", { body: {} }), "API_ERROR", "SOS Contador: Invalid date");
    expect(await api("/cc-empty", { body: {} })).toBeNull();
  });

  test("GET with a body reports an unreachable API as NETWORK_ERROR", async () => {
    process.env.SOSC_API_URL = "http://127.0.0.1:9";
    await expectAxiError(api("/cc", { body: {} }), "NETWORK_ERROR", "Could not reach the SOS Contador API");
  });

  test("keeps non-JSON bodies as text and empty bodies as null", async () => {
    mockApi({ "GET /txt": new Response("plain"), "GET /empty": new Response("") });
    expect(await api("/txt")).toBe("plain");
    expect(await api("/empty")).toBeNull();
  });

  test("binary returns non-JSON bodies as bytes, still parsing JSON and errors", async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0xe2]);
    mockApi({ "GET /pdf": new Response(pdf), "GET /json": { a: 1 }, "GET /err": { error: "Error: no existe" } });
    expect(await api("/pdf", { binary: true })).toEqual(pdf);
    expect(await api("/json", { binary: true })).toEqual({ a: 1 });
    await expectAxiError(api("/err", { binary: true }), "API_ERROR", "no existe");
  });
});

describe("errors", () => {
  test("network failure is NETWORK_ERROR", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expectAxiError(api("/x"), "NETWORK_ERROR", "Could not reach the SOS Contador API (ECONNREFUSED)");
  });

  test.each([401, 403])("HTTP %d is AUTH_REQUIRED with a re-login hint for the user", async (status) => {
    mockApi({ "GET /x": Response.json({ mensaje: "token vencido" }, { status }) });
    const e = await expectAxiError(
      api("/x", { usuario: "ana@x.com" }),
      "AUTH_REQUIRED",
      "Not authorized: token vencido",
    );
    expect(e.suggestions).toEqual([
      "Ask the user to run `sosc-axi login --usuario ana@x.com` in their own terminal (it prompts for the password)",
    ]);
  });

  test("HTTP 200 with an error field is API_ERROR without the 'Error:' prefix", async () => {
    mockApi({ "GET /x": { error: "Error: CUIT inexistente" } });
    await expectAxiError(api("/x"), "API_ERROR", /^SOS Contador: CUIT inexistente$/);
  });

  test("non-ok status falls back to a truncated text body, then to the status", async () => {
    mockApi({
      "GET /long": new Response("x".repeat(500), { status: 500 }),
      "GET /blank": new Response("", { status: 502 }),
    });
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

test("SOSC_DEBUG logs binary bodies by size only", async () => {
  process.env.SOSC_DEBUG = "1";
  const stderr = spyOn(process.stderr, "write").mockReturnValue(true);
  mockApi({ "GET /pdf": new Response("%PDF-1.4 bytes") });
  await api("/pdf", { binary: true });
  expect(String(stderr.mock.calls[0]![0])).toBe("[sosc-axi] GET /pdf -> 200\n<14 bytes>\n");
});

test("SOSC_DEBUG logs a JSON answer to a binary request by size only", async () => {
  process.env.SOSC_DEBUG = "1";
  const stderr = spyOn(process.stderr, "write").mockReturnValue(true);
  mockApi({ "GET /pdf": { error: "Error: secret detail" } });
  await expectAxiError(api("/pdf", { binary: true }), "API_ERROR", "secret detail");
  expect(String(stderr.mock.calls[0]![0])).toBe("[sosc-axi] GET /pdf -> 200\n<32 bytes>\n");
});
