import type { AxiCliCommand } from "axi-sdk-js";
import { accounts } from "./accounts.ts";
import { cuits } from "./cuits.ts";
import { login } from "./login.ts";
import { logout } from "./logout.ts";

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
export const COMMANDS: Command[] = [login, logout, accounts, cuits];
