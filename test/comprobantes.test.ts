import { describe, expect, test } from "bun:test";
import { detalle, listado, periodoFiscal } from "../src/comprobantes.ts";
import { expectAxiError, mockApi, seed, useSandbox } from "./helpers.ts";

useSandbox();

const ITEM = {
  id: 7,
  fecha: "2026-09-17T03:00:00.000Z",
  factura: "FA-0001-00000001",
  montototal: 1500.5,
  cae: "861",
  clipro: { cuit: "30712345671", clipro: " Estudio SRL " },
};
const loggedIn = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "u", cuit: "11", cuits: [{ id: "11", cuit: "20123456789", jwtc: "jwtc-11" }] } },
  });
const run = (args: string[]) =>
  listado({ command: "compras", party: "proveedor", args, path: (p) => `/x/${p}` }) as Promise<Record<string, unknown>>;

describe("listado", () => {
  test("defaults to mes, page 1 of 50, with the per-CUIT token, mapping rows", async () => {
    loggedIn();
    const calls = mockApi({ "GET /x/mes?pagina=1&registros=50": { items: [ITEM] } });
    expect(await run([])).toEqual({
      cuit: "20123456789",
      count: "1 compras in mes, page 1",
      compras: [
        {
          id: "7",
          fecha: "2026-09-17",
          factura: "FA-0001-00000001",
          proveedor: "Estudio SRL",
          cuit: "30712345671",
          total: 1500.5,
          cae: "861",
        },
      ],
    });
    expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  });

  test("date range uses entre_fechas; pagina is sent as a row offset; a full page hints the next one", async () => {
    loggedIn();
    const calls = mockApi({
      "GET /x/entre_fechas?pagina=4&registros=3&fecha_desde=2026-01-01&fecha_hasta=2026-01-31": { items: [{}, {}, {}] },
    });
    const out = await run(["--desde", "2026-01-01", "--hasta", "2026-01-31", "--pagina", "2", "--registros", "3"]);
    expect(calls).toHaveLength(1);
    expect(out.count).toBe("3 compras in 2026-01-01 to 2026-01-31, page 2");
    expect((out.compras as unknown[])[0]).toEqual({
      id: "",
      fecha: "",
      factura: "",
      proveedor: "",
      cuit: "",
      total: 0,
      cae: "",
    });
    expect(out.help).toEqual(["Run with `--pagina 3` for more"]);
  });

  test("empty states", async () => {
    loggedIn();
    mockApi({ "GET /x/hoy?pagina=1&registros=50": { items: [] }, "GET /x/hoy?pagina=101&registros=50": {} });
    expect(await run(["--periodo", "hoy"])).toEqual({ compras: "0 compras in hoy" });
    expect(await run(["--periodo", "hoy", "--pagina", "3"])).toEqual({ compras: "0 compras on page 3 (hoy)" });
  });

  test.each([
    [["--periodo", "anio"], "--periodo must be one of hoy, ayer, semana, mes, mes_anterior"],
    [["--periodo", "mes", "--desde", "2026-01-01"], "not both"],
    [["--desde", "2026-01-01"], "--desde and --hasta go together"],
    [["--desde", "01/01/2026", "--hasta", "2026-01-31"], "--desde must be AAAA-MM-DD"],
    [["--desde", "2026-02-01", "--hasta", "2026-02-30"], "--hasta must be AAAA-MM-DD"],
    [["--pagina", "0"], "--pagina must be a positive integer"],
    [["--registros", "x"], "--registros must be a positive integer"],
  ])("rejects %p before calling the API", async (args, message) => {
    loggedIn();
    const calls = mockApi({});
    await expectAxiError(run(args), "VALIDATION_ERROR", message);
    expect(calls).toEqual([]);
  });
});

