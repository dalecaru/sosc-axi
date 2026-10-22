import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit, resolveAccount } from "../auth.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi status [--usuario <email>]
Checks that the account session and the active CUIT credentials still work
against SOS Contador (read-only calls). Fails with AUTH_REQUIRED when not logged in.
examples:
  sosc-axi status
  sosc-axi status --usuario ana@estudio.com
`;

async function run(args: string[]) {
  const { values } = parse("status", args, { usuario: { type: "string" } });
  const store = loadStore();
  const [usuario, account] = resolveAccount(store, values.usuario);
  await api("/cuit/listado", { token: account.jwt, usuario });
  if (!account.cuit) {
    return {
      usuario,
      session: "connected",
      cuit: "none selected",
      help: ["Run `sosc-axi cuits use <cuit>` to select the CUIT to work with"],
    };
  }
  const [, cuit, jwtc] = await activeCuit(store, usuario);
  await api("/cuit/parametros", { token: jwtc, usuario });
  return {
    usuario,
    session: "connected",
    cuit: `${cuit.cuit}${cuit.nombre ? ` (${cuit.nombre})` : ""} connected`,
  };
}

export const status: Command = {
  name: "status",
  summary: "Check the session and active CUIT credentials against SOS Contador",
  help,
  module: "cuit",
  run,
};
