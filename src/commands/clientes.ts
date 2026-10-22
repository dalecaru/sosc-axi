import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { oneOf, positive, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi clientes [--tipo cliente|proveedor] [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --tipo        cliente or proveedor (default both)
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the clientes and proveedores of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi clientes
  sosc-axi clientes --tipo proveedor --pagina 2
`;

type Clipro = { id?: unknown; cuit?: unknown; clipro?: unknown; cliente?: unknown; proveedor?: unknown };

const yes = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

async function run(args: string[]) {
  const { values } = parse("clientes", args, {
    tipo: { type: "string" },
    pagina: { type: "string" },
    registros: { type: "string" },
    usuario: { type: "string" },
  });
  const tipo = oneOf("tipo", values.tipo, ["cliente", "proveedor"]);
  const pagina = positive("pagina", values.pagina, 1);
  const registros = positive("registros", values.registros, 50);
  const query = new URLSearchParams({
    pagina: String(pagina),
    registros: String(registros),
    cliente: String(tipo !== "proveedor"),
    proveedor: String(tipo !== "cliente"),
  });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<Clipro[] | { items?: Clipro[] }>(`/cliente/listado?${query}`, { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { clientes: pagina > 1 ? `0 clientes on page ${pagina}` : "0 clientes" };
  return {
    cuit: cuit.cuit,
    count: `${items.length} clientes, page ${pagina}`,
    clientes: items.map((c) => {
      const [cli, pro] = tipo ? [tipo === "cliente", tipo === "proveedor"] : [yes(c.cliente), yes(c.proveedor)];
      return {
        id: str(c.id),
        cuit: str(c.cuit),
        nombre: str(c.clipro),
        tipo: cli && pro ? "ambos" : cli ? "cliente" : pro ? "proveedor" : "",
      };
    }),
    ...(items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}

export const clientes: Command = {
  name: "clientes",
  summary: "List clientes and proveedores of the active CUIT",
  help,
  module: "cliente",
  run,
};
