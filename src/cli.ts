import { runAxiCli } from "axi-sdk-js";
import { accounts, cuits, login, logout, status } from "./auth.ts";
import { VERSION } from "./version.ts";

export const DESCRIPTION = "Agent-ergonomic CLI for the SOS Contador accounting API (Argentina)";

const TOP_LEVEL_HELP = `usage: sosc-axi <command> [args] [flags]
commands:
  login     Log in a SOS Contador user (multiple accounts supported)
  logout    Remove a logged-in account
  accounts  List logged-in accounts; \`accounts use <usuario>\` switches the default
  cuits     List CUITs of the account; \`cuits use <id|cuit>\` selects one
global flags:
  --usuario <email>  act as this logged-in account instead of the default
`;

const HELP: Record<string, string> = {
  login: `usage: sosc-axi login --usuario <email> [--password-stdin]
flags:
  --usuario <email>   SOS Contador user (or SOSC_USERNAME)
  --password-stdin    read the password from stdin (else SOSC_PASSWORD)
Logs in, stores the session token (never the password), makes it the default account
and lists its CUITs. Log in several users to work with multiple accounts.
examples:
  printf '%s' "$PASS" | sosc-axi login --usuario ana@estudio.com --password-stdin
  SOSC_PASSWORD=... sosc-axi login --usuario ana@estudio.com
`,
  logout: `usage: sosc-axi logout [--usuario <email>]
Removes the stored session of the default account (or --usuario). No-op if not logged in.
examples:
  sosc-axi logout
  sosc-axi logout --usuario ana@estudio.com
`,
  accounts: `usage: sosc-axi accounts | sosc-axi accounts use <usuario>
Lists logged-in accounts with session status, or switches the default account.
examples:
  sosc-axi accounts
  sosc-axi accounts use ana@estudio.com
`,
  cuits: `usage: sosc-axi cuits [--usuario <email>] | sosc-axi cuits use <id|cuit> [--usuario <email>]
Lists the CUITs (own or shared) the account can access, or selects the active one
and fetches its credentials.
examples:
  sosc-axi cuits
  sosc-axi cuits use 20-12345678-9
  sosc-axi cuits use 3395 --usuario ana@estudio.com
`,
};

export async function main(argv = process.argv.slice(2)) {
  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    argv,
    topLevelHelp: TOP_LEVEL_HELP,
    getCommandHelp: (command) => HELP[command],
    home: () => status(),
    commands: { login, logout, accounts, cuits },
  });
}
