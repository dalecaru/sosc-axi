import { parse } from "../args.ts";
import { LOGIN_HINT } from "../auth.ts";
import { loadStore, saveStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi logout [--usuario <email>]
Removes the stored session of the default account (or --usuario). No-op if not logged in.
examples:
  sosc-axi logout
  sosc-axi logout --usuario ana@estudio.com
`;

async function run(args: string[]) {
  const { values } = parse("logout", args, { usuario: { type: "string" } });
  const store = loadStore();
  const usuario = values.usuario ?? store.default;
  if (!usuario || !store.accounts[usuario]) {
    return { logout: usuario ? `${usuario} was not logged in (no-op)` : "no account logged in (no-op)" };
  }
  delete store.accounts[usuario];
  if (store.default === usuario) store.default = Object.keys(store.accounts)[0];
  saveStore(store);
  return {
    logout: `${usuario} logged out`,
    default: store.default ?? "none",
    ...(store.default ? {} : { help: [LOGIN_HINT] }),
  };
}

export const logout: Command = { name: "logout", summary: "Remove a logged-in account", help, run };
