import { afterEach, beforeEach, expect, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Store, saveStore } from "../src/store.ts";

export const API_URL = "http://api.test";
const ENV = ["SOSC_AXI_HOME", "SOSC_API_URL", "SOSC_DEBUG", "XDG_CONFIG_HOME"];

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
    routes = {};
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

export type Call = { method: string; path: string; auth?: string; body?: unknown };
type Route = unknown | ((call: Call) => unknown);

let routes: Record<string, Route> = {};
let calls: Call[] = [];

// A real server, not a fetch stub, so api()'s GET-with-body path (node:http) is covered too.
// node:http because Bun.serve drops GET bodies.
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString();
  const call: Call = {
    method: req.method ?? "GET",
    path: req.url ?? "/",
    auth: req.headers.authorization,
    body: text ? JSON.parse(text) : undefined,
  };
  calls.push(call);
  const route = routes[`${call.method} ${call.path}`];
  const out =
    route === undefined
      ? new Response(`no mock for ${call.method} ${call.path}`, { status: 404 })
      : typeof route === "function"
        ? await route(call)
        : route;
  const response = out instanceof Response ? out : Response.json(out);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
server.unref();
const serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

/** Serves `"METHOD /path"` routes (JSON body or a Response), points SOSC_API_URL at them and records every call. */
export function mockApi(next: Record<string, Route>): Call[] {
  routes = next;
  calls = [];
  process.env.SOSC_API_URL = serverUrl;
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
