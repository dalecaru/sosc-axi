import { describe, expect, test } from "bun:test";
import { listado } from "../src/listado.ts";
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

  test("date range uses entre_fechas; a full page hints the next one", async () => {
    loggedIn();
    const calls = mockApi({
      "GET /x/entre_fechas?pagina=2&registros=1&fecha_desde=2026-01-01&fecha_hasta=2026-01-31": { items: [{}] },
    });
    const out = await run(["--desde", "2026-01-01", "--hasta", "2026-01-31", "--pagina", "2", "--registros", "1"]);
    expect(calls).toHaveLength(1);
    expect(out.count).toBe("1 compras in 2026-01-01 to 2026-01-31, page 2");
    expect(out.compras).toEqual([{ id: "", fecha: "", factura: "", proveedor: "", cuit: "", total: 0, cae: "" }]);
    expect(out.help).toEqual(["Run with `--pagina 3` for more"]);
  });

  test("empty states", async () => {
    loggedIn();
    mockApi({ "GET /x/hoy?pagina=1&registros=50": { items: [] }, "GET /x/hoy?pagina=3&registros=50": {} });
    expect(await run(["--periodo", "hoy"])).toEqual({ compras: "0 compras in hoy" });
    expect(await run(["--periodo", "hoy", "--pagina", "3"])).toEqual({ compras: "0 compras on page 3 (hoy)" });
  });

  test.each([
    [["--periodo", "anio"], "--periodo must be one of hoy, ayer, semana, mes, mes_anterior"],
    [["--periodo", "mes", "--desde", "2026-01-01"], "not both"],
    [["--desde", "2026-01-01"], "--desde and --hasta go together"],
    [["--desde", "01/01/2026", "--hasta", "2026-01-31"], "--desde must be AAAA-MM-DD"],
    [["--pagina", "0"], "--pagina must be a positive integer"],
    [["--registros", "x"], "--registros must be a positive integer"],
  ])("rejects %p before calling the API", async (args, message) => {
    loggedIn();
    const calls = mockApi({});
    await expectAxiError(run(args), "VALIDATION_ERROR", message);
    expect(calls).toEqual([]);
  });
});
