import type { AxiCliCommand } from "axi-sdk-js";
import { accounts } from "./accounts.ts";
import { cobros } from "./cobros.ts";
import { compras } from "./compras.ts";
import { cuentacorriente } from "./cuentacorriente.ts";
import { cuits } from "./cuits.ts";
import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { pagos } from "./pagos.ts";
import { recibos } from "./recibos.ts";
import { status } from "./status.ts";
import { ventas } from "./ventas.ts";

export type Command = {
  name: string;
  /** One line for the top-level command index. */
  summary: string;
  /** Full `sosc-axi <name> --help` text. */
  help: string;
  /** OpenAPI tag (openapi/sos-contador.openapi.yaml) this command wraps; omit for local-only commands. */
  module?: string;
  run: AxiCliCommand<undefined>;
};

// One file per command. Add a command: create src/commands/<name>.ts, register it here.
export const COMMANDS: Command[] = [
  login,
  logout,
  status,
  accounts,
  cuits,
  ventas,
  compras,
  cobros,
  pagos,
  recibos,
  cuentacorriente,
];
