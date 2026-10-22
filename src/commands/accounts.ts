import { AxiError } from "axi-sdk-js";
import { parse } from "../args.ts";
import { LOGIN_HINT, resolveAccount } from "../auth.ts";
import { loadStore, saveStore, tokenStatus } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi accounts | sosc-axi accounts use <usuario>
Lists logged-in accounts with session status, or switches the default account.
examples:
  sosc-axi accounts
  sosc-axi accounts use ana@estudio.com
`;

async function run(args: string[]) {
  if (args[0] === "use") return use(args.slice(1));

  parse("accounts", args, {});
  const store = loadStore();
  const rows = Object.entries(store.accounts).map(([usuario, a]) => ({
    usuario,
    default: usuario === store.default ? "*" : "",
    cuit: a.cuits.find((c) => c.id === a.cuit)?.cuit ?? "",
    session: tokenStatus(a.jwt),
  }));
  if (!rows.length) return { accounts: "0 accounts logged in", help: [LOGIN_HINT] };
  return {
    count: `${rows.length} accounts logged in`,
    accounts: rows,
    help: [
      "Run `sosc-axi accounts use <usuario>` to switch the default account",
      "Run `sosc-axi login --usuario <email> --password-stdin` to add another account",
    ],
  };
}

async function use(args: string[]) {
  const { positionals } = parse("accounts use", args, {}, 1);
  const usuario = positionals[0];
  if (!usuario) throw new AxiError("usuario is required", "VALIDATION_ERROR", ["sosc-axi accounts use <usuario>"]);
  const store = loadStore();
  resolveAccount(store, usuario);
  if (store.default === usuario) return { accounts: `${usuario} is already the default account (no-op)` };
  store.default = usuario;
  saveStore(store);
  return { accounts: `default account is now ${usuario}` };
}

export const accounts: Command = {
  name: "accounts",
  summary: "List logged-in accounts; `accounts use <usuario>` switches the default",
  help,
  run,
};
