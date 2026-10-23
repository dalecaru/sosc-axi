import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi actividades [<busca>] [--usuario <email>]
Searches the AFIP actividades by description (not by code) and shows code and description.
Without <busca> lists all of them (about 1000).
examples:
  sosc-axi actividades panaderia
  sosc-axi actividades "venta al por menor"
`;

type Actividad = { codactividad?: unknown; actividad?: unknown };

async function run(args: string[]) {
  const { values, positionals } = parse("actividades", args, { usuario: { type: "string" } }, 1);
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  // The API matches nothing when the search has accents ("panadería" finds 0, "panaderia" finds 3).
  const busca = (positionals[0] ?? "").normalize("NFD").replace(/\p{M}/gu, "");
  const res = await api<Actividad[] | { items?: Actividad[] }>(`/actividad/listado/${encodeURIComponent(busca)}`, {
    token: jwtc,
    usuario,
  });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { actividades: "0 actividades" };
  return {
    count: `${items.length} actividades`,
    actividades: items.map((a) => ({ codigo: str(a.codactividad), actividad: str(a.actividad) })),
  };
}

export const actividades: Command = {
  name: "actividades",
  summary: "Search AFIP actividades",
  help,
  module: "actividad",
  run,
};
