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
  /** cobro, pago and recibo listings name the counterparty here instead of clipro. */
  cliente?: { cuit?: unknown; clipro?: unknown };
};

type ListCommand = "ventas" | "compras" | "cobros" | "pagos" | "recibos";

export function oneOf(flag: string, value: string | undefined, allowed: string[]): string | undefined {
  if (value !== undefined && !allowed.includes(value)) {
    throw new AxiError(`--${flag} must be one of ${allowed.join(", ")}`, "VALIDATION_ERROR");
  }
  return value;
}

export const positive = (flag: string, value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new AxiError(`--${flag} must be a positive integer`, "VALIDATION_ERROR");
  return Number(value);
};

export const date = (flag: string, value: string) => {
  if (new Date(value).toJSON()?.slice(0, 10) !== value) {
    throw new AxiError(`--${flag} must be AAAA-MM-DD`, "VALIDATION_ERROR");
  }
  return value;
};

/**
 * GET listing shared by ventas, compras, cobros, pagos and recibos: `{base}/{periodo}{suffix}` with paging
 * and an optional date range. All return `{items: [...]}` without a total, so a full page hints the next one.
 */
export async function listado(opts: {
  command: ListCommand;
  /** Column naming the counterparty: cliente for ventas, proveedor for compras. */
  party: "cliente" | "proveedor";
  args: string[];
  /** false: no --desde/--hasta (cobro, pago and recibo reject entre_fechas). */
  range?: false;
  /** false: no cae column (cobros, pagos and recibos never carry one). */
  cae?: false;
  flags?: Record<string, { type: "string" }>;
  path: (periodo: string, values: Record<string, string | undefined>) => string;
}) {
  const { command, party } = opts;
  const { desde, hasta, ...noRange } = LISTADO_FLAGS;
  const { values } = parse(command, opts.args, { ...(opts.range === false ? noRange : LISTADO_FLAGS), ...opts.flags });
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
    [command]: items.map((c) => {
      const p = c.clipro ?? c.cliente;
      return {
        id: String(c.id ?? ""),
        fecha: String(c.fecha ?? "").slice(0, 10),
        factura: String(c.factura ?? ""),
        [party]: String(p?.clipro ?? "").trim(),
        cuit: String(p?.cuit ?? ""),
        total: Number(c.montototal ?? 0),
        ...(opts.cae === false ? {} : { cae: String(c.cae ?? "") }),
      };
    }),
    ...(items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}

type Detalle = {
  cabecera?: Record<string, unknown>;
  imputaciones?: Record<string, unknown>[];
  productos?: Record<string, unknown>[];
};

export const str = (v: unknown) => (v == null ? "" : String(v).trim());
export const num = (v: unknown) => Number(v) || 0;
export const cents = (n: number) => Math.round(n * 100) / 100;

/** "FA-0005-00000102" from tipo (F/C/D), letra, punto de venta and número. */
export const numero = (tipo: unknown, letra: unknown, pv: unknown, nro: unknown) =>
  `${str(tipo)}${str(letra)}-${String(num(pv)).padStart(4, "0")}-${String(num(nro)).padStart(8, "0")}`;

export const PERIODO_FISCAL_FLAGS = {
  ejercicio: { type: "string" },
  anio: { type: "string" },
  mes: { type: "string" },
  usuario: { type: "string" },
} as const;

const year = (flag: string, value: string) => {
  if (!/^\d{4}$/.test(value)) throw new AxiError(`--${flag} must be AAAA`, "VALIDATION_ERROR");
  return value;
};

/**
 * --ejercicio/--anio/--mes of libroiva and iva. The API ignores the ejercicio path segment and returns nothing
 * without anio and mes; mes 00 is the whole calendar year anio, so no --mes means the whole ejercicio.
 */
export function periodoFiscal(v: { ejercicio?: string; anio?: string; mes?: string }) {
  const ejercicio = year("ejercicio", v.ejercicio ?? String(new Date().getFullYear()));
  const anio = year("anio", v.anio ?? ejercicio);
  if (v.anio !== undefined && v.mes === undefined) throw new AxiError("--anio requires --mes", "VALIDATION_ERROR");
  if (v.mes !== undefined && !/^(0[1-9]|1[0-2])$/.test(v.mes)) {
    throw new AxiError("--mes must be MM (01-12)", "VALIDATION_ERROR");
  }
  const query = new URLSearchParams({ anio, mes: v.mes ?? "00" });
  return { ejercicio, query: String(query), when: v.mes ? `${anio}-${v.mes}` : anio };
}

/** `{base}/detalle/{id}`: header, accounting lines (imputaciones) and products of one comprobante. */
export async function detalle(opts: {
  command: ListCommand;
  party: "cliente" | "proveedor";
  base: "/venta" | "/compra" | "/pago";
  args: string[];
}) {
  const { command, party } = opts;
  const { values, positionals } = parse(`${command} view`, opts.args, { usuario: { type: "string" } }, 1);
  const id = positionals[0];
  if (!id || !/^\d+$/.test(id)) {
    throw new AxiError(`numeric ${command} id is required`, "VALIDATION_ERROR", [
      `sosc-axi ${command} view <id>`,
      `Run \`sosc-axi ${command}\` to list ids`,
    ]);
  }
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  let res: Detalle;
  try {
    res = await api<Detalle>(`${opts.base}/detalle/${id}`, { token: jwtc, usuario });
  } catch (error) {
    // The API answers unknown ids with "Imposible cargar detalles de la venta" (or "del cobro/pago").
    if ((error as AxiError).code === "API_ERROR" && /imposible cargar/i.test((error as Error).message)) {
      throw new AxiError(`${command} ${id} not found for the active CUIT`, "NOT_FOUND", [
        `Run \`sosc-axi ${command}\` to list ids`,
      ]);
    }
    throw error;
  }

  const c = res?.cabecera ?? {};
  const imputaciones = (res?.imputaciones ?? []).map((i) => ({
    cuenta: str(i.cuenta),
    concepto: str(i.identificador),
    alicuota: num(i.alicuota),
    // Raw sides: the API sometimes books one line on both (debe X, haber -X), so no netting here.
    debe: cents(num(i.montodebe)),
    haber: cents(num(i.montohaber)),
    iva_debe: cents(num(i.iva_debe)),
    iva_haber: cents(num(i.iva_haber)),
  }));
  const productos = (res?.productos ?? []).map((p) => ({
    codigo: str(p.codigo),
    producto: str(p.producto),
    cantidad: num(p.cantidad),
    unitario: num(p.unitario),
    alicuota: num(p.alicuota),
  }));
  return {
    id: str(c.id) || id,
    fecha: str(c.fecha).slice(0, 10),
    factura: numero(c.fcncnd, c.letra, c.puntoventa, c.numero),
    [party]: str(c.clipro),
    cuit: str(c.cuit),
    cae: str(c.cae),
    cuenta: str(c.cuenta),
    centrocosto: str(c.centrocosto),
    ...(str(c.memo) ? { memo: str(c.memo) } : {}),
    imputaciones,
    ...(productos.length ? { productos } : {}),
  };
}
