import { AxiError } from "axi-sdk-js";
import type { Account, Cuit, Store } from "./store.ts";

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
