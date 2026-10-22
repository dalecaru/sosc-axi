import { detalle, listado } from "../comprobantes.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi pagos [--periodo <periodo>] [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi pagos view <id> [--usuario <email>]
flags:
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the payments (money out) of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi pagos
  sosc-axi pagos --periodo mes_anterior --pagina 2
  sosc-axi pagos view 930159905
`;

export const pagos: Command = {
  name: "pagos",
  summary: "List payments (money out) of the active CUIT; `pagos view <id>` shows one",
  help,
  module: "pago",
  run: (args) =>
    args[0] === "view"
      ? detalle({ command: "pagos", party: "proveedor", base: "/pago", args: args.slice(1) })
      : listado({
          command: "pagos",
          party: "proveedor",
          args,
          range: false,
          cae: false,
          path: (periodo) => `/pago/listado/${periodo}`,
        }),
};
