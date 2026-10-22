import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, num, PERIODO_FISCAL_FLAGS, periodoFiscal, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi iva [--ejercicio <AAAA>] [--anio <AAAA>] [--mes <MM>] [--usuario <email>]
flags:
  --ejercicio   fiscal year (default this year)
  --mes         one month (01-12) instead of the whole ejercicio
  --anio        calendar year of --mes (default the ejercicio)
Shows the F2002 (IVA por actividad) of the active CUIT (\`sosc-axi cuits use\` selects it): débito and crédito
fiscal per alícuota, notas de crédito, compras no gravadas, retenciones and percepciones sufridas.
examples:
  sosc-axi iva --mes 09
  sosc-axi iva --ejercicio 2025
`;

type Row = Record<string, unknown>;

const debito = (r: Row) => ({
  actividad: str(r.codactividad),
  descripcion: str(r.descripcion),
  alicuota: num(r.alicuota),
  neto: cents(num(r.montoneto)),
  iva: cents(num(r.montoiva)),
  total: cents(num(r.total)),
});

const credito = (r: Row) => ({
  descripcion: str(r.descripcion),
  alicuota: num(r.alicuota),
  neto: cents(num(r.montoneto)),
  iva: cents(num(r.montoiva)),
  no_computable: cents(num(r.montoivanocomputable)),
  total: cents(num(r.total)),
});

async function run(args: string[]) {
  const { values } = parse("iva", args, PERIODO_FISCAL_FLAGS);
  const p = periodoFiscal(values);
  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<Record<string, Row[] | undefined>>(`/iva/listado/${p.ejercicio}?${p.query}`, {
    token: jwtc,
    usuario,
  });
  const rows = (key: string) => (Array.isArray(res?.[key]) ? res[key] : []);
  // The API lists every retención account, null when nothing was booked to it.
  const sections = {
    debito: rows("debitofiscal").map(debito),
    nc_emitidas: rows("ncemitidas").map(debito),
    credito: rows("creditofiscal").map(credito),
    nc_recibidas: rows("ncrecibidas").map(credito),
    no_gravadas: rows("cfacuenta").map((r) => ({
      descripcion: str(r.descripcion),
      condicion: str(r.condicioniva),
      neto: cents(num(r.montoneto)),
    })),
    retenciones: rows("retenciones")
      .filter((r) => r.montoneto != null)
      .map((r) => ({ descripcion: str(r.descripcion), monto: cents(num(r.montoneto)) })),
    // Booked negative (they reduce the saldo); shown as the amount suffered.
    percepciones: rows("ivatomableacuenta").map((r) => ({
      fecha: str(r.fecha).slice(0, 10),
      cuit: str(r.cuit),
      comprobante: str(r.numeropercepcion),
      monto: cents(-num(r.montoneto)),
    })),
    inconsistencias: rows("inconsistencia").map((r) => ({
      memo: str(r.memo_inconsistencia),
      total: cents(num(r.total)),
    })),
  };
  const present = Object.entries(sections).filter(([, v]) => v.length);
  if (!present.length) return { iva: `0 movimientos in ${p.when}` };
  return { cuit: cuit.cuit, periodo: p.when, ...Object.fromEntries(present) };
}

export const iva: Command = {
  name: "iva",
  summary: "F2002 IVA por actividad of the active CUIT: débito, crédito, retenciones and percepciones",
  help,
  module: "iva",
  run,
};
