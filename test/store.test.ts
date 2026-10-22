import { describe, expect, test } from "bun:test";
import { statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { jwtExpiry, loadStore, saveStore, storeDir, tokenStatus } from "../src/store.ts";
import { jwt, useSandbox } from "./helpers.ts";

useSandbox();

describe("storeDir", () => {
  test("SOSC_AXI_HOME wins", () => {
    process.env.XDG_CONFIG_HOME = "/xdg";
    expect(storeDir()).toBe(process.env.SOSC_AXI_HOME!);
  });

  test("then XDG_CONFIG_HOME, then ~/.config", () => {
    delete process.env.SOSC_AXI_HOME;
    process.env.XDG_CONFIG_HOME = "/xdg";
    expect(storeDir()).toBe("/xdg/sosc-axi");
    delete process.env.XDG_CONFIG_HOME;
    expect(storeDir()).toBe(join(homedir(), ".config", "sosc-axi"));
  });
});

describe("load/save", () => {
  test("missing or corrupt file loads an empty store", () => {
    expect(loadStore()).toEqual({ accounts: {} });
    writeFileSync(join(storeDir(), "accounts.json"), "{nope");
    expect(loadStore()).toEqual({ accounts: {} });
  });

  test("round-trips into an owner-only dir and file", () => {
    process.env.SOSC_AXI_HOME = join(process.env.SOSC_AXI_HOME!, "nested");
    const store = { default: "a", accounts: { a: { jwt: "t", cuits: [] } } };
    saveStore(store);
    expect(loadStore()).toEqual(store);
    expect(statSync(storeDir()).mode & 0o777).toBe(0o700);
    expect(statSync(join(storeDir(), "accounts.json")).mode & 0o777).toBe(0o600);
  });

  test("tightens permissions of an existing file", () => {
    const file = join(storeDir(), "accounts.json");
    writeFileSync(file, "{}", { mode: 0o644 });
    saveStore({ accounts: {} });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe("token expiry", () => {
  test("jwtExpiry reads exp, tolerates garbage", () => {
    expect(jwtExpiry(jwt({ exp: 100 }))).toBe(100);
    expect(jwtExpiry(jwt({ exp: "100" }))).toBeUndefined();
    expect(jwtExpiry("not-a-jwt")).toBeUndefined();
  });

  test("tokenStatus", () => {
    expect(tokenStatus(jwt())).toBe("unknown expiry");
    expect(tokenStatus(jwt({ exp: 100 }), 100)).toBe("expired");
    expect(tokenStatus(jwt({ exp: 4102444800 }), 0)).toBe("valid until 2100-01-01T00:00Z");
  });
});
