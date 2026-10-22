import { detalle, listado, oneOf } from "../comprobantes.ts";
import type { Command } from "./index.ts";

const MODOS = ["facturas", "borradores", "notascredito"];
const CAES = ["todas", "concae", "sincae"];

const help = `usage: sosc-axi ventas [--modo <modo>] [--cae <filtro>] [--periodo <periodo> | --desde <fecha> --hasta <fecha>]
                     [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi ventas view <id> [--usuario <email>]
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
  sosc-axi ventas view 933742304
`;

export const ventas: Command = {
  name: "ventas",
  summary: "List sales of the active CUIT; `ventas view <id>` shows one",
  help,
  module: "venta",
  run: (args) =>
    args[0] === "view"
      ? detalle({ command: "ventas", party: "cliente", base: "/venta", args: args.slice(1) })
      : listado({
          command: "ventas",
          party: "cliente",
          args,
          flags: { modo: { type: "string" }, cae: { type: "string" } },
          path: (periodo, v) =>
            `/venta/listado/${oneOf("modo", v.modo, MODOS) ?? "facturas"}/${periodo}/${oneOf("cae", v.cae, CAES) ?? "todas"}`,
        }),
};
