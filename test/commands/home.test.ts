import { expect, test } from "bun:test";
import { home } from "../../src/commands/home.ts";
import { seed, useSandbox } from "../helpers.ts";

useSandbox();

test("no account: definitive empty state pointing at login", () => {
  expect(home()).toEqual({ accounts: "0 accounts logged in", help: [expect.stringContaining("sosc-axi login")] });
});

test("default account with an active CUIT", () => {
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "x", cuits: [{ id: "11", cuit: "20123456789", nombre: "Ana" }], cuit: "11" } },
  });
  expect(home()).toEqual({
    usuario: "ana@x.com",
    session: "unknown expiry",
    cuit: "20123456789 (Ana)",
    accounts: "1 logged in",
    help: [
      "Run `sosc-axi ventas` or `sosc-axi compras` to list invoices",
      "Run `sosc-axi cuits` to list or switch CUITs",
    ],
  });
});

test("no CUIT selected and several accounts", () => {
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "x", cuits: [] }, "bob@x.com": { jwt: "y", cuits: [] } },
  });
  const out = home() as { cuit: string; help: string[] };
  expect(out.cuit).toBe("none selected");
  expect(out.help).toEqual([
    "Run `sosc-axi cuits use <id|cuit>` to select a CUIT",
    "Run `sosc-axi accounts` to see all logged-in accounts",
  ]);
});
