import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { cuitRows, findCuits, LOGIN_HINT, token } from "../auth.ts";
import { type Account, loadStore, saveStore, tokenStatus } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi login --usuario <email> [--password-stdin]
flags:
  --usuario <email>   SOS Contador user (or SOSC_USERNAME)
  --password-stdin    read the password from stdin (else SOSC_PASSWORD)
Logs in, stores the session token (never the password), makes it the default account
and lists its CUITs. Log in several users to work with multiple accounts.
examples:
  printf '%s' "$PASS" | sosc-axi login --usuario ana@estudio.com --password-stdin
  SOSC_PASSWORD=... sosc-axi login --usuario ana@estudio.com
`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function run(args: string[]) {
  const { values } = parse("login", args, { usuario: { type: "string" }, "password-stdin": { type: "boolean" } });
  const usuario = values.usuario ?? process.env.SOSC_USERNAME;
  if (!usuario) {
    throw new AxiError("--usuario is required", "VALIDATION_ERROR", [
      "sosc-axi login --usuario <email> --password-stdin",
    ]);
  }
  const password = values["password-stdin"] ? await readStdin() : process.env.SOSC_PASSWORD;
  if (!password) {
    throw new AxiError("No password provided", "VALIDATION_ERROR", [
      `printf '%s' "$PASSWORD" | sosc-axi login --usuario ${usuario} --password-stdin`,
      "Or set SOSC_PASSWORD in the environment",
    ]);
  }

  const res = await api("/login", { method: "POST", body: { usuario, password }, usuario });
  const jwt = token(res, ["jwt", "token"]);
  if (!jwt) throw new AxiError("Login failed: invalid usuario or password", "AUTH_REQUIRED", [LOGIN_HINT]);

  const listed = findCuits(await api("/cuit/listado", { token: jwt, usuario }));
  const cuits = listed.length ? listed : findCuits(res);

  const store = loadStore();
  const prev = store.accounts[usuario];
  const keep = prev?.cuit && cuits.some((c) => c.id === prev.cuit) ? prev.cuit : undefined;
  const account: Account = { jwt, cuits, cuit: keep ?? (cuits.length === 1 ? cuits[0]!.id : undefined) };
  store.accounts[usuario] = account;
  store.default = usuario;
  saveStore(store);

  return {
    login: `${usuario} logged in (default account)`,
    session: tokenStatus(jwt),
    count: `${cuits.length} CUITs available`,
    cuits: cuitRows(cuits, account.cuit),
    help: account.cuit
      ? [`Active CUIT: ${account.cuit}. Run \`sosc-axi cuits use <id|cuit>\` to switch`]
      : cuits.length
        ? ["Run `sosc-axi cuits use <id|cuit>` to select the CUIT to work with"]
        : ["This user has no CUITs yet. Add one in SOS Contador, then run `sosc-axi cuits`"],
  };
}

export const login: Command = {
  name: "login",
  summary: "Log in a SOS Contador user (multiple accounts supported)",
  help,
  module: "acceso",
  run,
};
