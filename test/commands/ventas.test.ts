import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ventas } from "../../src/commands/ventas.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "../helpers.ts";

useSandbox();

const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });

test("defaults to facturas of the month, all CAE states, naming the cliente", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /venta/listado/facturas/mes/todas?pagina=1&registros=50": { items: [{ id: 1, clipro: { clipro: "CF" } }] },
  });
  const out = (await ventas.run([], undefined)) as { ventas: Record<string, unknown>[] };
  expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  expect(out.ventas[0]!.cliente).toBe("CF");
});

test("--modo and --cae go in the path", async () => {
  loggedIn();
  const calls = mockApi({
    "GET /venta/listado/notascredito/mes_anterior/sincae?pagina=1&registros=50": { items: [] },
  });
  expect(
    await ventas.run(["--modo", "notascredito", "--cae", "sincae", "--periodo", "mes_anterior"], undefined),
  ).toEqual({ ventas: "0 ventas in mes_anterior" });
  expect(calls).toHaveLength(1);
});

test("invalid --modo / --cae are validation errors", async () => {
  loggedIn();
  mockApi({});
  await expectAxiError(ventas.run(["--modo", "x"], undefined), "VALIDATION_ERROR", "--modo must be one of");
  await expectAxiError(ventas.run(["--cae", "x"], undefined), "VALIDATION_ERROR", "--cae must be one of");
});

test("requires an active CUIT", async () => {
  seed({ default: "ana@x.com", accounts: { "ana@x.com": { jwt: "u", cuits: [] } } });
  await expectAxiError(ventas.run([], undefined), "VALIDATION_ERROR", "No active CUIT");
});

test("view <id> shows one venta", async () => {
  loggedIn();
  mockApi({ "GET /venta/detalle/933742304": { cabecera: { clipro: "X" } } });
  const out = (await ventas.run(["view", "933742304"], undefined)) as Record<string, unknown>;
  expect(out.cliente).toBe("X");
});

