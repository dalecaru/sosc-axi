import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { date, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const help = `usage: sosc-axi eventanilla [--desde <fecha>] [--hasta <fecha>] [--usuario <email>]
flags:
  --desde       AAAA-MM-DD (default 30 days before --hasta); AFIP serves only the last 90 days, counted from today
  --hasta       AAAA-MM-DD (default today)
Lists the AFIP e-ventanilla communications of the active CUIT (\`sosc-axi cuits use\` selects it).
leida is the read state today, not as of --hasta.
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
  const hasta = date("hasta", values.hasta ?? new Date().toLocaleDateString("sv-SE"));
  const ago = new Date(`${hasta}T00:00:00Z`);
  ago.setUTCDate(ago.getUTCDate() - 30);
  const desde = date("desde", values.desde ?? ago.toISOString().slice(0, 10));

  const [usuario, cuit, jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<{ consulta?: { desde?: string; hasta?: string }; items?: Comunicacion[] }>(
    `/afip/eventanilla?${new URLSearchParams({ desde, hasta })}`,
    { token: jwtc, usuario },
  );
  const items = Array.isArray(res?.items) ? res.items : [];
  // The API silently moves desde up to 90 days before today, whatever hasta is.
  const from = res?.consulta?.desde ?? desde;
  if (from > hasta) {
    return {
      eventanilla: `0 comunicaciones: ${desde} to ${hasta} is older than the 90 days AFIP serves (from ${from})`,
    };
  }
  const when = `${from} to ${res?.consulta?.hasta ?? hasta}`;
  const narrowed =
    from !== desde
      ? { help: [`AFIP serves only the last 90 days, from ${from}; older comunicaciones are not reachable`] }
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
