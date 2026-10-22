import { listado } from "../comprobantes.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi recibos [--periodo <periodo>] [--pagina <n>] [--registros <n>] [--usuario <email>]
flags:
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
Lists the receipts of the active CUIT (\`sosc-axi cuits use\` selects it). The API has no recibo detail;
\`sosc-axi cobros view <id>\` shows the cobro behind a recibo (same id).
examples:
  sosc-axi recibos
  sosc-axi recibos --periodo mes_anterior --pagina 2
`;

export const recibos: Command = {
  name: "recibos",
  summary: "List receipts of the active CUIT",
  help,
  module: "recibo",
  run: (args) =>
    listado({
      command: "recibos",
      party: "cliente",
      args,
      range: false,
      cae: false,
      path: (periodo) => `/recibo/listado/${periodo}`,
    }),
};