describe("create", () => {
  const VENTA = {
    idtipo_operacion: 2,
    fecha: "2026-10-22",
    cuitclipro: "50000000016",
    fcncnd: "F",
    letra: "C",
    puntoventa: 1,
    productos: [{ id: 772500, u: 7, fc: 1, fu: 1550, fa: 21 }],
  };
  const file = (body: unknown) => {
    const path = join(mkdtempSync(join(tmpdir(), "venta-")), "venta.json");
    writeFileSync(path, JSON.stringify(body));
    return path;
  };
  const create = (args: string[]) => ventas.run(["create", ...args], undefined) as Promise<Record<string, unknown>>;

  test("PUTs the venta with a fresh uniqueid and without asking AFIP for a CAE", async () => {
    loggedIn();
    const calls = mockApi({ "PUT /venta": { id: 933742304 } });
    const out = await create(["--file", file(VENTA)]);
    const body = calls[0]!.body as Record<string, unknown>;
    expect(calls[0]!.auth).toBe("Bearer jwtc-11");
    expect(body).toMatchObject({ ...VENTA, obtienecae: false });
    expect(body.uniqueid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(out).toMatchObject({ venta: "created 933742304 without CAE", id: "933742304", uniqueid: body.uniqueid });
    expect(out.help).toContain("Run `sosc-axi ventas pdf 933742304` to download the PDF");
    await create(["--file", file(VENTA)]);
    expect((calls[1]!.body as Record<string, unknown>).uniqueid).not.toBe(body.uniqueid);
  });

  test.each([[{ ok: true }], [{ id: { n: 5 } }], [{ idventa: "abc" }], [null]])(
    "a response %j without a numeric id may or may not have created the venta",
    async (res) => {
      loggedIn();
      mockApi({ "PUT /venta": res });
      const e = await expectAxiError(
        create(["--file", file({ ...VENTA, uniqueid: "u-3" })]),
        "API_ERROR",
        "may or may not have been created",
      );
      expect(e.suggestions).toContain("Run `sosc-axi ventas --periodo hoy` to check");
      expect(e.suggestions.join()).toContain('"uniqueid": "u-3"');
    },
  );

  test("reads the id from idventa and ignores a non-scalar cae", async () => {
    loggedIn();
    mockApi({ "PUT /venta": { idventa: "77", cae: { numero: 1 } } });
    const out = await create(["--file", file(VENTA)]);
    expect(out).toMatchObject({ venta: "created 77 without CAE", id: "77" });
    expect(out.cae).toBeUndefined();
  });

  test("--cae asks AFIP for a CAE and keeps a given uniqueid", async () => {
    loggedIn();
    const calls = mockApi({ "PUT /venta": { id: 5, cae: "75123456789012" } });
    const out = await create(["--file", file({ ...VENTA, uniqueid: "u-1", obtienecae: false }), "--cae"]);
    expect(calls[0]!.body).toMatchObject({ obtienecae: true, uniqueid: "u-1" });
    expect(out).toMatchObject({ venta: "created 5 with CAE 75123456789012", cae: "75123456789012" });
  });

  test("--dry-run validates and shows the request without calling the API", async () => {
    const calls = mockApi({});
    const out = await create(["--file", file(VENTA), "--dry-run", "--cae"]);
    expect(calls).toEqual([]);
    expect(out.request).toBe("PUT /venta (dry run, nothing sent)");
    expect(out.body).toMatchObject({ ...VENTA, obtienecae: true });
  });

  test("failures hint at retrying with the same uniqueid", async () => {
    loggedIn();
    mockApi({ "PUT /venta": { error: "Error: AFIP no responde" } });
    const e = await expectAxiError(
      create(["--file", file({ ...VENTA, uniqueid: "u-2" })]),
      "API_ERROR",
      "AFIP no responde",
    );
    expect(e.suggestions.join()).toContain('"uniqueid": "u-2"');
  });

  test("--file is required and must hold a JSON object", async () => {
    mockApi({});
    await expectAxiError(create([]), "VALIDATION_ERROR", "--file is required");
    await expectAxiError(create(["--file", "/nonexistent/venta.json"]), "VALIDATION_ERROR", "cannot read");
    const bad = join(mkdtempSync(join(tmpdir(), "venta-")), "bad.json");
    writeFileSync(bad, "{nope");
    await expectAxiError(create(["--file", bad]), "VALIDATION_ERROR", "not valid JSON");
    await expectAxiError(create(["--file", file([VENTA])]), "VALIDATION_ERROR", "a JSON object");
  });

  test.each([
    [{ fcncnd: "X" }, "fcncnd must be one of F, NC, ND"],
    [{ letra: "Z" }, "letra must be one of A, B, C, E, M"],
    [{ puntoventa: 0 }, "puntoventa must be a positive integer"],
    [{ cuitclipro: "20123456789" }, "cuitclipro 20123456789 is not a valid CUIT"],
    [{ cuitclipro: undefined }, "idclipro or cuitclipro is required"],
    [{ fecha: "22/10/2026" }, "fecha must be AAAA-MM-DD"],
    [{ descuento: -1 }, "descuento must be a number >= 0"],
    [{ productos: [] }, "at least one producto or imputacion is required"],
    [{ productos: [{ fc: 0, fu: -5, fa: 22 }] }, "productos[0].fc must be a positive number"],
    [{ productos: [{ fc: 1, fu: -5 }] }, "productos[0].fu must be a positive number"],
    [{ productos: [{ fc: 1, fu: 1, fa: 22 }] }, "productos[0].fa must be one of 0, 2.5, 5, 10.5, 21, 27"],
    [{ productos: undefined, imputaciones: [{ i: "neto", v: "1550" }] }, "imputaciones[0].v must be a positive number"],
    [{ productos: { fc: -1, fu: -1 }, imputaciones: [{ v: 100 }] }, "productos must be an array"],
    [{ productos: [null] }, "productos[0] must be an object"],
    [{ imputaciones: "neto" }, "imputaciones must be an array"],
    [{ productos: undefined, imputaciones: [null] }, "imputaciones[0] must be an object"],
    [{ productos: null, imputaciones: [{ v: 100 }] }, "productos must be an array"],
    [{ imputaciones: null }, "imputaciones must be an array"],
    [{ uniqueid: { a: 1 } }, "uniqueid must be a non-empty string"],
    [{ uniqueid: " " }, "uniqueid must be a non-empty string"],
  ])("rejects %j before calling the API", async (patch, message) => {
    const calls = mockApi({});
    await expectAxiError(create(["--file", file({ ...VENTA, ...patch }), "--dry-run"]), "VALIDATION_ERROR", message);
    expect(calls).toEqual([]);
  });

  test("lists every problem at once", async () => {
    mockApi({});
    await expectAxiError(
      create(["--file", file({ ...VENTA, letra: "Z", puntoventa: -1 }), "--dry-run"]),
      "VALIDATION_ERROR",
      "letra must be one of A, B, C, E, M; puntoventa must be a positive integer",
    );
  });

  test("accepts imputaciones only and idclipro without cuitclipro", async () => {
    const { cuitclipro, productos, ...rest } = VENTA;
    const out = await create([
      "--file",
      file({ ...rest, idclipro: 1, imputaciones: [{ i: "neto", a: 0, v: 1550 }] }),
      "--dry-run",
    ]);
    expect(out.body).toMatchObject({ idclipro: 1 });
  });
});

describe("cae", () => {
  test("shows the CAE, its expiry and status", async () => {
    loggedIn();
    const calls = mockApi({
      "GET /cae/status/5": { cae: "75123456789012", caevencimiento: "2026-11-01T03:00:00.000Z", estado: "A" },
    });
    expect(await ventas.run(["cae", "5"], undefined)).toEqual({
      id: "5",
      status: "authorized by AFIP",
      cae: "75123456789012",
      vencimiento: "2026-11-01",
      estado: "A",
    });
    expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  });

  test("without CAE shows the AFIP observations", async () => {
    loggedIn();
    mockApi({ "GET /cae/status/5": [{ cae: null, observaciones: "10016: fecha fuera de rango" }] });
    expect(await ventas.run(["cae", "5"], undefined)).toEqual({
      id: "5",
      status: "not authorized by AFIP",
      afip: "10016: fecha fuera de rango",
    });
  });

  test("requires a numeric id", async () => {
    await expectAxiError(ventas.run(["cae"], undefined), "VALIDATION_ERROR", "numeric venta id is required");
    await expectAxiError(ventas.run(["cae", "x"], undefined), "VALIDATION_ERROR", "numeric venta id is required");
  });
});

describe("pdf", () => {
  const PDF = Buffer.from("%PDF-1.4\n\xff\x00binary");

  test("saves <id>.pdf in the current directory by default", async () => {
    loggedIn();
    const dir = mkdtempSync(join(tmpdir(), "pdf-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      mockApi({ "GET /venta/pdf/5": new Response(PDF) });
      const out = (await ventas.run(["pdf", "5"], undefined)) as Record<string, unknown>;
      const path = join(realpathSync(dir), "5.pdf");
      expect(out).toEqual({ pdf: `venta 5 saved to ${path}`, bytes: PDF.length });
      expect(readFileSync(path)).toEqual(PDF);
    } finally {
      process.chdir(cwd);
    }
  });

  test("--output picks the file, - writes to stdout", async () => {
    loggedIn();
    mockApi({ "GET /venta/pdf/5": () => new Response(PDF) });
    const path = join(mkdtempSync(join(tmpdir(), "pdf-")), "f.pdf");
    await ventas.run(["pdf", "5", "--output", path], undefined);
    expect(readFileSync(path)).toEqual(PDF);

    const stdout = spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await ventas.run(["pdf", "5", "--output", "-"], undefined)).toBe("");
    expect(stdout.mock.calls[0]![0]).toEqual(PDF);
  });

  test("a non-PDF response is an API_ERROR and writes nothing", async () => {
    loggedIn();
    mockApi({ "GET /venta/pdf/5": { ok: true } });
    const path = join(mkdtempSync(join(tmpdir(), "pdf-")), "f.pdf");
    await expectAxiError(ventas.run(["pdf", "5", "--output", path], undefined), "API_ERROR", "no PDF for venta 5");
    expect(existsSync(path)).toBe(false);
  });

  test("requires a numeric id", async () => {
    await expectAxiError(ventas.run(["pdf"], undefined), "VALIDATION_ERROR", "numeric venta id is required");
  });
});

describe("email", () => {
  test("sends to the cliente of the ventas, at the email on file", async () => {
    loggedIn();
    const calls = mockApi({
      "GET /venta/detalle/5": { cabecera: { idclipro: 77 } },
      "GET /venta/detalle/6": { cabecera: { idclipro: "77" } },
      "POST /email/enviar": { ok: true },
    });
    expect(await ventas.run(["email", "5", "6"], undefined)).toEqual({
      email: "sent ventas 5, 6 to the email on file of cliente 77",
    });
    expect(calls[2]).toMatchObject({ auth: "Bearer jwtc-11", body: { comprobantes: [5, 6], idcliente: 77 } });
  });

  test("--email and --cliente skip the lookup", async () => {
    loggedIn();
    const calls = mockApi({ "POST /email/enviar": { ok: true } });
    expect(await ventas.run(["email", "5", "--cliente", "77", "--email", "a@b.com"], undefined)).toEqual({
      email: "sent venta 5 to a@b.com",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ comprobantes: [5], idcliente: 77, email: "a@b.com" });
  });

  test("refuses ventas of different clientes or without one", async () => {
    loggedIn();
    mockApi({
      "GET /venta/detalle/5": { cabecera: { idclipro: 77 } },
      "GET /venta/detalle/6": { cabecera: { idclipro: 78 } },
      "GET /venta/detalle/7": { cabecera: {} },
      "GET /venta/detalle/8": { cabecera: { idclipro: { id: 77 } } },
    });
    await expectAxiError(ventas.run(["email", "5", "6"], undefined), "VALIDATION_ERROR", "different clientes");
    const e = await expectAxiError(ventas.run(["email", "7"], undefined), "VALIDATION_ERROR", "no cliente");
    expect(e.suggestions.join()).toContain("--cliente");
    await expectAxiError(ventas.run(["email", "8"], undefined), "VALIDATION_ERROR", "no cliente for venta 8");
  });

  test("validates ids, --cliente and --email", async () => {
    mockApi({});
    await expectAxiError(ventas.run(["email"], undefined), "VALIDATION_ERROR", "numeric venta id is required");
    await expectAxiError(ventas.run(["email", "5", "x"], undefined), "VALIDATION_ERROR", "numeric venta id");
    await expectAxiError(ventas.run(["email", "5", "--cliente", "x"], undefined), "VALIDATION_ERROR", "--cliente");
    await expectAxiError(ventas.run(["email", "5", "--email", "nope"], undefined), "VALIDATION_ERROR", "--email");
  });
});
