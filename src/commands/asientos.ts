import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, num, numero, oneOf, positive, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi asientos [--periodo <periodo>] [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi asientos view <id> [--usuario <email>]
flags:
  --periodo     hoy, ayer, semana, mes (default), mes_anterior, anio (last calendar year)
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the asientos (journal entries) of the active CUIT (\`sosc-axi cuits use\` selects it), deleted ones left out.
\`view <id>\` shows one asiento with its imputaciones.
examples:
  sosc-axi asientos --periodo mes_anterior
  sosc-axi asientos view 951099901
`;

type Asiento = { id?: unknown; fecha?: unknown; comprobante?: unknown; montototal?: unknown; memo?: unknown };

async function list(args: string[]) {
  const { values } = parse("asientos", args, {
    periodo: { type: "string" },
    pagina: { type: "string" },
    registros: { type: "string" },
    usuario: { type: "string" },
  });
  const periodo = oneOf("periodo", values.periodo, ["hoy", "ayer", "semana", "mes", "mes_anterior", "anio"]) ?? "mes";
  const pagina = positive("pagina", values.pagina, 1);
  const registros = positive("registros", values.registros, 50);
  // The API reads pagina as a 1-based row offset, not a page number.
  const query = new URLSearchParams({ pagina: String((pagina - 1) * registros + 1), registros: String(registros) });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ items?: (Asiento & { eliminado?: unknown })[] }>(`/asiento/listado/${periodo}?${query}`, {
    token: jwtc,
    usuario,
  });
  const items = Array.isArray(res?.items) ? res.items : [];
  const rows = items.filter((a) => a.eliminado !== true);
  const more = items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {};

  if (!rows.length) {
    return { asientos: pagina > 1 ? `0 asientos on page ${pagina} (${periodo})` : `0 asientos in ${periodo}`, ...more };
  }
  return {
    cuit: cuit.cuit,
    count: `${rows.length} asientos in ${periodo}, page ${pagina}`,
    asientos: rows.map((a) => ({
      id: str(a.id),
      fecha: str(a.fecha).slice(0, 10),
      comprobante: str(a.comprobante),
      total: cents(num(a.montototal)),
      memo: str(a.memo),
    })),
    ...more,
  };
}

async function view(args: string[]) {
  const { values, positionals } = parse("asientos view", args, { usuario: { type: "string" } }, 1);
  const id = positionals[0];
  if (!id || !/^\d+$/.test(id)) {
    throw new AxiError("numeric asiento id is required", "VALIDATION_ERROR", [
      "sosc-axi asientos view <id>",
      "Run `sosc-axi asientos` to list ids",
    ]);
  }
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  let res: { cabecera?: Record<string, unknown>; imputaciones?: Record<string, unknown>[] };
  try {
    res = await api(`/asiento/detalle/${id}`, { token: jwtc, usuario });
  } catch (error) {
    // Unknown ids answer "Imposible cargar detalles del asiento".
    if ((error as AxiError).code === "API_ERROR" && /imposible cargar/i.test((error as Error).message)) {
      throw new AxiError(`asiento ${id} not found for the active CUIT`, "NOT_FOUND", [
        "Run `sosc-axi asientos` to list ids",
      ]);
    }
    throw error;
  }
  const c = res?.cabecera ?? {};
  return {
    id: str(c.id) || id,
    fecha: str(c.fecha).slice(0, 10),
    comprobante: numero("", c.letra, c.puntoventa, c.numero),
    centrocosto: str(c.centrocosto),
    ...(str(c.memo) ? { memo: str(c.memo) } : {}),
    imputaciones: (res?.imputaciones ?? []).map((i) => ({
      cuenta: str(i.cuenta),
      debe: cents(num(i.montodebe)),
      haber: cents(num(i.montohaber)),
    })),
  };
}

export const asientos: Command = {
  name: "asientos",
  summary: "List asientos (journal entries) of the active CUIT; `asientos view <id>` shows one",
  help,
  module: "asiento",
  run: (args) => (args[0] === "view" ? view(args.slice(1)) : list(args)),
};
