import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { cuitRows, findCuits, loginHint, token } from "../auth.ts";
import { type Account, loadStore, saveStore, tokenStatus } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi login [--usuario <email>] [--password-stdin]
flags:
  --usuario <email>   SOS Contador user (prompted when omitted)
  --password-stdin    read the password from stdin, for CI and scripts
Prompts for the user and password in a terminal, stores the session token (never
the password), makes it the default account and lists its CUITs. Log in several
users to work with multiple accounts. Agents: ask the user to run this themselves.
examples:
  sosc-axi login
  sosc-axi login --usuario ana@estudio.com
`;

/** Terminal prompts, on stderr so stdout stays TOON. Swappable in tests. */
export const tty = {
  interactive: () => Boolean(process.stdin.isTTY),
  async ask(question: string, hidden = false, input: NodeJS.ReadableStream = process.stdin): Promise<string> {
    const output = process.stderr;
    const muted = new Writable({ write: (_chunk, _enc, done) => done() });
    const rl = createInterface({ input, output: hidden ? muted : output, terminal: hidden });
    rl.on("SIGINT", () => process.exit(130)); // raw mode swallows Ctrl+C otherwise
    if (hidden) output.write(question);
    try {
      return (await rl.question(hidden ? "" : question)).trim();
    } finally {
      rl.close();
      if (hidden) output.write("\n");
    }
  },
};

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function run(args: string[]) {
  const { values } = parse("login", args, { usuario: { type: "string" }, "password-stdin": { type: "boolean" } });
  let usuario = values.usuario;
  let password = values["password-stdin"] ? await readStdin() : "";
  if (tty.interactive()) {
    usuario ||= await tty.ask("SOS Contador usuario (email): ");
    password ||= await tty.ask("Password: ", true);
  }
  if (!usuario || !password) {
    throw new AxiError("login needs the user's terminal to prompt for the password", "VALIDATION_ERROR", [
      loginHint(usuario),
    ]);
  }

  const res = await api("/login", { method: "POST", body: { usuario, password }, usuario });
  const jwt = token(res, ["jwt", "token"]);
  if (!jwt) throw new AxiError("Login failed: invalid usuario or password", "AUTH_REQUIRED", [loginHint(usuario)]);

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
      ? [`Active CUIT: ${cuits.find((c) => c.id === account.cuit)!.cuit}. Run \`sosc-axi cuits use <cuit>\` to switch`]
      : cuits.length
        ? ["Run `sosc-axi cuits use <cuit>` to select the CUIT to work with"]
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
