import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { cuitRows, findCuits, resolveAccount, token } from "../auth.ts";
import { type Cuit, loadStore, saveStore, tokenStatus } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi cuits [--usuario <email>] | sosc-axi cuits use <id|cuit> [--usuario <email>]
Lists the CUITs (own or shared) the account can access, or selects the active one
and fetches its credentials.
examples:
  sosc-axi cuits
  sosc-axi cuits use 20-12345678-9
  sosc-axi cuits use 3395 --usuario ana@estudio.com
`;

async function run(args: string[]) {
  if (args[0] === "use") return use(args.slice(1));

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

async function use(args: string[]) {
  const { values, positionals } = parse("cuits use", args, { usuario: { type: "string" } }, 1);
  const wanted = positionals[0];
  if (!wanted)
    throw new AxiError("CUIT id or number is required", "VALIDATION_ERROR", ["sosc-axi cuits use <id|cuit>"]);

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

export const cuits: Command = {
  name: "cuits",
  summary: "List CUITs of the account; `cuits use <id|cuit>` selects one",
  help,
  module: "cuit",
  run,
};
