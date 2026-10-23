import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi provincias [--usuario <email>]
Lists the provincias and their ids.
examples:
  sosc-axi provincias
`;

type Provincia = { id?: unknown; provincia?: unknown; nombre?: unknown; descripcion?: unknown };

async function run(args: string[]) {
  const { values } = parse("provincias", args, { usuario: { type: "string" } });
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  // The spec publishes no response shape (its description is copied from centrocosto): parse by shape.
  const res = await api<Provincia[] | { items?: Provincia[] }>("/provincia/listado", { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { provincias: "0 provincias" };
  return {
    count: `${items.length} provincias`,
    provincias: items.map((p) => ({ id: str(p.id), provincia: str(p.provincia ?? p.nombre ?? p.descripcion) })),
  };
}

export const provincias: Command = {
  name: "provincias",
  summary: "List provincias",
  help,
  module: "provincia",
  run,
};
