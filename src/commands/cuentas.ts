import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi cuentas [--usuario <email>]
Lists the plan de cuentas (chart of accounts) of the active CUIT (\`sosc-axi cuits use\` selects it): code, name and
rubro of every cuenta. The codes feed \`sosc-axi mayor <codigo>\`.
examples:
  sosc-axi cuentas
`;

type Cuenta = { id?: unknown; rubro?: unknown; arbol?: unknown; cuenta?: unknown };

/** "01.01.01.003.001 Banco Galicia" -> "Banco Galicia"; rubros carry their code as "01.01.01.003.Banco". */
const name = (v: unknown) => str(v).replace(/^[\d.]+\s*/, "");

async function run(args: string[]) {
  const { values } = parse("cuentas", args, { usuario: { type: "string" } });
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ items?: Cuenta[] }>("/cuentacontable/listado", { token: jwtc, usuario });
  // Rows without id are rubro headings, not cuentas; each cuenta names its rubro anyway.
  const items = (Array.isArray(res?.items) ? res.items : []).filter((c) => c.id != null);

  if (!items.length) return { cuentas: "0 cuentas" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} cuentas`,
    cuentas: items.map((c) => ({ id: str(c.id), codigo: str(c.arbol), cuenta: name(c.cuenta), rubro: name(c.rubro) })),
  };
}

export const cuentas: Command = {
  name: "cuentas",
  summary: "Plan de cuentas (chart of accounts) of the active CUIT",
  help,
  module: "cuentacontable",
  run,
};
