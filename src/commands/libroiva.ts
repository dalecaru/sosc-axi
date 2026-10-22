import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, num, numero, PERIODO_FISCAL_FLAGS, periodoFiscal, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi libroiva ventas|compras [--ejercicio <AAAA>] [--anio <AAAA>] [--mes <MM>] [--usuario <email>]
flags:
  --ejercicio   fiscal year (default this year)
  --mes         one month (01-12) instead of the whole ejercicio
  --anio        calendar year of --mes (default the ejercicio)
Lists the Libro IVA Ventas or Compras of the active CUIT (\`sosc-axi cuits use\` selects it), with totals.
examples:
  sosc-axi libroiva ventas --mes 09
  sosc-axi libroiva compras --ejercicio 2025
`;

const LIBROS = {
  ventas: { path: "/libroivaventa", party: "cliente" },
  compras: { path: "/libroivacompra", party: "proveedor" },
} as const;

async function run(args: string[]) {
  const { values, positionals } = parse("libroiva", args, PERIODO_FISCAL_FLAGS, 1);
  const libro = positionals[0];
  if (libro !== "ventas" && libro !== "compras") {
    throw new AxiError("ventas or compras is required", "VALIDATION_ERROR", [
      "sosc-axi libroiva ventas",
      "sosc-axi libroiva compras",
    ]);
  }
  const { path, party } = LIBROS[libro];
  const p = periodoFiscal(values);
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ libro?: Record<string, unknown>[]; total?: Record<string, unknown>[] }>(
    `${path}/listado/${p.ejercicio}?${p.query}`,
    { token: jwtc, usuario },
  );
  const rows = Array.isArray(res?.libro) ? res.libro : [];
  if (!rows.length) return { libroiva: `0 ${libro} in ${p.when}` };

  const t = res.total?.[0];
  return {
    cuit: cuit.cuit,
    libroiva: `${rows.length} ${libro} in ${p.when}`,
    [libro]: rows.map((r) => ({
      fecha: str(r.fecha).slice(0, 10),
      comprobante: numero(r.fcncnd, r.letra, r.sucursal, r.numero),
      [party]: str(r.clipro),
      cuit: str(r.cuit),
      gravado: cents(num(r.gravado_total)),
      no_gravado: cents(num(r.no_gravado) + num(r.exento)),
      iva: cents(num(r.iva_total)),
      percepciones: cents(num(r.percepciones_total)),
      total: cents(num(r.montototal)),
    })),
    ...(t
      ? {
          totales: {
            gravado: cents(num(t.gravado)),
            no_gravado: cents(num(t.no_gravado) + num(t.exento)),
            iva: cents(num(t.iva_total)),
            percepciones: cents(num(t.percepciones)),
            total: cents(num(t.total)),
          },
        }
      : {}),
  };
}

export const libroiva: Command = {
  name: "libroiva",
  summary: "Libro IVA ventas or compras of the active CUIT for an ejercicio or month, with totals",
  help,
  module: "libroiva",
  run,
};
