import { AxiError } from "axi-sdk-js";
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
  // The API reads cliente=false as true, so only the wanted side is sent.
  const sides = new URLSearchParams();
  if (tipo !== "proveedor") sides.set("cliente", "true");
  if (tipo !== "cliente") sides.set("proveedor", "true");

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const listado = async (p: number, size: number) => {
    const res = await api<{ paginas?: number; items?: Clipro[] }>(
      `/cliente/listado?pagina=${p}&registros=${size}&${sides}`,
      { token: jwtc, usuario },
    );
    return { rows: Array.isArray(res?.items) ? res.items : [], paginas: num(res?.paginas) };
  };

  let items: Clipro[];
  let paginas: number;
  if (registros >= 16 && registros <= 50) {
    ({ rows: items, paginas } = await listado(pagina, registros));
  } else {
    // The API serves at least 16 and at most 50 rows per page whatever registros asks,
    // so other sizes are cut out of 50-row pages.
    const start = (pagina - 1) * registros;
    const first = Math.floor(start / 50) + 1;
    const want = start + registros - (first - 1) * 50;
    let p = first;
    let page = await listado(p, 50);
    const rows = [...page.rows];
    while (rows.length < want && page.rows.length === 50 && p < page.paginas) {
      page = await listado(++p, 50);
      rows.push(...page.rows);
    }
    items = rows.slice(start - (first - 1) * 50, want);
    // Only the last page's length gives the total, for the page count.
    if (items.length && page.rows.length === 50 && p < page.paginas) {
      p = page.paginas;
      page = await listado(p, 50);
    }
    paginas = Math.ceil(((p - 1) * 50 + page.rows.length) / registros);
  }
  const label = tipo === "proveedor" ? "proveedores" : "clientes";

  if (!items.length) return { clientes: pagina > 1 ? `0 ${label} on page ${pagina}` : `0 ${label}` };

  // Rows carry no cliente/proveedor flag, and the side lists page apart from this one,
  // so a mixed listing labels rows against every page of both side lists.
  const ids = async (side: string) => {
    const seen = new Set<string>();
    for (let p = 1, total = 1; p <= total; p++) {
      if (p > 50)
        throw new AxiError(`The ${side} list has more than 50 pages; cannot label rows`, "API_ERROR", [
          "Run with `--tipo cliente` or `--tipo proveedor` instead",
        ]);
      const page = await api<{ paginas?: number; items?: Clipro[] }>(
        `/cliente/listado?pagina=${p}&registros=500&${side}=true`,
        { token: jwtc, usuario },
      );
      const rows = Array.isArray(page?.items) ? page.items : [];
      for (const c of rows) seen.add(str(c.id));
      // An empty page ends the list even if paginas claims more.
      total = rows.length ? num(page?.paginas) : 0;
    }
    return seen;
  };
  const [isCliente, isProveedor] = tipo ? [] : await Promise.all([ids("cliente"), ids("proveedor")]);
  const tipoOf = (id: string) => {
    if (tipo) return tipo;
    const [c, p] = [isCliente!.has(id), isProveedor!.has(id)];
    if (!c && !p)
      throw new AxiError(`Row ${id} is in neither the cliente nor the proveedor list; cannot label it`, "API_ERROR", [
        "Run again, or with `--tipo cliente` or `--tipo proveedor`",
      ]);
    return c ? (p ? "ambos" : "cliente") : "proveedor";
  };

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
