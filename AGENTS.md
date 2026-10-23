# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

Command behavior, development, the agent skill, and releases are owned by [README.md](README.md). Follow the section named below instead of restating it here.

- `sosc-axi` is an AXI CLI ([axi.md](https://axi.md)) for the SOS Contador API, published to npm and run via `npx`. Scope is the API in `openapi/sos-contador.openapi.yaml`, nothing it cannot do.
- Bun is the dev toolchain, but the published binary runs on **Node >= 20**. `bin/` and `src/` use `node:*` APIs only (no `Bun.*`, `bun:*`); `tsc` enforces it. Bun APIs are fine in `scripts/` and `test/` ([README Development](README.md#development)).
- One file per command in `src/commands/<name>.ts`, exporting a `Command` (name, summary, help, run, `module` = the OpenAPI tag it wraps), registered in `src/commands/index.ts`. Help starts with `usage: sosc-axi <name>`. `update` is the SDK built-in, never a local command.
- Parse flags with `parse()` from `src/args.ts`: strict, unknown flags and extra positionals are a `VALIDATION_ERROR` listing the valid flags. Mutations that change nothing say `(no-op)` and succeed.
- Call the API only through `api()` in `src/api.ts`. The API reports most failures as HTTP 200 with `{"error": "Error: ..."}`; `api()` turns those into `API_ERROR`. Response schemas are not published; parse by shape (see `findCuits`).
- When a call site deviates from the spec, that's a deliberate workaround, and a comment at the call site explains it (e.g. `cobros view` calls `/pago/detalle` because `/cobro/detalle` fails server-side). Read that comment before you report a mismatch. A spec path counts as wrapped only if its literal appears in `src/`.
- Two tokens: the user `jwt` from `POST /login` (`userJwt`, used by `/cuit/*`) and a per-CUIT `jwtc` from `/cuit/credentials/:id` (`cuitJwt`, used by business endpoints). Check each path's `security` in the spec. Tokens carry no `exp`, so session status is often "unknown expiry".
- Passwords are never stored, never taken in argv or env, and never printed. `login` prompts in the user's terminal (`--password-stdin` for CI); without a TTY it fails asking the user to log in, so agents never handle credentials. Hints use `loginHint()`. The store (`src/store.ts`) holds tokens only, at mode 0600. `SOSC_DEBUG` output must keep `jwt`/`jwtc` redacted ([README Accounts and CUITs](README.md#accounts-and-cuits)).
- Every command has `test/commands/<name>.test.ts` and every shared module a `test/<module>.test.ts`. Use `useSandbox()` and `mockApi()` from `test/helpers.ts`; never `mock.module` (it leaks across files) and never hit the real API. `test/cli.test.ts` is the e2e over the built `dist` on Node. Coverage gate is 90% per file (`bunfig.toml`); check the exit code, not just the table.
- The skill stays a stub that defers to the CLI. Extend `SKILL_DESCRIPTION` in `src/skill.ts` when adding commands; never restate CLI help there ([README Agent skill](README.md#agent-skill)).

## Development

```sh
bun install --frozen-lockfile
bun run lint:fix     # Biome; CI runs `biome ci`
bun run typecheck
bun test --coverage
bun run build:skill
```

Generated, never hand-edited: `openapi/` (`bun run sync:openapi`), `skills/sosc-axi/SKILL.md` (`bun run build:skill`), `CHANGELOG.md` and `.release-please-manifest.json` (release-please; guarded in CI).

## Release

Commits follow Conventional Commits; release-please cuts the changelog and bumps the patch for `fix`/`feat` and the minor for breaking changes while on 0.x ([README Releases](README.md#releases)).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
