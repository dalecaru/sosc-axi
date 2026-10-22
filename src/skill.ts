import { DESCRIPTION } from "./cli.ts";

// Trigger string agents match against to auto-load the skill. Extend it as commands land.
export const SKILL_DESCRIPTION =
  "Operate the SOS Contador accounting API (Argentina) through the sosc-axi CLI - check the session with status, " +
  "list and select CUITs, list ventas (sales) and compras (purchases). Use whenever a task touches SOS Contador or the books of an Argentine CUIT kept there.";

// Hard cap so the stub cannot grow into a stale copy of the CLI help.
export const MAX_SKILL_MARKDOWN_CHARS = 2500;

/**
 * Render skills/sosc-axi/SKILL.md. A discovery stub, not a copy of CLI guidance:
 * installed skills go stale, `sosc-axi --help` does not.
 */
export function createSkillMarkdown(max = MAX_SKILL_MARKDOWN_CHARS): string {
  const markdown = `---
name: sosc-axi
description: ${JSON.stringify(SKILL_DESCRIPTION)}
user-invocable: false
author: Damián Caruso (dalecaru)
---

# sosc-axi

${DESCRIPTION}

Use sosc-axi whenever a task touches SOS Contador: accounts, CUITs, or accounting data kept there.

Always run it as \`npx -y sosc-axi <command>\`, also when CLI hints say \`sosc-axi <command>\`.

## Current guidance lives in the CLI

Do not follow command, flag, or workflow instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- \`npx -y sosc-axi\` for the current session state and next steps
- \`npx -y sosc-axi --help\` for global flags and the command index
- \`npx -y sosc-axi <command> --help\` for per-command usage
`;

  if (markdown.length > max) {
    throw new Error(
      `generated SKILL.md is ${markdown.length} chars; keep it a stub under ${max} and defer guidance to the CLI`,
    );
  }
  return markdown;
}
