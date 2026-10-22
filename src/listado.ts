import { AxiError } from "axi-sdk-js";
import { api } from "./api.ts";
import { parse } from "./args.ts";
import { activeCuit } from "./auth.ts";
import { loadStore } from "./store.ts";

const PERIODOS = ["hoy", "ayer", "semana", "mes", "mes_anterior"];

const LISTADO_FLAGS = {
  periodo: { type: "string" },
  desde: { type: "string" },
  hasta: { type: "string" },
  pagina: { type: "string" },
  registros: { type: "string" },
  usuario: { type: "string" },
} as const;

type Comprobante = {
  id?: unknown;
  fecha?: unknown;
  factura?: unknown;
  montototal?: unknown;
  cae?: unknown;
  clipro?: { cuit?: unknown; clipro?: unknown };
};

export function oneOf(flag: string, value: string | undefined, allowed: string[]): string | undefined {
  if (value !== undefined && !allowed.includes(value)) {
    throw new AxiError(`--${flag} must be one of ${allowed.join(", ")}`, "VALIDATION_ERROR");
  }
  return value;
}

const positive = (flag: string, value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new AxiError(`--${flag} must be a positive integer`, "VALIDATION_ERROR");
  return Number(value);
};

const date = (flag: string, value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AxiError(`--${flag} must be AAAA-MM-DD`, "VALIDATION_ERROR");
  return value;
};

/**
 * GET listing shared by ventas and compras: `{base}/{periodo}{suffix}` with paging and an
 * optional date range. Both return `{items: [...]}` without a total, so a full page hints the next one.
 */
export async function listado(opts: {
  command: "ventas" | "compras";
  /** Column naming the counterparty: cliente for ventas, proveedor for compras. */
  party: "cliente" | "proveedor";
  args: string[];
  flags?: Record<string, { type: "string" }>;
  path: (periodo: string, values: Record<string, string | undefined>) => string;
}) {
  const { command, party } = opts;
  const { values } = parse(command, opts.args, { ...LISTADO_FLAGS, ...opts.flags });
  const v = values as Record<string, string | undefined>;
  const range = v.desde !== undefined || v.hasta !== undefined;
  if (range && v.periodo !== undefined) {
    throw new AxiError("use --periodo or --desde/--hasta, not both", "VALIDATION_ERROR");
  }
  if (range && (v.desde === undefined || v.hasta === undefined)) {
    throw new AxiError("--desde and --hasta go together", "VALIDATION_ERROR", [
      `sosc-axi ${command} --desde 2026-01-01 --hasta 2026-01-31`,
    ]);
  }
  const periodo = range ? "entre_fechas" : (oneOf("periodo", v.periodo, PERIODOS) ?? "mes");
  const pagina = positive("pagina", v.pagina, 1);
  const registros = positive("registros", v.registros, 50);

  const query = new URLSearchParams({ pagina: String(pagina), registros: String(registros) });
  if (range) {
    query.set("fecha_desde", date("desde", v.desde!));
    query.set("fecha_hasta", date("hasta", v.hasta!));
  }

  const path = `${opts.path(periodo, v)}?${query}`;
  const store = loadStore();
  const [usuario, cuit, jwtc] = await activeCuit(store, v.usuario);
  const res = await api<{ items?: Comprobante[] }>(path, { token: jwtc, usuario });
  const items = Array.isArray(res?.items) ? res.items : [];
  const when = range ? `${v.desde} to ${v.hasta}` : periodo;

  if (!items.length) {
    return { [command]: pagina > 1 ? `0 ${command} on page ${pagina} (${when})` : `0 ${command} in ${when}` };
  }
  return {
    cuit: cuit.cuit,
    count: `${items.length} ${command} in ${when}, page ${pagina}`,
    [command]: items.map((c) => ({
      id: String(c.id ?? ""),
      fecha: String(c.fecha ?? "").slice(0, 10),
      factura: String(c.factura ?? ""),
      [party]: String(c.clipro?.clipro ?? "").trim(),
      cuit: String(c.clipro?.cuit ?? ""),
      total: Number(c.montototal ?? 0),
      cae: String(c.cae ?? ""),
    })),
    ...(items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}
