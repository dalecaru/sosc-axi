import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { num, oneOf, positive, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi clientes [--tipo cliente|proveedor] [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --tipo        cliente or proveedor (default both, each row labeled cliente, proveedor or ambos)
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the clientes and proveedores of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi clientes
  sosc-axi clientes --tipo proveedor --pagina 2
`;

type Clipro = { id?: unknown; cuit?: unknown; clipro?: unknown };

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
  const query = new URLSearchParams({ pagina: String(pagina), registros: String(registros) });
  // The API reads cliente=false as true, so only the wanted side is sent.
  if (tipo !== "proveedor") query.set("cliente", "true");
  if (tipo !== "cliente") query.set("proveedor", "true");

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ paginas?: number; items?: Clipro[] }>(`/cliente/listado?${query}`, {
    token: jwtc,
    usuario,
  });
  const items = Array.isArray(res?.items) ? res.items : [];
  const paginas = num(res?.paginas);
  const label = tipo === "proveedor" ? "proveedores" : "clientes";

  if (!items.length) return { clientes: pagina > 1 ? `0 ${label} on page ${pagina}` : `0 ${label}` };

  // Rows carry no cliente/proveedor flag, and the side lists page apart from this one,
  // so a mixed listing labels rows against every page of both side lists.
  const ids = async (side: string) => {
    const seen = new Set<string>();
    for (let p = 1, total = 1; p <= total; p++) {
      const page = await api<{ paginas?: number; items?: Clipro[] }>(
        `/cliente/listado?pagina=${p}&registros=500&${side}=true`,
        { token: jwtc, usuario },
      );
      for (const c of Array.isArray(page?.items) ? page.items : []) seen.add(str(c.id));
      total = num(page?.paginas);
    }
    return seen;
  };
  const [isCliente, isProveedor] = tipo ? [] : await Promise.all([ids("cliente"), ids("proveedor")]);
  const tipoOf = (id: string) =>
    tipo ?? (isCliente!.has(id) ? (isProveedor!.has(id) ? "ambos" : "cliente") : "proveedor");

  return {
    cuit: cuit.cuit,
    count: `${items.length} ${label}, page ${pagina} of ${paginas}`,
    clientes: items.map((c) => ({ id: str(c.id), cuit: str(c.cuit), nombre: str(c.clipro), tipo: tipoOf(str(c.id)) })),
    ...(pagina < paginas ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}

export const clientes: Command = {
  name: "clientes",
  summary: "List clientes and proveedores of the active CUIT",
  help,
  module: "cliente",
  run,
};
