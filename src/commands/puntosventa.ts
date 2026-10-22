import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { num, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi puntosventa [--usuario <email>]
Lists the puntos de venta of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi puntosventa
`;

type PuntoVenta = { id?: unknown; puntoventa?: unknown; nombre?: unknown };

async function run(args: string[]) {
  const { values } = parse("puntosventa", args, { usuario: { type: "string" } });
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<PuntoVenta[] | { items?: PuntoVenta[] }>("/puntoventa/listado", { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { puntosventa: "0 puntos de venta" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} puntos de venta`,
    puntosventa: items.map((p) => ({
      id: str(p.id),
      numero: num(p.puntoventa),
      nombre: str(p.nombre),
    })),
  };
}

export const puntosventa: Command = {
  name: "puntosventa",
  summary: "List puntos de venta of the active CUIT",
  help,
  module: "puntoventa",
  run,
};
