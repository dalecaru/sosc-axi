import { expect, test } from "bun:test";
import { eventanilla } from "../../src/commands/eventanilla.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

const ITEM = {
  id: 2151026,
  idComunicacion: "674707658",
  fechaPublicacion: "2026-09-18T16:25:58.000Z",
  sistemaPublicador: "Mis Facilidades",
  estado: "Comunicación No Leída",
  asunto: "Sr. Contribuyente VIVASA\n\nCUIT 30-71683194-5\n\nPor",
  tieneAdjunto: false,
  mensaje: "Sr. Contribuyente VIVASA\n\nCUIT 30-71683194-5\n\nPor el presente  medio le comunicamos.",
};

test("lists the communications with read state and the full message on one line", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /afip/eventanilla?desde=2026-09-01&hasta=2026-10-22": {
      consulta: { desde: "2026-09-01", hasta: "2026-10-22", registros: 2 },
      items: [ITEM, { ...ITEM, idComunicacion: "1", estado: "Comunicación Leída", tieneAdjunto: true }],
    },
  });
  expect(await eventanilla.run(["--desde", "2026-09-01", "--hasta", "2026-10-22"], undefined)).toEqual({
    cuit: "20123456789",
    eventanilla: "2 comunicaciones (1 sin leer) in 2026-09-01 to 2026-10-22",
    comunicaciones: [
      {
        id: "674707658",
        fecha: "2026-09-18",
        sistema: "Mis Facilidades",
        leida: false,
        adjunto: false,
        mensaje: "Sr. Contribuyente VIVASA CUIT 30-71683194-5 Por el presente medio le comunicamos.",
      },
      {
        id: "1",
        fecha: "2026-09-18",
        sistema: "Mis Facilidades",
        leida: true,
        adjunto: true,
        mensaje: "Sr. Contribuyente VIVASA CUIT 30-71683194-5 Por el presente medio le comunicamos.",
      },
    ],
  });
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
});

test("defaults to the last 30 days; says when the API narrowed the range", async () => {
  loggedIn();
  const hasta = new Date().toLocaleDateString("sv-SE");
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const desde = d.toLocaleDateString("sv-SE");
  const calls = mockApi({
    [`GET /afip/eventanilla?desde=${desde}&hasta=${hasta}`]: { consulta: { desde, hasta }, items: [] },
    "GET /afip/eventanilla?desde=2026-01-01&hasta=2026-10-22": {
      consulta: { desde: "2026-07-24", hasta: "2026-10-22" },
      items: [],
    },
  });
  expect(await eventanilla.run([], undefined)).toEqual({ eventanilla: `0 comunicaciones in ${desde} to ${hasta}` });
  expect(calls).toHaveLength(1);
  expect(await eventanilla.run(["--desde", "2026-01-01", "--hasta", "2026-10-22"], undefined)).toEqual({
    eventanilla: "0 comunicaciones in 2026-07-24 to 2026-10-22",
    help: ["AFIP serves only the last 90 days, from 2026-07-24; older comunicaciones are not reachable"],
  });
});

test("the 90 days count back from today, not --hasta; a window older than that says so", async () => {
  loggedIn();
  mockApi({
    "GET /afip/eventanilla?desde=2026-07-01&hasta=2026-08-15": {
      consulta: { desde: "2026-07-25", hasta: "2026-08-15" },
      items: [ITEM],
    },
    "GET /afip/eventanilla?desde=2026-05-01&hasta=2026-07-24": {
      consulta: { desde: "2026-07-25", hasta: "2026-07-24" },
      items: [],
    },
  });
  expect(await eventanilla.run(["--desde", "2026-07-01", "--hasta", "2026-08-15"], undefined)).toMatchObject({
    eventanilla: "1 comunicaciones (1 sin leer) in 2026-07-25 to 2026-08-15",
    help: ["AFIP serves only the last 90 days, from 2026-07-25; older comunicaciones are not reachable"],
  });
  expect(await eventanilla.run(["--desde", "2026-05-01", "--hasta", "2026-07-24"], undefined)).toEqual({
    eventanilla: "0 comunicaciones: 2026-05-01 to 2026-07-24 is older than the 90 days AFIP serves (from 2026-07-25)",
  });
});

test("--hasta alone defaults --desde to 30 days before it, never an inverted range", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /afip/eventanilla?desde=2026-01-01&hasta=2026-01-31": {
      consulta: { desde: "2026-01-01", hasta: "2026-01-31" },
      items: [],
    },
    "GET /afip/eventanilla?desde=2026-02-01&hasta=2026-03-03": {
      consulta: { desde: "2026-02-01", hasta: "2026-03-03" },
      items: [],
    },
  });
  expect(await eventanilla.run(["--hasta", "2026-01-31"], undefined)).toEqual({
    eventanilla: "0 comunicaciones in 2026-01-01 to 2026-01-31",
  });
  expect(await eventanilla.run(["--hasta", "2026-03-03"], undefined)).toEqual({
    eventanilla: "0 comunicaciones in 2026-02-01 to 2026-03-03",
  });
  expect(calls).toHaveLength(2);
});

test.each([
  [["--desde", "01/09/2026"], "--desde must be AAAA-MM-DD"],
  [["--hasta", "2026-13-01"], "--hasta must be AAAA-MM-DD"],
  [["--hasta", "2026-02-30"], "--hasta must be AAAA-MM-DD"],
  [["--desde", "2026-02-30", "--hasta", "2026-03-31"], "--desde must be AAAA-MM-DD"],
  [["--hasta", "2026"], "--hasta must be AAAA-MM-DD"],
  [["--periodo", "mes"], "unknown flag --periodo"],
])("rejects %p before calling the API", async (args, message) => {
  loggedIn();
  const calls = mockApi({});
  await expectAxiError(eventanilla.run(args, undefined), "VALIDATION_ERROR", message);
  expect(calls).toEqual([]);
});
