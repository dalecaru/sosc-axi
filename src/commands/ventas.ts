import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { api } from "../api.ts";
import { parse } from "../args.ts";
import { activeCuit } from "../auth.ts";
import { detalle, listado, oneOf, str } from "../comprobantes.ts";
import { loadStore } from "../store.ts";
import type { Command } from "./index.ts";

const MODOS = ["facturas", "borradores", "notascredito"];
const CAES = ["todas", "concae", "sincae"];

const help = `usage: sosc-axi ventas [--modo <modo>] [--cae <filtro>] [--periodo <periodo> | --desde <fecha> --hasta <fecha>]
                     [--pagina <n>] [--registros <n>] [--usuario <email>]
       sosc-axi ventas view <id> [--usuario <email>]
       sosc-axi ventas create --file <venta.json | -> [--cae] [--dry-run] [--usuario <email>]
       sosc-axi ventas cae <id> [--usuario <email>]
       sosc-axi ventas pdf <id> [--output <file | ->] [--usuario <email>]
       sosc-axi ventas email <id>... [--email <address>] [--cliente <idcliente>] [--usuario <email>]
flags:
  --modo        facturas (default), borradores, notascredito
  --cae         listing: todas (default), concae, sincae; create: ask AFIP for the CAE
  --periodo     hoy, ayer, semana, mes (default), mes_anterior
  --desde/--hasta AAAA-MM-DD date range, instead of --periodo
  --pagina      page number (default 1)
  --registros   rows per page (default 50)
  --file        JSON body of the venta (PUT /venta in the API docs), - reads stdin
  --dry-run     validate and print the request without sending it
  --output      PDF file (default <id>.pdf), - writes to stdout
  --email       recipient (default the email on file of the cliente)
  --cliente     cliente id, instead of looking it up from the ventas
Lists the sales of the active CUIT (\`sosc-axi cuits use\` selects it).
\`create\` issues a real fiscal document: try --dry-run first. Without --cae the venta is saved
without a CAE; \`uniqueid\` (generated unless the JSON has one) keeps a retry from creating it twice.
JSON: idtipo_operacion, fecha, idclipro or cuitclipro, fcncnd (F, NC, ND), letra, puntoventa,
numero, memo, referencia, descuento, uniqueid, imputaciones[] (i, a, v),
productos[] (id, u unit, fc quantity, fu unit price, fa IVA rate)
examples:
  sosc-axi ventas
  sosc-axi ventas --periodo mes_anterior --cae sincae
  sosc-axi ventas --modo notascredito --desde 2026-01-01 --hasta 2026-03-31
  sosc-axi ventas view 933742304
  sosc-axi ventas create --file venta.json --dry-run
  sosc-axi ventas create --file venta.json --cae
  sosc-axi ventas cae 933742304
  sosc-axi ventas pdf 933742304 --output factura.pdf
  sosc-axi ventas email 933742304 --email ana@example.com
`;

const FCNCND = ["F", "NC", "ND"];
const LETRAS = ["A", "B", "C", "E", "M"];
const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];

/** AFIP CUIT: 11 digits, the last a mod 11 check digit. */
function validCuit(v: unknown) {
  const d = String(v);
  if (!/^\d{11}$/.test(d)) return false;
  const sum = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + w * Number(d[i]), 0);
  const check = 11 - (sum % 11);
  return (check === 11 ? 0 : check) === Number(d[10]);
}

const isPositive = (v: unknown) => typeof v === "number" && v > 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const scalar = (v: unknown) => (typeof v === "string" || typeof v === "number" ? str(v) : "");

