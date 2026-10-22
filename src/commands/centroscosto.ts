import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi centroscosto [--usuario <email>]
Lists the centros de costo of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi centroscosto
`;

type CentroCosto = { id?: unknown; centrocosto?: unknown };

async function run(args: string[]) {
  const { values } = parse("centroscosto", args, { usuario: { type: "string" } });
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ items?: CentroCosto[] }>("/centrocosto/listado", { token: jwtc, usuario });
  const items = Array.isArray(res?.items) ? res.items : [];

  if (!items.length) return { centroscosto: "0 centros de costo" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} centros de costo`,
    centroscosto: items.map((c) => ({ id: str(c.id), centrocosto: str(c.centrocosto) })),
  };
}

export const centroscosto: Command = {
  name: "centroscosto",
  summary: "List centros de costo of the active CUIT",
  help,
  module: "centrocosto",
  run,
};
