import type { AxiCliCommand } from "axi-sdk-js";
import { accounts } from "./accounts.ts";
import { asientos } from "./asientos.ts";
import { centroscosto } from "./centroscosto.ts";
import { clientes } from "./clientes.ts";
import { cobros } from "./cobros.ts";
import { compras } from "./compras.ts";
import { cuentacorriente } from "./cuentacorriente.ts";
import { cuentas } from "./cuentas.ts";
import { cuits } from "./cuits.ts";
import { eventanilla } from "./eventanilla.ts";
import { iva } from "./iva.ts";
import { libroiva } from "./libroiva.ts";
import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { mayor } from "./mayor.ts";
import { pagos } from "./pagos.ts";
import { productos } from "./productos.ts";
import { puntosventa } from "./puntosventa.ts";
import { recibos } from "./recibos.ts";
import { status } from "./status.ts";
import { sumasysaldos } from "./sumasysaldos.ts";
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
  libroiva,
  iva,
  eventanilla,
  asientos,
  mayor,
  sumasysaldos,
  clientes,
  productos,
  puntosventa,
  cuentas,
  centroscosto,
];
