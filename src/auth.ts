import { AxiError } from "axi-sdk-js";
import { api } from "./api.ts";
import { type Account, type Cuit, type Store, saveStore } from "./store.ts";

export const LOGIN_HINT =
  "Run `sosc-axi login --usuario <email> --password-stdin` (password on stdin, or set SOSC_PASSWORD)";

/** The account selected by --usuario, or the default one. */
export function resolveAccount(store: Store, usuario?: string): [string, Account] {
  const name = usuario ?? store.default;
  const account = name ? store.accounts[name] : undefined;
  if (!name || !account) {
    throw new AxiError(name ? `${name} is not logged in` : "No SOS Contador account is logged in", "AUTH_REQUIRED", [
      name ? `Run \`sosc-axi login --usuario ${name} --password-stdin\`` : LOGIN_HINT,
    ]);
  }
  return [name, account];
}

// The API docs publish no response schemas. CUIT entries are found by shape:
// any object carrying a `cuit` plus an `idcuit`/`id`.
export function findCuits(payload: unknown): Cuit[] {
  const found = new Map<string, Cuit>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const id = o.idcuit ?? o.id_cuit ?? o.id;
    if (o.cuit != null && id != null && String(o.cuit).replace(/\D/g, "").length >= 8) {
      const nombre = o.razonsocial ?? o.razon_social ?? o.nombre;
      found.set(String(id), {
        id: String(id),
        cuit: String(o.cuit),
        nombre: nombre ? String(nombre).trim() : undefined,
      });
    }
    Object.values(o).forEach(walk);
  };
  walk(payload);
  return [...found.values()];
}

export function token(payload: unknown, keys: string[]): string | undefined {
  if (typeof payload !== "object" || !payload) return undefined;
  for (const k of keys) {
    const v = (payload as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v.replace(/^bearer\s+/i, "");
  }
}

export const cuitRows = (cuits: Cuit[], active?: string) =>
  cuits.map((c) => ({ id: c.id, cuit: c.cuit, nombre: c.nombre ?? "", active: c.id === active ? "*" : "" }));

/** Fetches the per-CUIT token (jwtc) with the user token and caches it on the CUIT. */
export async function fetchCuitToken(account: Account, cuit: Cuit, usuario: string): Promise<string> {
  const res = await api(`/cuit/credentials/${encodeURIComponent(cuit.id)}`, { token: account.jwt, usuario });
  const jwtc = token(res, ["jwtc", "jwt", "token"]);
  if (!jwtc) throw new AxiError(`SOS Contador returned no credentials for CUIT ${cuit.cuit}`, "API_ERROR");
  cuit.jwtc = jwtc;
  return jwtc;
}

/** The account's active CUIT and its token, for business endpoints (`cuitJwt` in the spec). */
export async function activeCuit(store: Store, usuario?: string): Promise<[string, Cuit, string]> {
  const [name, account] = resolveAccount(store, usuario);
  const cuit = account.cuits.find((c) => c.id === account.cuit);
  if (!cuit) {
    throw new AxiError(`No active CUIT for ${name}`, "VALIDATION_ERROR", [
      "Run `sosc-axi cuits use <id|cuit>` to select the CUIT to work with",
    ]);
  }
  if (!cuit.jwtc) {
    await fetchCuitToken(account, cuit, name);
    saveStore(store);
  }
  return [name, cuit, cuit.jwtc!];
}
