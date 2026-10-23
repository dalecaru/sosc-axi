import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi modificadores [--usuario <email>]
Lists the grupos de modificadores, with their modifier productos and prices when the API returns them.
examples:
  sosc-axi modificadores
`;

type Producto = { id?: unknown; producto?: unknown; nombre?: unknown; descripcion?: unknown; precio?: unknown };
type Grupo = {
  id?: unknown;
  grupomodificador?: unknown;
  nombre?: unknown;
  descripcion?: unknown;
  productos?: (Producto | number | string)[];
};

async function run(args: string[]) {
  const { values } = parse("modificadores", args, { usuario: { type: "string" } });
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  // The spec publishes no response shape: accept a bare array or {items}, and productos as objects or bare ids
  // (the POST body sends bare ids).
  const res = await api<Grupo[] | { items?: Grupo[] }>("/grupomodificador/listado", { token: jwtc, usuario });
  const items = (Array.isArray(res) ? res : res?.items) ?? [];

  if (!items.length) return { grupos: "0 grupos" };
  return {
    count: `${items.length} grupos`,
    grupos: items.map((g) => ({
      id: str(g.id),
      grupo: str(g.grupomodificador ?? g.nombre ?? g.descripcion),
      ...(g.productos?.length && {
        modificadores: g.productos.map((p) =>
          typeof p === "object" && p
            ? { id: str(p.id), nombre: str(p.producto ?? p.nombre ?? p.descripcion), precio: str(p.precio) }
            : { id: str(p), nombre: "", precio: "" },
        ),
      }),
    })),
  };
}

export const modificadores: Command = {
  name: "modificadores",
  summary: "List grupos de modificadores",
  help,
  module: "grupomodificador",
  run,
};
