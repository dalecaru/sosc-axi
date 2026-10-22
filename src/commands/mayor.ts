import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { cents, num, positive, str, year } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi mayor <cuenta> [--ejercicio <AAAA>] [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --ejercicio   fiscal year (default this year)
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the libro mayor (general ledger) movements of one cuenta of the active CUIT (\`sosc-axi cuits use\` selects it)
for the whole ejercicio; the API has no date range. <cuenta> is a code from \`sosc-axi cuentas\`, or a prefix
like 01.01.01 for every cuenta under it. \`sosc-axi sumasysaldos\` totals each cuenta between dates.
examples:
  sosc-axi mayor 01.01.01.001.001
  sosc-axi mayor 01.01.01 --ejercicio 2025 --pagina 2
`;

type Movimiento = Record<string, unknown>;

async function run(args: string[]) {
  const { values, positionals } = parse(
    "mayor",
    args,
    {
      ejercicio: { type: "string" },
      pagina: { type: "string" },
      registros: { type: "string" },
      usuario: { type: "string" },
    },
    1,
  );
  const cuenta = positionals[0];
  if (!cuenta || !/^\d+(\.\d+)*$/.test(cuenta)) {
    throw new AxiError("cuenta code is required, e.g. 01.01.01.001.001", "VALIDATION_ERROR", [
      "Run `sosc-axi cuentas` to list cuenta codes",
    ]);
  }
  const ejercicio = year("ejercicio", values.ejercicio ?? String(new Date().getFullYear()));
  const pagina = positive("pagina", values.pagina, 1);
  const registros = positive("registros", values.registros, 50);
  // The API reads pagina as a 1-based row offset, not a page number.
  const query = new URLSearchParams({
    arbol: cuenta,
    pagina: String((pagina - 1) * registros + 1),
    registros: String(registros),
  });

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  let res: { items?: Movimiento[] };
  try {
    res = await api(`/mayor/listado/${ejercicio}?${query}`, { token: jwtc, usuario });
  } catch (error) {
    // A cuenta the CUIT does not have crashes the API with "reading 'fechadesde'".
    if ((error as AxiError).code === "API_ERROR" && /fechadesde/.test((error as Error).message)) {
      throw new AxiError(`cuenta ${cuenta} not found for the active CUIT`, "NOT_FOUND", [
        "Run `sosc-axi cuentas` to list cuenta codes",
      ]);
    }
    throw error;
  }
  const items = Array.isArray(res?.items) ? res.items : [];
  const when = `cuenta ${cuenta} in ${ejercicio}`;

  if (!items.length)
    return { mayor: pagina > 1 ? `0 movimientos on page ${pagina} (${when})` : `0 movimientos for ${when}` };
  return {
    cuit: cuit.cuit,
    count: `${items.length} movimientos for ${when}, page ${pagina}`,
    // montosaldo is debe - haber of the row, not a running balance, so it is left out.
    movimientos: items.map((m) => ({
      fecha: str(m.fecha).slice(0, 10),
      cuenta: str(m.cuenta),
      comprobante: str(m.numero),
      clipro: str(m.clipro),
      cuit: str(m.cuit),
      debe: cents(num(m.montodebe)),
      haber: cents(num(m.montohaber)),
    })),
    ...(items.length === registros ? { help: [`Run with \`--pagina ${pagina + 1}\` for more`] } : {}),
  };
}

export const mayor: Command = {
  name: "mayor",
  summary: "Libro mayor (general ledger) of one cuenta of the active CUIT for an ejercicio",
  help,
  module: "mayor",
  run,
};
