import { listado, oneOf } from "../listado.ts";
import type { Command } from "./index.ts";

const MODOS = ["facturas", "borradores", "notascredito"];
const CAES = ["todas", "concae", "sincae"];

const help = `usage: sosc-axi ventas [--modo <modo>] [--cae <filtro>] [--periodo <periodo> | --desde <fecha> --hasta <fecha>]
                     [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --modo        facturas (default), borradores, notascredito
  --cae         todas (default), concae, sincae
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --desde/--hasta AAAA-MM-DD date range, instead of --periodo
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the sales of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi ventas
  sosc-axi ventas --periodo mes_anterior --cae sincae
  sosc-axi ventas --modo notascredito --desde 2026-01-01 --hasta 2026-03-31
`;

export const ventas: Command = {
  name: "ventas",
  summary: "List sales (facturas, borradores, notas de credito) of the active CUIT",
  help,
  module: "venta",
  run: (args) =>
    listado({
      command: "ventas",
      party: "cliente",
      args,
      flags: { modo: { type: "string" }, cae: { type: "string" } },
      path: (periodo, v) =>
        `/venta/listado/${oneOf("modo", v.modo, MODOS) ?? "facturas"}/${periodo}/${oneOf("cae", v.cae, CAES) ?? "todas"}`,
    }),
};
