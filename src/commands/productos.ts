import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { num, positive, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi productos [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the productos of the active CUIT (\`sosc-axi cuits use\` selects it), with list price 1 and IVA rate.
examples:
  sosc-axi productos
  sosc-axi productos --pagina 2
`;

type Producto = Record<string, unknown>;

async function run(args: string[]) {
  const { values } = parse("productos", args, {
    pagina: { type: "string" },
    registros: { type: "string" },
    usuario: { type: "string" },
  });
  const pagina = positive("pagina", values.pagina, 1);
  const registros = positive("registros", values.registros, 50);
  const query = new URLSearchParams({ pagina: String(pagina), registros: String(registros) });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<Producto[] | { items?: Producto[] }>(`/producto/listado?${query}`, { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { productos: pagina > 1 ? `0 productos on page ${pagina}` : "0 productos" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} productos, page ${pagina}`,
    productos: items.map((p) => ({
      id: str(p.id),
      codigo: str(p.codigo),
      producto: str(p.producto),
      precio: num(p.precio1),
      iva: num(p.tasaiva),
      unidad: str(p.unidad),
    })),
    ...(items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}

export const productos: Command = {
  name: "productos",
  summary: "List productos of the active CUIT",
  help,
  module: "producto",
  run,
};
