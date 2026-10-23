import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { num, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi indices [--usuario <email>]
Lists the índices de ajuste por inflación per month, with whether the ajuste contable (axic) and impositivo (axii) apply.
examples:
  sosc-axi indices
`;

type Indice = { anio?: unknown; mes?: unknown; indice?: unknown; axic?: unknown; axii?: unknown };

async function run(args: string[]) {
  const { values } = parse("indices", args, { usuario: { type: "string" } });
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ items?: Indice[] }>("/indiceaniomes/listado", { token: jwtc, usuario });
  const items = Array.isArray(res?.items) ? res.items : [];

  if (!items.length) return { indices: "0 indices" };
  return {
    count: `${items.length} indices`,
    indices: items.map((i) => ({
      periodo: `${str(i.anio)}-${str(i.mes).padStart(2, "0")}`,
      indice: num(i.indice),
      axic: str(i.axic),
      axii: str(i.axii),
    })),
  };
}

export const indices: Command = {
  name: "indices",
  summary: "List índices de ajuste por inflación",
  help,
  module: "indiceaniomes",
  run,
};
