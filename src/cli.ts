import { runAxiCli } from "axi-sdk-js";
import { home } from "./commands/home.ts";
import { COMMANDS } from "./commands/index.ts";
import { VERSION } from "./version.ts";

export const DESCRIPTION = "Agent-ergonomic CLI for the SOS Contador accounting API (Argentina)";

const TOP_LEVEL_HELP = `usage: sosc-axi <command> [args] [flags]
commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(9)} ${c.summary}`).join("\n")}
global flags:
  --usuario <email>  act as this logged-in account instead of the default
`;

export async function main(argv = process.argv.slice(2)) {
  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    packageName: "sosc-axi",
    argv,
    topLevelHelp: TOP_LEVEL_HELP,
    getCommandHelp: (name) => COMMANDS.find((c) => c.name === name)?.help,
    home,
    commands: Object.fromEntries(COMMANDS.map((c) => [c.name, c.run])),
  });
}