describe("detalle", () => {
  const view = (args: string[]) =>
    detalle({ command: "compras", party: "proveedor", base: "/compra", args }) as Promise<Record<string, unknown>>;
  const DETALLE = {
    cabecera: {
      id: 9,
      fecha: "2026-09-17T03:00:00.000Z",
      clipro: "TELECOM ",
      cuit: "30639453738",
      fcncnd: "F",
      letra: "A",
      puntoventa: 471,
      numero: 2162725,
      cae: "863",
      cuenta: "Comunicaciones",
      centrocosto: "General",
      memo: null,
    },
    imputaciones: [
      {
        cuenta: "Otros",
        identificador: "percepcionotra",
        alicuota: 0,
        montodebe: 34806.27,
        montohaber: -34806.27,
        iva_debe: 0,
        iva_haber: 0,
      },
    ],
    productos: [],
  };

  test("maps the header and keeps both sides of each imputacion; empty memo and productos are omitted", async () => {
    loggedIn();
    const calls = mockApi({ "GET /compra/detalle/9": DETALLE });
    expect(await view(["9"])).toEqual({
      id: "9",
      fecha: "2026-09-17",
      factura: "FA-0471-02162725",
      proveedor: "TELECOM",
      cuit: "30639453738",
      cae: "863",
      cuenta: "Comunicaciones",
      centrocosto: "General",
      imputaciones: [
        {
          cuenta: "Otros",
          concepto: "percepcionotra",
          alicuota: 0,
          debe: 34806.27,
          haber: -34806.27,
          iva_debe: 0,
          iva_haber: 0,
        },
      ],
    });
    expect(calls[0]!.auth).toBe("Bearer jwtc-11");
  });

  test("includes memo and productos when present; tolerates a bare response", async () => {
    loggedIn();
    mockApi({
      "GET /compra/detalle/9": {
        cabecera: { memo: "nota" },
        productos: [{ codigo: "0001", producto: "X", cantidad: 2, unitario: "5.5", alicuota: 21 }],
      },
      "GET /compra/detalle/8": {},
    });
    const out = await view(["9"]);
    expect(out.memo).toBe("nota");
    expect(out.productos).toEqual([{ codigo: "0001", producto: "X", cantidad: 2, unitario: 5.5, alicuota: 21 }]);
    expect((await view(["8"])).id).toBe("8");
  });

  test("unknown id is NOT_FOUND; other API errors pass through", async () => {
    loggedIn();
    mockApi({
      "GET /compra/detalle/1": { error: "Error: Imposible cargar detalles de la venta" },
      "GET /compra/detalle/2": { error: "Error: otra cosa" },
    });
    const e = await expectAxiError(view(["1"]), "NOT_FOUND", "compras 1 not found");
    expect(e.suggestions).toEqual(["Run `sosc-axi compras` to list ids"]);
    await expectAxiError(view(["2"]), "API_ERROR", "otra cosa");
  });

  test.each([[[]], [["abc"]]])("requires a numeric id (%p)", async (args) => {
    await expectAxiError(view(args), "VALIDATION_ERROR", "numeric compras id is required");
  });
});

describe("periodoFiscal", () => {
  test("defaults to the whole current year (mes 00)", () => {
    const year = String(new Date().getFullYear());
    expect(periodoFiscal({})).toEqual({ ejercicio: year, query: `anio=${year}&mes=00`, when: year });
  });

  test("--mes narrows to one month of the ejercicio; --anio picks its calendar year", () => {
    expect(periodoFiscal({ ejercicio: "2025", mes: "09" })).toEqual({
      ejercicio: "2025",
      query: "anio=2025&mes=09",
      when: "2025-09",
    });
    expect(periodoFiscal({ ejercicio: "2025", anio: "2026", mes: "01" }).query).toBe("anio=2026&mes=01");
  });

  test.each([
    [{ ejercicio: "26" }, "--ejercicio must be AAAA"],
    [{ anio: "abcd" }, "--anio must be AAAA"],
    [{ ejercicio: "2025", anio: "2026" }, "--anio requires --mes"],
    [{ mes: "9" }, "--mes must be MM (01-12)"],
    [{ mes: "13" }, "--mes must be MM (01-12)"],
    [{ mes: "00" }, "--mes must be MM (01-12)"],
  ])("rejects %p", async (values, message) => {
    await expectAxiError(
      Promise.resolve().then(() => periodoFiscal(values)),
      "VALIDATION_ERROR",
      message,
    );
  });
});
