---
name: sosc-axi
description: "Operate the SOS Contador accounting API (Argentina) through the sosc-axi CLI - check the session with status, list and select CUITs, list and search ventas (sales) and issue them (create with CAE, PDF, email), compras (purchases), cobros (collections), pagos (payments) and recibos (receipts), read the cuenta corriente (balances) of clientes and proveedores, the libro IVA, the IVA F2002 and the AFIP e-ventanilla inbox, read the books (asientos, libro mayor, sumas y saldos), and list clientes, proveedores, productos, puntos de venta, the plan de cuentas, centros de costo, grupos de modificadores, AFIP units of measure, provincias and índices de ajuste por inflación. Use whenever a task touches SOS Contador or the books of an Argentine CUIT kept there."
user-invocable: false
author: Damián Caruso (dalecaru)
---

# sosc-axi

Agent-ergonomic CLI for the SOS Contador accounting API (Argentina)

Use sosc-axi whenever a task touches SOS Contador: accounts, CUITs, or accounting data kept there.

Always run it as `npx -y sosc-axi <command>`, also when CLI hints say `sosc-axi <command>`.

## Current guidance lives in the CLI

Do not follow command, flag, or workflow instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- `npx -y sosc-axi` for the current session state and next steps
- `npx -y sosc-axi --help` for global flags and the command index
- `npx -y sosc-axi <command> --help` for per-command usage
