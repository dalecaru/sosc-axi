import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi unidades [--usuario <email>]
Lists the AFIP units of measure.
examples:
  sosc-axi unidades
`;

type Unidad = { id?: unknown; unidad?: unknown; nombre?: unknown; descripcion?: unknown };

async function run(args: string[]) {
  const { values } = parse("unidades", args, { usuario: { type: "string" } });
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  // The spec publishes no response shape: accept a bare array or {items} and the usual name fields.
  const res = await api<Unidad[] | { items?: Unidad[] }>("/unidad/listado", { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { unidades: "0 unidades" };
  return {
    count: `${items.length} unidades`,
    unidades: items.map((u) => ({ id: str(u.id), unidad: str(u.unidad ?? u.nombre ?? u.descripcion) })),
  };
}

export const unidades: Command = {
  name: "unidades",
  summary: "List AFIP units of measure",
  help,
  module: "unidad",
  run,
};