function problems(v: Record<string, unknown>) {
  const out: string[] = [];
  if (!FCNCND.includes(v.fcncnd as string)) out.push(`fcncnd must be one of ${FCNCND.join(", ")}`);
  if (!LETRAS.includes(v.letra as string)) out.push(`letra must be one of ${LETRAS.join(", ")}`);
  if (!Number.isInteger(v.puntoventa) || !isPositive(v.puntoventa)) out.push("puntoventa must be a positive integer");
  if (v.cuitclipro != null && !validCuit(v.cuitclipro)) out.push(`cuitclipro ${v.cuitclipro} is not a valid CUIT`);
  if (v.cuitclipro == null && v.idclipro == null) out.push("idclipro or cuitclipro is required");
  if (v.fecha != null && new Date(String(v.fecha)).toJSON()?.slice(0, 10) !== v.fecha) {
    out.push("fecha must be AAAA-MM-DD");
  }
  if (v.uniqueid !== undefined && !(typeof v.uniqueid === "string" && v.uniqueid.trim())) {
    out.push("uniqueid must be a non-empty string");
  }
  if (v.descuento != null && !(typeof v.descuento === "number" && v.descuento >= 0)) {
    out.push("descuento must be a number >= 0");
  }
  const list = (key: string) => {
    const l = v[key] === undefined ? [] : v[key];
    if (!Array.isArray(l)) out.push(`${key} must be an array`);
    return Array.isArray(l) ? (l as unknown[]) : [];
  };
  const productos = list("productos");
  const imputaciones = list("imputaciones");
  if (!productos.length && !imputaciones.length) out.push("at least one producto or imputacion is required");
  productos.forEach((p, i) => {
    if (!isObject(p)) {
      out.push(`productos[${i}] must be an object`);
      return;
    }
    if (!isPositive(p.fc)) out.push(`productos[${i}].fc must be a positive number`);
    if (!isPositive(p.fu)) out.push(`productos[${i}].fu must be a positive number`);
    if (p.fa != null && !ALICUOTAS.includes(p.fa as number)) {
      out.push(`productos[${i}].fa must be one of ${ALICUOTAS.join(", ")}`);
    }
  });
  imputaciones.forEach((m, i) => {
    if (!isObject(m)) {
      out.push(`imputaciones[${i}] must be an object`);
      return;
    }
    if (!isPositive(m.v)) out.push(`imputaciones[${i}].v must be a positive number`);
  });
  return out;
}

function readVenta(file: string | undefined): Record<string, unknown> {
  if (file === undefined) {
    throw new AxiError("--file is required", "VALIDATION_ERROR", [
      "sosc-axi ventas create --file venta.json --dry-run",
    ]);
  }
  let text: string;
  try {
    text = readFileSync(file === "-" ? 0 : file, "utf8");
  } catch (error) {
    throw new AxiError(`cannot read ${file} (${(error as Error).message})`, "VALIDATION_ERROR");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AxiError(`${file} is not valid JSON`, "VALIDATION_ERROR");
  }
  if (!isObject(body)) {
    throw new AxiError(`${file} must hold a JSON object (one venta)`, "VALIDATION_ERROR");
  }
  return body;
}

async function create(args: string[]) {
  const { values } = parse("ventas create", args, {
    file: { type: "string" },
    cae: { type: "boolean" },
    "dry-run": { type: "boolean" },
    usuario: { type: "string" },
  });
  const venta = readVenta(values.file);
  const errors = problems(venta);
  if (errors.length) throw new AxiError(`invalid venta: ${errors.join("; ")}`, "VALIDATION_ERROR");
  const body = { ...venta, obtienecae: Boolean(values.cae), uniqueid: str(venta.uniqueid) || randomUUID() };
  if (values["dry-run"]) return { request: "PUT /venta (dry run, nothing sent)", body };

  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  const retry = `Retry with "uniqueid": "${body.uniqueid}" in the JSON so the venta is not created twice`;
  let res: Record<string, unknown>;
  try {
    // PUT /venta/{id} without an id creates (no response schema published: id and cae are read by name).
    res = (await api<Record<string, unknown>>("/venta", { method: "PUT", token: jwtc, body, usuario })) ?? {};
  } catch (error) {
    const e = error as AxiError;
    throw new AxiError(e.message, e.code, [...(e.suggestions ?? []), retry]);
  }
  const id = scalar(res.id ?? res.idventa ?? res.idcomprobante);
  if (!/^\d+$/.test(id)) {
    throw new AxiError(
      "PUT /venta answered without a venta id: the venta may or may not have been created",
      "API_ERROR",
      ["Run `sosc-axi ventas --periodo hoy` to check", retry],
    );
  }
  const cae = scalar(res.cae);
  return {
    venta: `created ${id}${cae ? ` with CAE ${cae}` : " without CAE"}`,
    id,
    uniqueid: body.uniqueid,
    ...(cae ? { cae } : {}),
    help: [
      `Run \`sosc-axi ventas cae ${id}\` to check the CAE`,
      `Run \`sosc-axi ventas pdf ${id}\` to download the PDF`,
      `Run \`sosc-axi ventas email ${id}\` to email it to the cliente`,
    ],
  };
}

function ventaId(id: string | undefined, sub: string) {
  if (!id || !/^\d+$/.test(id)) {
    throw new AxiError("numeric venta id is required", "VALIDATION_ERROR", [
      `sosc-axi ventas ${sub} <id>`,
      "Run `sosc-axi ventas` to list ids",
    ]);
  }
  return id;
}

/** First non-empty value whose key matches, as text: the API publishes no response schema for /cae/status. */
function field(o: Record<string, unknown>, re: RegExp) {
  const v = Object.entries(o).find(([k, v]) => re.test(k) && str(v))?.[1];
  return typeof v === "object" ? JSON.stringify(v) : str(v);
}

