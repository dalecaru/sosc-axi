import { parseArgs } from "node:util";
import { AxiError } from "axi-sdk-js";

type Flags = Record<string, { type: "string" | "boolean" }>;

/**
 * Strict per-command flag parsing: unknown flags and extra positionals are
 * rejected with a VALIDATION_ERROR (exit 2) that lists the valid flags.
 */
export function parse<F extends Flags>(command: string, args: string[], flags: F, maxPositionals = 0) {
  const valid = Object.keys(flags).map((f) => `--${f}`);
  const hint = `valid flags for \`${command}\`: ${valid.join(", ") || "(none)"} (--help always allowed)`;
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, options: flags, allowPositionals: true, strict: true });
  } catch (error) {
    const msg = (error as Error).message;
    const flag = msg.match(/'(-[^']+)'/)?.[1];
    if ((error as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" && flag) {
      throw new AxiError(`unknown flag ${flag.split(" ")[0]} for \`${command}\``, "VALIDATION_ERROR", [hint]);
    }
    throw new AxiError(msg.split("\n")[0]!, "VALIDATION_ERROR", [hint]);
  }
  if (parsed.positionals.length > maxPositionals) {
    throw new AxiError(
      `unexpected argument ${parsed.positionals[maxPositionals]} for \`${command}\``,
      "VALIDATION_ERROR",
      [`Run \`sosc-axi ${command.split(" ")[0]} --help\``],
    );
  }
  return parsed as {
    values: { [K in keyof F]?: F[K]["type"] extends "boolean" ? boolean : string };
    positionals: string[];
  };
}
