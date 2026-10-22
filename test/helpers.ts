import { afterEach, beforeEach, expect, mock, spyOn } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Store, saveStore } from "../src/store.ts";

export const API_URL = "http://api.test";
const ENV = ["SOSC_AXI_HOME", "SOSC_API_URL", "SOSC_USERNAME", "SOSC_PASSWORD", "SOSC_DEBUG", "XDG_CONFIG_HOME"];

/** Per test: empty temp store, fake API base URL, no credentials leaking in from the shell. */
export function useSandbox() {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.SOSC_AXI_HOME = mkdtempSync(join(tmpdir(), "sosc-axi-"));
    process.env.SOSC_API_URL = API_URL;
  });
  afterEach(() => {
    mock.restore();
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

export type Call = { method: string; path: string; auth?: string; body?: unknown };
type Route = unknown | ((call: Call) => unknown);

/** Stubs fetch with `"METHOD /path"` routes (JSON body or a Response) and records every call. */
export function mockApi(routes: Record<string, Route>): Call[] {
  const calls: Call[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init?.method ?? "GET",
      path: String(input).replace(API_URL, ""),
      auth: headers.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const route = routes[`${call.method} ${call.path}`];
    if (route === undefined) return new Response(`no mock for ${call.method} ${call.path}`, { status: 404 });
    const out = typeof route === "function" ? await route(call) : route;
    return out instanceof Response ? out : Response.json(out);
  }) as typeof fetch);
  return calls;
}

/** Unsigned JWT with the given claims (the CLI only decodes, never verifies). */
export const jwt = (claims: Record<string, unknown> = {}) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

export const seed = (store: Store) => saveStore(store);

export async function expectAxiError(result: unknown, code: string, message?: string | RegExp) {
  const error = await Promise.resolve(result).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toMatchObject({ name: "AxiError", code });
  if (message) expect((error as Error).message).toMatch(message);
  return error as Error & { suggestions: string[] };
}
