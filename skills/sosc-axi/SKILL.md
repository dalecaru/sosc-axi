---
name: sosc-axi
description: "Operate the SOS Contador accounting API (Argentina) through the sosc-axi CLI - log in one or more users, list and select CUITs. Use whenever a task touches SOS Contador or the books of an Argentine CUIT kept there."
user-invocable: false
author: Damián Caruso (dalecaru)
---

# sosc-axi

Agent-ergonomic CLI for the SOS Contador accounting API (Argentina)

Use sosc-axi whenever a task touches SOS Contador: accounts, CUITs, or accounting data kept there.

## Current guidance lives in the CLI

Do not follow command, flag, or workflow instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- `npx -y sosc-axi@alpha` for the current session state and next steps
- `npx -y sosc-axi@alpha --help` for global flags and the command index
- `npx -y sosc-axi@alpha <command> --help` for per-command usage
