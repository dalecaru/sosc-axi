import { detalle, listado } from "../comprobantes.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi compras [--periodo <periodo> | --desde <fecha> --hasta <fecha>]
                      [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi compras view <id> [--usuario <email>]
flags:
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --desde/--hasta AAAA-MM-DD date range, instead of --periodo
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the purchases of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi compras
  sosc-axi compras --periodo mes_anterior
  sosc-axi compras --desde 2026-01-01 --hasta 2026-03-31 --pagina 2
  sosc-axi compras view 931760031
`;

export const compras: Command = {
  name: "compras",
  summary: "List purchases of the active CUIT; `compras view <id>` shows one",
  help,
  module: "compra",
  run: (args) =>
    args[0] === "view"
      ? detalle({ command: "compras", party: "proveedor", base: "/compra", args: args.slice(1) })
      : listado({ command: "compras", party: "proveedor", args, path: (periodo) => `/compra/listado/${periodo}` }),
};
