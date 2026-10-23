import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { num, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi productos [--usuario <email>]
Lists all productos of the active CUIT (\`sosc-axi cuits use\` selects it), with list price 1 and IVA rate.
examples:
  sosc-axi productos
`;

type Producto = Record<string, unknown>;

async function run(args: string[]) {
  const { values } = parse("productos", args, { usuario: { type: "string" } });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  // The spec lists pagina/registros, but the API ignores both and returns the whole catalog
  const res = await api<Producto[] | { items?: Producto[] }>("/producto/listado", { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { productos: "0 productos" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} productos`,
    productos: items.map((p) => ({
      id: str(p.id),
      codigo: str(p.codigo),
      producto: str(p.producto),
      precio: num(p.precio1),
      iva: num(p.tasaiva),
    })),
  };
}

export const productos: Command = {
  name: "productos",
  summary: "List productos of the active CUIT",
  help,
  module: "producto",
  run,
};
