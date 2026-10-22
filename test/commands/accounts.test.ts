import { describe, expect, test } from "bun:test";
import { accounts } from "../../src/commands/accounts.ts";
import { loadStore } from "../../src/store.ts";
import { expectAxiError, jwt, seed, useSandbox } from "../helpers.ts";

useSandbox();

const two = () =>
  seed({
    default: "ana@x.com",
    accounts: {
      "ana@x.com": { jwt: jwt({ exp: 4102444800 }), cuits: [{ id: "11", cuit: "20123456789" }], cuit: "11" },
      "bob@x.com": { jwt: jwt(), cuits: [] },
    },
  });

describe("list", () => {
  test("empty state points at login", async () => {
    const out = (await accounts.run([], undefined)) as Record<string, unknown>;
    expect(out.accounts).toBe("0 accounts logged in");
    expect(out.help).toEqual([expect.stringContaining("sosc-axi login")]);
  });

  test("lists accounts with default marker, active CUIT and session", async () => {
    two();
    const out = (await accounts.run([], undefined)) as Record<string, unknown>;
    expect(out.count).toBe("2 accounts logged in");
    expect(out.accounts).toEqual([
      { usuario: "ana@x.com", default: "*", cuit: "20123456789", session: "valid until 2100-01-01T00:00Z" },
      { usuario: "bob@x.com", default: "", cuit: "", session: "unknown expiry" },
    ]);
  });

  test("rejects unknown flags", async () => {
    await expectAxiError(accounts.run(["--all"], undefined), "VALIDATION_ERROR");
  });
});

describe("use", () => {
  test("switches the default account", async () => {
    two();
    expect(await accounts.run(["use", "bob@x.com"], undefined)).toEqual({
      accounts: "default account is now bob@x.com",
    });
    expect(loadStore().default).toBe("bob@x.com");
  });

  test("is a no-op for the current default", async () => {
    two();
    expect(await accounts.run(["use", "ana@x.com"], undefined)).toEqual({
      accounts: "ana@x.com is already the default account (no-op)",
    });
  });

  test("unknown account requires login", async () => {
    two();
    await expectAxiError(accounts.run(["use", "zoe@x.com"], undefined), "AUTH_REQUIRED", "zoe@x.com is not logged in");
  });

  test("requires a usuario", async () => {
    await expectAxiError(accounts.run(["use"], undefined), "VALIDATION_ERROR", "usuario is required");
  });

  test("rejects extra arguments", async () => {
    await expectAxiError(accounts.run(["use", "a", "b"], undefined), "VALIDATION_ERROR", "unexpected argument b");
  });
});
