import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit, cuitRows, fetchCuitToken, findCuits, resolveAccount } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { type Cuit, loadStore, saveStore, tokenStatus } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi cuits [--usuario <email>] | sosc-axi cuits use <cuit> [--usuario <email>]
       sosc-axi cuits sct|ccma [--usuario <email>]
Lists the CUITs (own or shared) the account can access, or selects the active one
and fetches its credentials. \`sct\` shows the AFIP Sistema de Cuentas Tributarias debt
summary of the active CUIT, \`ccma\` its monotributo/autónomos cuenta corriente summary.
examples:
  sosc-axi cuits
  sosc-axi cuits use 20123456789
  sosc-axi cuits use 30712345671 --usuario ana@estudio.com
  sosc-axi cuits sct
`;

async function run(args: string[]) {
  if (args[0] === "use") return use(args.slice(1));
  if (args[0] === "sct" || args[0] === "ccma") return summary(args[0], args.slice(1));

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
    help: ["Run `sosc-axi cuits use <cuit>` to select the CUIT to work with"],
  };
}

async function use(args: string[]) {
  const { values, positionals } = parse("cuits use", args, { usuario: { type: "string" } }, 1);
  const wanted = positionals[0]?.replace(/\D/g, "");
  if (wanted?.length !== 11)
    throw new AxiError("CUIT number (11 digits) is required", "VALIDATION_ERROR", ["sosc-axi cuits use 20123456789"]);

  const store = loadStore();
  const [usuario, account] = resolveAccount(store, values.usuario);
  const match = (list: Cuit[]) => list.find((c) => c.cuit.replace(/\D/g, "") === wanted);

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

  const jwtc = await fetchCuitToken(account, cuit, usuario);
  const already = account.cuit === cuit.id;
  account.cuit = cuit.id;
  saveStore(store);

  return {
    cuit: `${cuit.cuit}${cuit.nombre ? ` (${cuit.nombre})` : ""} ${already ? "is already active, credentials refreshed" : "is now active"} for ${usuario}`,
    session: tokenStatus(jwtc),
  };
}

// The spec calls these "parámetros para la APP móvil" but they return AFIP account summaries
// as flat {sct_*} / {ccma_*} objects; fechadecalculo is null until SOS Contador calculates one.
async function summary(sub: "sct" | "ccma", args: string[]) {
  const { values } = parse(`cuits ${sub}`, args, { usuario: { type: "string" } });
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = (await api<Record<string, unknown>>(`/cuit/${sub}`, { token: jwtc, usuario })) ?? {};
  if (!res[`${sub}_fechadecalculo`]) return { [sub]: `no ${sub.toUpperCase()} data calculated for ${cuit.cuit}` };
  const fields = Object.entries(res).map(([k, v]) => [
    k.replace(`${sub}_`, ""),
    k.endsWith("fechadecalculo") ? str(v).slice(0, 10) : str(v),
  ]);
  return { cuit: cuit.cuit, [sub]: Object.fromEntries(fields) };
}

export const cuits: Command = {
  name: "cuits",
  summary: "List CUITs of the account; `cuits use <cuit>` selects one, `cuits sct|ccma` shows its AFIP debt",
  help,
  module: "cuit",
  run,
};
