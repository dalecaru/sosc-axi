<h1 align="center">sosc-axi</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/sosc-axi"><img alt="npm" src="https://img.shields.io/npm/v/sosc-axi/alpha?style=flat-square" /></a>
  <a href="https://github.com/dalecaru/sosc-axi/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/dalecaru/sosc-axi/ci.yml?branch=main&style=flat-square&label=ci" /></a>
  <a href="https://github.com/dalecaru/sosc-axi/actions/workflows/release-please.yml"><img alt="Release" src="https://img.shields.io/github/actions/workflow/status/dalecaru/sosc-axi/release-please.yml?branch=main&style=flat-square&label=release" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue?style=flat-square" />
</p>

Agent-ergonomic CLI for the [SOS Contador](https://www.sos-contador.com) accounting API (Argentina), built on the [AXI](https://axi.md) conventions: token-efficient [TOON](https://toonformat.dev) output, structured errors on stdout, no interactive prompts, and next-step hints.

> Alpha. Commands and output may change between releases.

## Use

```sh
npx -y sosc-axi@alpha
```

## Accounts and CUITs

SOS Contador authenticates a **user** (`POST /login`) and then each **CUIT** the user can access (`GET /cuit/credentials/:idcuit`). `sosc-axi` stores both tokens per account, so several users and CUITs can be used side by side. Passwords are never stored.

```sh
printf '%s' "$PASS" | sosc-axi login --usuario ana@estudio.com --password-stdin
sosc-axi cuits                       # CUITs the account can access
sosc-axi cuits use 20-12345678-9     # select the working CUIT
sosc-axi login --usuario bob@estudio.com --password-stdin   # add another account
sosc-axi accounts                    # list logged-in accounts
sosc-axi accounts use ana@estudio.com
sosc-axi cuits --usuario bob@estudio.com   # act as a non-default account
sosc-axi logout [--usuario <email>]
```

Sessions live in `~/.config/sosc-axi/accounts.json` (mode 0600). Override with `SOSC_AXI_HOME` or `XDG_CONFIG_HOME`.

| Env | Purpose |
| --- | --- |
| `SOSC_USERNAME` / `SOSC_PASSWORD` | login credentials when flags/stdin are not given |
| `SOSC_API_URL` | API base URL (default `https://api.sos-contador.com/api-comunidad`) |
| `SOSC_DEBUG=1` | log API responses to stderr, tokens redacted |

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

Versions follow [SemVer](https://semver.org) and are cut by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org) on `main`:

- `fix:` -> patch, `feat:` -> minor, `feat!:` / `BREAKING CHANGE:` -> major (minor while on 0.x)
- `docs:`, `chore:`, `test:`, `refactor:` -> no release on their own

Every push to `main` updates a release PR with the next version and the `CHANGELOG.md` entry. Merging it tags the release, creates the GitHub release and publishes to npm with provenance. `CHANGELOG.md` and `.release-please-manifest.json` are generated, never edit them (CI rejects PRs that do).

Release channels, picked from the version:

| Version | npm dist-tag | How to get there |
| --- | --- | --- |
| `0.x.y-alpha.N` | `alpha` | default while `prerelease-type` is `alpha` |
| `0.x.y-rc.N` | `rc` | set `prerelease-type` to `rc` and push a commit with footer `Release-As: 0.x.y-rc.0` |
| `x.y.z` | `latest` | drop `prerelease`, `prerelease-type` and `versioning` from `release-please-config.json` and push a commit with footer `Release-As: x.y.z` |

```sh
git commit --allow-empty -m "chore: release 0.1.0-rc.0" -m "Release-As: 0.1.0-rc.0"
```

## License

MIT
