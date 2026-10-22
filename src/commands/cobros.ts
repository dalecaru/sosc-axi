import { detalle, listado } from "../comprobantes.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi cobros [--periodo <periodo>] [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi cobros view <id> [--usuario <email>]
flags:
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the collections (money in) of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi cobros
  sosc-axi cobros --periodo mes_anterior --pagina 2
  sosc-axi cobros view 945761326
`;

export const cobros: Command = {
  name: "cobros",
  summary: "List collections (money in) of the active CUIT; `cobros view <id>` shows one",
  help,
  module: "cobro",
  run: (args) =>
    args[0] === "view"
      ? // /cobro/detalle fails server-side ("comprobante is not defined"); /pago/detalle serves cobros too.
        detalle({ command: "cobros", party: "cliente", base: "/pago", args: args.slice(1) })
      : listado({
          command: "cobros",
          party: "cliente",
          args,
          range: false,
          cae: false,
          path: (periodo) => `/cobro/listado/${periodo}`,
        }),
};
