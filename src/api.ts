import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { AxiError } from "axi-sdk-js";
import { loginHint } from "./auth.ts";

const BASE = "https://api.sos-contador.com/api-comunidad";

export type RequestOptions = { method?: string; token?: string; body?: unknown; usuario?: string };

/** Calls the SOS Contador API and returns parsed JSON, translating failures into AxiErrors. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = (process.env.SOSC_API_URL || BASE).replace(/\/$/, "") + path;
  const method = opts.method ?? "GET";
  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  };
  let res: Response;
  try {
    res = await (method === "GET" && init.body !== undefined ? getWithBody(url, init) : fetch(url, init));
  } catch (error) {
    throw new AxiError(`Could not reach the SOS Contador API (${(error as Error).message})`, "NETWORK_ERROR", [
      "Check the network connection and retry",
    ]);
  }

  const raw = await res.text();
  let data: unknown = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // non-JSON body, keep raw text
  }
  if (process.env.SOSC_DEBUG) {
    process.stderr.write(`[sosc-axi] ${method} ${path} -> ${res.status}\n${redact(raw)}\n`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new AxiError(`Not authorized: ${apiMessage(data) ?? `HTTP ${res.status}`}`, "AUTH_REQUIRED", [
      loginHint(opts.usuario),
    ]);
  }
  // The API reports most failures as HTTP 200 with {"error": "Error: ..."}.
  const bodyError = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string";
  if (!res.ok || bodyError) {
    throw new AxiError(`SOS Contador: ${apiMessage(data) ?? `HTTP ${res.status}`}`, "API_ERROR");
  }
  return data as T;
}

/** fetch refuses a body on GET, but /cuentacorriente/listado only reads its filters from one. */
function getWithBody(url: string, init: { headers: Record<string, string>; body?: string }): Promise<Response> {
  const body = init.body ?? "";
  const headers = { ...init.headers, "Content-Length": String(Buffer.byteLength(body)) };
  return new Promise((resolve, reject) => {
    const send = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = send(url, { method: "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        resolve(new Response(text || null, { status: res.statusCode }));
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function apiMessage(data: unknown): string | undefined {
  if (typeof data === "string") return data.trim().slice(0, 300) || undefined;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const msg = d.mensaje ?? d.message ?? d.error ?? d.msg;
    if (typeof msg === "string") return msg.replace(/^error:\s*/i, "");
  }
  return undefined;
}

const redact = (s: string) => s.replace(/("jwtc?"\s*:\s*")[^"]+/gi, "$1<redacted>");
