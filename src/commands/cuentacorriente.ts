import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, date } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi cuentacorriente [--proveedores] [--pendientes] [--desde <fecha>] [--hasta <fecha>]
                             [--clipro <id>] [--usuario <email>]
flags:
  --proveedores supplier accounts instead of customer accounts
  --pendientes  only movements not yet matched (unpaid invoices, unapplied payments)
  --desde       AAAA-MM-DD (default January 1 of this year); earlier movements fold into "Saldo anterior"
  --hasta       AAAA-MM-DD (default today)
  --clipro      one cliente/proveedor id: its movements with a running saldo
Lists the balance per cliente (or proveedor) of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi cuentacorriente
  sosc-axi cuentacorriente --proveedores --pendientes
  sosc-axi cuentacorriente --clipro 25101884 --desde 2025-01-01
`;

type Movimiento = {
  idcomprobante?: unknown;
  idclipro?: unknown;
  fecha?: unknown;
  /** "CUIT Razón social" */
  clipro?: unknown;
  fcncnd?: unknown;
  letra?: unknown;
  sucursal?: unknown;
  numero?: unknown;
  montodebe?: unknown;
  montohaber?: unknown;
};

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => Number(v) || 0;

function party(m: Movimiento) {
  const [, cuit = "", nombre = str(m.clipro)] = str(m.clipro).match(/^(\d{11})\s+(.*)$/) ?? [];
  return { cuit, nombre: nombre.trim() };
}

// "Saldo anterior" rows have no comprobante and carry their label in letra.
const comprobante = (m: Movimiento) =>
  m.idcomprobante == null
    ? str(m.letra)
    : `${str(m.fcncnd)}${str(m.letra)}-${str(m.sucursal).padStart(4, "0")}-${str(m.numero).padStart(8, "0")}`;

async function run(args: string[]) {
  const { values } = parse("cuentacorriente", args, {
    proveedores: { type: "boolean" },
    pendientes: { type: "boolean" },
    desde: { type: "string" },
    hasta: { type: "string" },
    clipro: { type: "string" },
    usuario: { type: "string" },
  });
  const today = new Date().toLocaleDateString("sv-SE");
  const desde = date("desde", values.desde ?? `${today.slice(0, 4)}-01-01`);
  const hasta = date("hasta", values.hasta ?? today);
  const clipro = values.clipro;
  if (clipro !== undefined && !/^\d+$/.test(clipro)) {
    throw new AxiError("--clipro must be a numeric id", "VALIDATION_ERROR", [
      "Run `sosc-axi cuentacorriente` to list clipro ids",
    ]);
  }
  const [side, one] = values.proveedores ? ["proveedores", "proveedor"] : ["clientes", "cliente"];
  const when = `${desde} to ${hasta}`;

  const store = loadStore();
  const [usuario, cuit, jwtc] = await activeCuit(store, values.usuario);
  let res: { items?: Movimiento[] };
  try {
    res = await api(`/cuentacorriente/listado`, {
      token: jwtc,
      usuario,
      body: {
        CP: values.proveedores ? "P" : "C",
        // T is every movement; any other tipo returns only the unmatched ones.
        tipo: values.pendientes ? "P" : "T",
        fechadesde: desde,
        fechahasta: hasta,
        ...(clipro ? { idclipro: Number(clipro) } : {}),
      },
    });
  } catch (error) {
    // An idclipro the CUIT does not have crashes the API with "reading 'fechadesde'".
    if (clipro && (error as AxiError).code === "API_ERROR" && /fechadesde/.test((error as Error).message)) {
      throw new AxiError(`${one} ${clipro} not found for the active CUIT`, "NOT_FOUND", [
        `Run \`sosc-axi cuentacorriente${values.proveedores ? " --proveedores" : ""}\` to list clipro ids`,
      ]);
    }
    throw error;
  }
  const items = Array.isArray(res?.items) ? res.items : [];

  if (clipro) {
    if (!items.length) return { movimientos: `0 movimientos for clipro ${clipro} in ${when}` };
    let saldo = 0;
    const movimientos = items.map((m) => {
      const debe = cents(num(m.montodebe));
      const haber = cents(num(m.montohaber));
      saldo = cents(saldo + debe - haber);
      return {
        fecha: str(m.fecha).slice(0, 10),
        comprobante: comprobante(m),
        id: str(m.idcomprobante),
        debe,
        haber,
        saldo,
      };
    });
    const p = party(items[0]!);
    return { [one]: p.nombre, cuit: p.cuit, periodo: when, movimientos, saldo };
  }

  const pending = values.pendientes ? " with pending movements" : "";
  if (!items.length) return { cuentacorriente: `0 ${side}${pending || " with movements"} in ${when}` };
  const byParty = new Map<string, { m: Movimiento; debe: number; haber: number }>();
  for (const m of items) {
    const row = byParty.get(str(m.idclipro)) ?? { m, debe: 0, haber: 0 };
    row.debe = cents(row.debe + num(m.montodebe));
    row.haber = cents(row.haber + num(m.montohaber));
    byParty.set(str(m.idclipro), row);
  }
  const rows = [...byParty.values()].map(({ m, debe, haber }) => {
    const p = party(m);
    return { clipro: str(m.idclipro), cuit: p.cuit, [one]: p.nombre, debe, haber, saldo: cents(debe - haber) };
  });
  const flags = `${values.proveedores ? " --proveedores" : ""}${values.pendientes ? " --pendientes" : ""}`;
  return {
    cuit: cuit.cuit,
    cuentacorriente: `${rows.length} ${side}${pending} in ${when}`,
    [side]: rows,
    saldo: cents(rows.reduce((sum, r) => sum + r.saldo, 0)),
    help: [
      `Run \`sosc-axi cuentacorriente${flags} --clipro <clipro> --desde ${desde} --hasta ${hasta}\` for its movements`,
    ],
  };
}

export const cuentacorriente: Command = {
  name: "cuentacorriente",
  summary: "Balance per cliente/proveedor of the active CUIT; `--clipro <id>` lists its movements",
  help,
  module: "cuentacorriente",
  run,
};
