import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, date, num, str, year } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi sumasysaldos [--ejercicio <AAAA>] [--desde <fecha>] [--hasta <fecha>] [--usuario <email>]
flags:
  --ejercicio   fiscal year (default the year of --desde, else this year)
  --desde       AAAA-MM-DD (default the start of the ejercicio)
  --hasta       AAAA-MM-DD (default the end of the ejercicio)
Lists the balance de sumas y saldos (trial balance) of the active CUIT (\`sosc-axi cuits use\` selects it): debe, haber
and saldo per cuenta, with totals. The API keeps the range within the ejercicio. saldo_inicial is the asiento de
apertura and only counts when --desde is the start of the ejercicio; movements before --desde are not carried.
examples:
  sosc-axi sumasysaldos
  sosc-axi sumasysaldos --desde 2026-09-01 --hasta 2026-09-30
  sosc-axi sumasysaldos --ejercicio 2025
`;

// The API reads each date one day early (2026-10-01 means 2026-09-30), so send the next day.
const nextDay = (d: string) => new Date(Date.parse(d) + 86_400_000).toJSON().slice(0, 10);

async function run(args: string[]) {
  const { values } = parse("sumasysaldos", args, {
    ejercicio: { type: "string" },
    desde: { type: "string" },
    hasta: { type: "string" },
    usuario: { type: "string" },
  });
  const desde = values.desde === undefined ? undefined : date("desde", values.desde);
  const hasta = values.hasta === undefined ? undefined : date("hasta", values.hasta);
  const ejercicio = year(
    "ejercicio",
    values.ejercicio ?? (desde ?? hasta)?.slice(0, 4) ?? String(new Date().getFullYear()),
  );
  const query = new URLSearchParams({
    fechadesde: nextDay(desde ?? `${ejercicio}-01-01`),
    fechahasta: nextDay(hasta ?? `${ejercicio}-12-31`),
  });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ fechadesde?: unknown; fechahasta?: unknown; items?: Record<string, unknown>[] }>(
    `/sumasysaldos/listado/${ejercicio}?${query}`,
    { token: jwtc, usuario },
  );
  // The response echoes the range it used, after clamping to the ejercicio.
  const from = str(res?.fechadesde).slice(0, 10) || desde || `${ejercicio}-01-01`;
  const to = str(res?.fechahasta).slice(0, 10) || hasta || `${ejercicio}-12-31`;
  const items = Array.isArray(res?.items) ? res.items : [];

  if (!items.length) return { sumasysaldos: `0 cuentas with movements in ${from} to ${to}` };
  const cuentas = items.map((c) => ({
    codigo: str(c.codigo),
    cuenta: str(c.cuenta),
    saldo_inicial: cents(num(c.montosaldo_ini)),
    debe: cents(num(c.montodebe)),
    haber: cents(num(c.montohaber)),
    saldo: cents(num(c.montosaldo_fin)),
  }));
  return {
    cuit: cuit.cuit,
    sumasysaldos: `${cuentas.length} cuentas in ${from} to ${to}`,
    cuentas,
    totales: {
      debe: cents(cuentas.reduce((sum, c) => sum + c.debe, 0)),
      haber: cents(cuentas.reduce((sum, c) => sum + c.haber, 0)),
    },
    help: ["Run `sosc-axi mayor <codigo>` for the movements of one cuenta"],
  };
}

export const sumasysaldos: Command = {
  name: "sumasysaldos",
  summary: "Balance de sumas y saldos (trial balance) of the active CUIT between dates",
  help,
  module: "sumasysaldos",
  run,
};
