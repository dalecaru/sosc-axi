import { AxiError } from "axi-sdk-js";

const BASE = "https://api.sos-contador.com/api-comunidad";

export type RequestOptions = { method?: string; token?: string; body?: unknown; usuario?: string };

/** Calls the SOS Contador API and returns parsed JSON, translating failures into AxiErrors. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = (process.env.SOSC_API_URL || BASE).replace(/\/$/, "") + path;
  const method = opts.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
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
    const who = opts.usuario ?? "<usuario>";
    throw new AxiError(`Not authorized: ${apiMessage(data) ?? `HTTP ${res.status}`}`, "AUTH_REQUIRED", [
      `Run \`sosc-axi login --usuario ${who} --password-stdin\` to refresh the session`,
    ]);
  }
  // The API reports most failures as HTTP 200 with {"error": "Error: ..."}.
  const bodyError = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string";
  if (!res.ok || bodyError) {
    throw new AxiError(`SOS Contador: ${apiMessage(data) ?? `HTTP ${res.status}`}`, "API_ERROR");
  }
  return data as T;
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