async function cae(args: string[]) {
  const { values, positionals } = parse("ventas cae", args, { usuario: { type: "string" } }, 1);
  const id = ventaId(positionals[0], "cae");
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<unknown>(`/cae/status/${id}`, { token: jwtc, usuario });
  const o = ((Array.isArray(res) ? res[0] : res) ?? {}) as Record<string, unknown>;
  const cae = scalar(o.cae);
  const vencimiento = field(o, /venc|vto/i).slice(0, 10);
  const estado = field(o, /^(estado|status)$/i);
  const afip = field(o, /observ|motivo|rechazo|mensaje|errores/i);
  return {
    id,
    status: cae ? "authorized by AFIP" : "not authorized by AFIP",
    ...(cae ? { cae } : {}),
    ...(vencimiento ? { vencimiento } : {}),
    ...(estado ? { estado } : {}),
    ...(afip ? { afip } : {}),
  };
}

async function pdf(args: string[]) {
  const { values, positionals } = parse(
    "ventas pdf",
    args,
    { output: { type: "string" }, usuario: { type: "string" } },
    1,
  );
  const id = ventaId(positionals[0], "pdf");
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);
  const res = await api<unknown>(`/venta/pdf/${id}`, { token: jwtc, usuario, binary: true });
  if (!Buffer.isBuffer(res) || res.subarray(0, 5).toString() !== "%PDF-") {
    throw new AxiError(`SOS Contador returned no PDF for venta ${id}`, "API_ERROR", [
      "Run with SOSC_DEBUG=1 to see the response",
    ]);
  }
  if (values.output === "-") {
    process.stdout.write(res);
    return "";
  }
  const file = resolve(values.output ?? `${id}.pdf`);
  writeFileSync(file, res);
  return { pdf: `venta ${id} saved to ${file}`, bytes: res.length };
}

async function email(args: string[]) {
  const { values, positionals } = parse(
    "ventas email",
    args,
    { email: { type: "string" }, cliente: { type: "string" }, usuario: { type: "string" } },
    Number.POSITIVE_INFINITY,
  );
  const ids = positionals.length ? positionals.map((id) => ventaId(id, "email")) : [ventaId(undefined, "email")];
  if (values.cliente !== undefined && !/^\d+$/.test(values.cliente)) {
    throw new AxiError("--cliente must be a numeric cliente id", "VALIDATION_ERROR");
  }
  if (values.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    throw new AxiError("--email must be an email address", "VALIDATION_ERROR");
  }
  const [usuario, , jwtc] = await activeCuit(loadStore(), values.usuario);

  let cliente = values.cliente;
  if (cliente === undefined) {
    const found = new Set<string>();
    for (const id of ids) {
      const res = await api<{ cabecera?: { idclipro?: unknown } }>(`/venta/detalle/${id}`, { token: jwtc, usuario });
      const idclipro = scalar(res?.cabecera?.idclipro);
      if (!/^\d+$/.test(idclipro)) {
        throw new AxiError(`SOS Contador returned no cliente for venta ${id}`, "VALIDATION_ERROR", [
          "Pass the cliente id with `--cliente <idcliente>` (`sosc-axi clientes` lists them)",
        ]);
      }
      found.add(idclipro);
    }
    if (found.size > 1) {
      throw new AxiError("the ventas belong to different clientes, email them separately", "VALIDATION_ERROR");
    }
    cliente = [...found][0];
  }

  await api("/email/enviar", {
    method: "POST",
    token: jwtc,
    usuario,
    body: {
      comprobantes: ids.map(Number),
      idcliente: Number(cliente),
      ...(values.email ? { email: values.email } : {}),
    },
  });
  const what = `${ids.length > 1 ? "ventas" : "venta"} ${ids.join(", ")}`;
  return { email: `sent ${what} to ${values.email ?? `the email on file of cliente ${cliente}`}` };
}

const SUBCOMMANDS: Record<string, (args: string[]) => ReturnType<Command["run"]>> = { create, cae, pdf, email };

export const ventas: Command = {
  name: "ventas",
  summary: "List and view sales of the active CUIT; create, cae, pdf and email issue them",
  help,
  module: "venta",
  run: (args) => {
    const sub = SUBCOMMANDS[args[0] ?? ""];
    if (sub) return sub(args.slice(1));
    return args[0] === "view"
      ? detalle({ command: "ventas", party: "cliente", base: "/venta", args: args.slice(1) })
      : listado({
          command: "ventas",
          party: "cliente",
          args,
          flags: { modo: { type: "string" }, cae: { type: "string" } },
          path: (periodo, v) =>
            `/venta/listado/${oneOf("modo", v.modo, MODOS) ?? "facturas"}/${periodo}/${oneOf("cae", v.cae, CAES) ?? "todas"}`,
        });
  },
};
