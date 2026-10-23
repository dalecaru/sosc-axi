import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

// Found by probing the API, which publishes no list (unknown ones return {}). operacion exists but fails server-side.\n// Add a modulo here when a new one turns up.
const MODULOS = [
  "bancos",
  "condicioniibb",
  "condicioniva",
  "condicionventa",
  "creditofiscal",
  "listaprecio",
  "moneda",
  "monotributo",
  "perfil",
  "vendedor",
];

const help = `usage: sosc-axi tipos <modulo> [<busca>] [--usuario <email>]
Searches one of the system's parameter tables and shows id and name. Without <busca> lists the whole table.
modulos: ${MODULOS.join(", ")}
examples:
  sosc-axi tipos condicioniva
  sosc-axi tipos creditofiscal bienes
`;

type Tipo = Record<string, unknown>;

async function run(args: string[]) {
  const { values, positionals } = parse("tipos", args, { usuario: { type: "string" } }, 2);
  const [modulo, busca = ""] = positionals;
  const hint = [`modulos: ${MODULOS.join(", ")}`];
  if (!modulo) throw new AxiError("modulo is required", "VALIDATION_ERROR", hint);
  if (!MODULOS.includes(modulo)) throw new AxiError(`unknown modulo ${modulo}`, "VALIDATION_ERROR", hint);
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  const term = busca.normalize("NFD").replace(/\p{M}/gu, "");
  const res = await api<{ items?: Tipo[] }>(`/tipo/listado/${encodeURIComponent(modulo)}/${encodeURIComponent(term)}`, {
    token: jwtc,
    usuario,
  });
  const items = res?.items ?? [];
  if (!items.length) return { tipos: "0 tipos" };
  // The name sits in a field named after the modulo, with its own casing (condicionIVA, listaPrecio).
  const key = (t: Tipo) => Object.keys(t).find((k) => k.toLowerCase() === modulo.toLowerCase());
  return {
    count: `${items.length} tipos`,
    tipos: items.map((t) => ({ id: str(t.id), nombre: str(t[key(t) ?? ""]) })),
  };
}

export const tipos: Command = {
  name: "tipos",
  summary: "Search parameter tables (condicioniva, moneda, bancos...)",
  help,
  module: "tipo",
  run,
};
