import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { date, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi eventanilla [--desde <fecha>] [--hasta <fecha>] [--usuario <email>]
flags:
  --desde       AAAA-MM-DD (default 30 days ago); AFIP serves at most 90 days back from --hasta
  --hasta       AAAA-MM-DD (default today)
Lists the AFIP e-ventanilla communications of the active CUIT (\`sosc-axi cuits use\` selects it).
examples:
  sosc-axi eventanilla
  sosc-axi eventanilla --desde 2026-07-01 --hasta 2026-09-30
`;

type Comunicacion = {
  idComunicacion?: unknown;
  fechaPublicacion?: unknown;
  sistemaPublicador?: unknown;
  /** "Comunicación No Leída" or "Comunicación Leída" */
  estado?: unknown;
  tieneAdjunto?: unknown;
  mensaje?: unknown;
};

async function run(args: string[]) {
  const { values } = parse("eventanilla", args, {
    desde: { type: "string" },
    hasta: { type: "string" },
    usuario: { type: "string" },
  });
  const ago = new Date();
  ago.setDate(ago.getDate() - 30);
  const desde = date("desde", values.desde ?? ago.toLocaleDateString("sv-SE"));
  const hasta = date("hasta", values.hasta ?? new Date().toLocaleDateString("sv-SE"));

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ consulta?: { desde?: string; hasta?: string }; items?: Comunicacion[] }>(
    `/afip/eventanilla?${new URLSearchParams({ desde, hasta })}`,
    { token: jwtc, usuario },
  );
  const items = Array.isArray(res?.items) ? res.items : [];
  // The API silently moves desde up to 90 days before hasta.
  const from = res?.consulta?.desde ?? desde;
  const when = `${from} to ${res?.consulta?.hasta ?? hasta}`;
  const narrowed =
    from !== desde
      ? { help: ["AFIP serves at most 90 days back from --hasta; query an earlier --hasta for older ones"] }
      : {};

  if (!items.length) return { eventanilla: `0 comunicaciones in ${when}`, ...narrowed };
  const comunicaciones = items.map((c) => ({
    id: str(c.idComunicacion),
    fecha: str(c.fechaPublicacion).slice(0, 10),
    sistema: str(c.sistemaPublicador),
    leida: !/no le[ií]da/i.test(str(c.estado)),
    adjunto: c.tieneAdjunto === true,
    // asunto is the first 50 chars of mensaje; the whole message on one line says more.
    mensaje: str(c.mensaje).replace(/\s+/g, " "),
  }));
  const unread = comunicaciones.filter((c) => !c.leida).length;
  return {
    cuit: cuit.cuit,
    eventanilla: `${items.length} comunicaciones (${unread} sin leer) in ${when}`,
    comunicaciones,
    ...narrowed,
  };
}

export const eventanilla: Command = {
  name: "eventanilla",
  summary: "AFIP e-ventanilla communications of the active CUIT",
  help,
  module: "afip",
  run,
};
