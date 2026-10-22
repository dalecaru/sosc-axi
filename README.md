<h1 align="center">sosc-axi</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/sosc-axi"><img alt="npm" src="https://img.shields.io/npm/v/sosc-axi?style=flat-square" /></a>
  <a href="https://github.com/dalecaru/sosc-axi/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/dalecaru/sosc-axi/ci.yml?branch=main&style=flat-square&label=ci" /></a>
  <a href="https://github.com/dalecaru/sosc-axi/actions/workflows/release-please.yml"><img alt="Release" src="https://img.shields.io/github/actions/workflow/status/dalecaru/sosc-axi/release-please.yml?branch=main&style=flat-square&label=release" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue?style=flat-square" />
</p>

Agent-ergonomic CLI for the [SOS Contador](https://www.sos-contador.com) accounting API (Argentina), built on the [AXI](https://axi.md) conventions: token-efficient [TOON](https://toonformat.dev) output, structured errors on stdout, next-step hints, and no interactive prompts (except `login`, which the user runs in their own terminal).

## Use

```sh
npx -y sosc-axi                # no install, always the latest release
npm install -g sosc-axi        # or install it as `sosc-axi`
```

The examples below use the installed `sosc-axi`; with npx, prefix them with `npx -y`.

## Accounts and CUITs

SOS Contador authenticates a **user** (`POST /login`) and then each **CUIT** the user can access (`GET /cuit/credentials/:idcuit`). `sosc-axi` stores both tokens per account, so several users and CUITs can be used side by side. Passwords are never stored.

Log in from your own terminal, not through an agent: `login` prompts for the user and password, so the agent never sees them. Agents only use the stored session.

```sh
sosc-axi login                       # prompts for usuario and password
sosc-axi status                      # check the session and active CUIT against the API
sosc-axi cuits                       # CUITs the account can access
sosc-axi cuits use 20123456789       # select the working CUIT
sosc-axi login --usuario bob@estudio.com   # add another account
sosc-axi accounts                    # list logged-in accounts
sosc-axi accounts use ana@estudio.com
sosc-axi cuits --usuario bob@estudio.com   # act as a non-default account
sosc-axi logout [--usuario <email>]
```

Sessions live in `~/.config/sosc-axi/accounts.json` (mode 0600). Override with `SOSC_AXI_HOME` or `XDG_CONFIG_HOME`.

| Env | Purpose |
| --- | --- |
| `SOSC_API_URL` | API base URL (default `https://api.sos-contador.com/api-comunidad`) |
| `SOSC_DEBUG=1` | log API responses to stderr, tokens redacted |

## Ventas, compras, cobros, pagos and recibos

Read-only listings and detail for the active CUIT, 50 rows per page:

```sh
sosc-axi ventas                                   # facturas of this month
sosc-axi ventas --modo notascredito --cae sincae --periodo mes_anterior
sosc-axi compras --desde 2026-01-01 --hasta 2026-03-31 --pagina 2
sosc-axi ventas view 933742304                    # one invoice with imputaciones and productos
sosc-axi cobros --periodo mes_anterior            # money in
sosc-axi pagos view 930159905                     # one payment with imputaciones
sosc-axi recibos                                  # receipts, list only
```

`--periodo` is `hoy`, `ayer`, `semana`, `mes` (default) or `mes_anterior`; for ventas and compras `--desde/--hasta` (AAAA-MM-DD) selects a range instead (the API has no range for cobros, pagos and recibos).

## Cuenta corriente

Balances per cliente or proveedor for the active CUIT, and the movements of one:

```sh
sosc-axi cuentacorriente                               # balance per cliente, this year
sosc-axi cuentacorriente --proveedores --pendientes    # unmatched supplier movements
sosc-axi cuentacorriente --clipro 25101884 --desde 2025-01-01   # movements with a running saldo
```

`--desde` defaults to January 1 of this year and `--hasta` to today; earlier movements fold into a "Saldo anterior" row.

## IVA and AFIP e-ventanilla

Tax reports and the AFIP inbox for the active CUIT:

```sh
sosc-axi libroiva ventas --mes 09                 # Libro IVA Ventas of September, with totals
sosc-axi libroiva compras --ejercicio 2025        # the whole 2025 ejercicio
sosc-axi iva --mes 09                             # F2002: débito, crédito, retenciones and percepciones
sosc-axi eventanilla                              # AFIP communications of the last 30 days
```

`--ejercicio` defaults to this year and `--mes` (01-12) narrows it to one month. AFIP serves e-ventanilla at most 90 days back from `--hasta`. `sosc-axi <command> --help` lists every flag.

## Clientes, productos and puntos de venta

Master data of the active CUIT, read-only:

```sh
sosc-axi clientes                                 # clientes and proveedores, 50 per page
sosc-axi clientes --tipo proveedor --pagina 2
sosc-axi productos                                # id, price, IVA rate and unit
sosc-axi puntosventa                              # number and name
```

## API spec

`openapi/sos-contador.openapi.yaml` is generated from the [official Postman documentation](https://documenter.getpostman.com/view/1566360/SWTD6vnC?version=latest), whose raw collection is kept next to it. Do not edit either file by hand.

```sh
bun run sync:openapi            # fetch upstream and regenerate
bun run sync:openapi --check    # fail if stale
```

A weekly GitHub Action opens a PR when upstream changes.

## Development

Bun is the dev toolchain; the published binary runs on **Node >= 20** (that is what `npx` uses), so `src/` must stick to `node:*` APIs.

```sh
bun install
bun run dev -- <command>   # run from source
bun test
bun run typecheck
bun run lint               # Biome lint + format check (lint:fix to apply)
bun run build              # dist/sosc-axi.js
```

## Agent skill

`skills/sosc-axi/SKILL.md` ships in the npm package and the repo so agents know when to reach for the CLI. It is a short stub that points at `sosc-axi --help` (which never goes stale) and is generated from `src/skill.ts`:

```sh
bun run build:skill            # regenerate after changing src/skill.ts or the CLI description
bun run build:skill --check    # fail if stale (also covered by bun test)
```

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org) on `main` and published to npm `latest`. While on 0.x:

- `fix:`, `feat:` -> patch (`0.1.1` -> `0.1.2`)
- `feat!:` / `BREAKING CHANGE:` -> minor (`0.1.x` -> `0.2.0`)
- `docs:`, `chore:`, `ci:`, `test:`, `refactor:` -> no release on their own

Every push to `main` updates a release PR with the next version and the `CHANGELOG.md` entry. Merging it tags the release, creates the GitHub release and publishes to npm with provenance. `CHANGELOG.md` and `.release-please-manifest.json` are generated, never edit them (CI rejects PRs that do).

## License

MIT
