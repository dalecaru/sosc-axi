import { AxiError } from "axi-sdk-js";
import { api } from "./api.ts";
import { parse } from "./args.ts";
import { type Account, type Cuit, type Store, loadStore, saveStore, tokenStatus } from "./store.ts";

const LOGIN_HINT = "Run `sosc-axi login --usuario <email> --password-stdin` (password on stdin, or set SOSC_PASSWORD)";

/** The account selected by --usuario, or the default one. */
export function resolveAccount(store: Store, usuario?: string): [string, Account] {
  const name = usuario ?? store.default;
  const account = name ? store.accounts[name] : undefined;
  if (!name || !account) {
    throw new AxiError(
      name ? `${name} is not logged in` : "No SOS Contador account is logged in",
      "AUTH_REQUIRED",
      [name ? `Run \`sosc-axi login --usuario ${name} --password-stdin\`` : LOGIN_HINT],
    );
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
      found.set(String(id), { id: String(id), cuit: String(o.cuit), nombre: nombre ? String(nombre).trim() : undefined });
    }
    Object.values(o).forEach(walk);
  };
  walk(payload);
  return [...found.values()];
}

function token(payload: unknown, keys: string[]): string | undefined {
  if (typeof payload !== "object" || !payload) return undefined;
  for (const k of keys) {
    const v = (payload as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v.replace(/^bearer\s+/i, "");
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

const cuitRows = (cuits: Cuit[], active?: string) =>
  cuits.map((c) => ({ id: c.id, cuit: c.cuit, nombre: c.nombre ?? "", active: c.id === active ? "*" : "" }));

export async function login(args: string[]) {
  const { values } = parse("login", args, { usuario: { type: "string" }, "password-stdin": { type: "boolean" } });
  const usuario = values.usuario ?? process.env.SOSC_USERNAME;
  if (!usuario) {
    throw new AxiError("--usuario is required", "VALIDATION_ERROR", [
      "sosc-axi login --usuario <email> --password-stdin",
    ]);
  }
  const password = values["password-stdin"] ? await readStdin() : process.env.SOSC_PASSWORD;
  if (!password) {
    throw new AxiError("No password provided", "VALIDATION_ERROR", [
      `printf '%s' "$PASSWORD" | sosc-axi login --usuario ${usuario} --password-stdin`,
      "Or set SOSC_PASSWORD in the environment",
    ]);
  }

  const res = await api("/login", { method: "POST", body: { usuario, password }, usuario });
  const jwt = token(res, ["jwt", "token"]);
  if (!jwt) throw new AxiError("Login failed: invalid usuario or password", "AUTH_REQUIRED", [LOGIN_HINT]);

  const listed = findCuits(await api("/cuit/listado", { token: jwt, usuario }));
  const cuits = listed.length ? listed : findCuits(res);

  const store = loadStore();
  const prev = store.accounts[usuario];
  const keep = prev?.cuit && cuits.some((c) => c.id === prev.cuit) ? prev.cuit : undefined;
  const account: Account = { jwt, cuits, cuit: keep ?? (cuits.length === 1 ? cuits[0]!.id : undefined) };
  store.accounts[usuario] = account;
  store.default = usuario;
  saveStore(store);

  return {
    login: `${usuario} logged in (default account)`,
    session: tokenStatus(jwt),
    count: `${cuits.length} CUITs available`,
    cuits: cuitRows(cuits, account.cuit),
    help: account.cuit
      ? [`Active CUIT: ${account.cuit}. Run \`sosc-axi cuits use <id|cuit>\` to switch`]
      : cuits.length
        ? ["Run `sosc-axi cuits use <id|cuit>` to select the CUIT to work with"]
        : ["This user has no CUITs yet. Add one in SOS Contador, then run `sosc-axi cuits`"],
  };
}

export async function logout(args: string[]) {
  const { values } = parse("logout", args, { usuario: { type: "string" } });
  const store = loadStore();
  const usuario = values.usuario ?? store.default;
  if (!usuario || !store.accounts[usuario]) {
    return { logout: usuario ? `${usuario} was not logged in (no-op)` : "no account logged in (no-op)" };
  }
  delete store.accounts[usuario];
  if (store.default === usuario) store.default = Object.keys(store.accounts)[0];
  saveStore(store);
  return {
    logout: `${usuario} logged out`,
    default: store.default ?? "none",
    ...(store.default ? {} : { help: [LOGIN_HINT] }),
  };
}

export async function accounts(args: string[]) {
  if (args[0] === "use") {
    const { positionals } = parse("accounts use", args.slice(1), {}, 1);
    const usuario = positionals[0];
    if (!usuario) throw new AxiError("usuario is required", "VALIDATION_ERROR", ["sosc-axi accounts use <usuario>"]);
    const store = loadStore();
    resolveAccount(store, usuario);
    if (store.default === usuario) return { accounts: `${usuario} is already the default account (no-op)` };
    store.default = usuario;
    saveStore(store);
    return { accounts: `default account is now ${usuario}` };
  }

  parse("accounts", args, {});
  const store = loadStore();
  const rows = Object.entries(store.accounts).map(([usuario, a]) => ({
    usuario,
    default: usuario === store.default ? "*" : "",
    cuit: a.cuits.find((c) => c.id === a.cuit)?.cuit ?? "",
    session: tokenStatus(a.jwt),
  }));
  if (!rows.length) return { accounts: "0 accounts logged in", help: [LOGIN_HINT] };
  return {
    count: `${rows.length} accounts logged in`,
    accounts: rows,
    help: [
      "Run `sosc-axi accounts use <usuario>` to switch the default account",
      "Run `sosc-axi login --usuario <email> --password-stdin` to add another account",
    ],
  };
}

export async function cuits(args: string[]) {
  if (args[0] === "use") return useCuit(args.slice(1));

  const { values } = parse("cuits", args, { usuario: { type: "string" } });
  const store = loadStore();
  const [usuario, account] = resolveAccount(store, values.usuario);
  const listed = findCuits(await api("/cuit/listado", { token: account.jwt, usuario }));
  // keep cached per-CUIT tokens for entries that still exist
  account.cuits = listed.map((c) => ({ ...c, jwtc: account.cuits.find((o) => o.id === c.id)?.jwtc }));
  saveStore(store);

  if (!listed.length) return { cuits: `0 CUITs available for ${usuario}` };
  return {
    usuario,
    count: `${listed.length} CUITs`,
    cuits: cuitRows(listed, account.cuit),
    help: ["Run `sosc-axi cuits use <id|cuit>` to select the CUIT to work with"],
  };
}

async function useCuit(args: string[]) {
  const { values, positionals } = parse("cuits use", args, { usuario: { type: "string" } }, 1);
  const wanted = positionals[0];
  if (!wanted) throw new AxiError("CUIT id or number is required", "VALIDATION_ERROR", ["sosc-axi cuits use <id|cuit>"]);

  const store = loadStore();
  const [usuario, account] = resolveAccount(store, values.usuario);
  const digits = wanted.replace(/\D/g, "");
  const match = (list: Cuit[]) => list.find((c) => c.id === wanted || (digits && c.cuit.replace(/\D/g, "") === digits));

  let cuit = match(account.cuits);
  if (!cuit) {
    account.cuits = findCuits(await api("/cuit/listado", { token: account.jwt, usuario }));
    cuit = match(account.cuits);
  }
  if (!cuit) {
    throw new AxiError(`CUIT ${wanted} is not available for ${usuario}`, "NOT_FOUND", [
      "Run `sosc-axi cuits` to list the CUITs this account can use",
    ]);
  }

  const res = await api(`/cuit/credentials/${encodeURIComponent(cuit.id)}`, { token: account.jwt, usuario });
  const jwtc = token(res, ["jwtc", "jwt", "token"]);
  if (!jwtc) throw new AxiError(`SOS Contador returned no credentials for CUIT ${cuit.cuit}`, "API_ERROR");
  cuit.jwtc = jwtc;
  const already = account.cuit === cuit.id;
  account.cuit = cuit.id;
  saveStore(store);

  return {
    cuit: `${cuit.cuit}${cuit.nombre ? ` (${cuit.nombre})` : ""} ${already ? "is already active, credentials refreshed" : "is now active"} for ${usuario}`,
    session: tokenStatus(jwtc),
  };
}

/** Offline summary for the home view and session hooks. */
export function status() {
  const store = loadStore();
  const names = Object.keys(store.accounts);
  if (!store.default || !store.accounts[store.default]) {
    return { accounts: "0 accounts logged in", help: [LOGIN_HINT] };
  }
  const a = store.accounts[store.default]!;
  const active = a.cuits.find((c) => c.id === a.cuit);
  return {
    usuario: store.default,
    session: tokenStatus(a.jwt),
    cuit: active ? `${active.cuit}${active.nombre ? ` (${active.nombre})` : ""}` : "none selected",
    accounts: `${names.length} logged in`,
    help: [
      active ? "Run `sosc-axi cuits` to list or switch CUITs" : "Run `sosc-axi cuits use <id|cuit>` to select a CUIT",
      ...(names.length > 1 ? ["Run `sosc-axi accounts` to see all logged-in accounts"] : []),
    ],
  };
}
