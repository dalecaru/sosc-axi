import { expect, test } from "bun:test";
import { logout } from "../../src/commands/logout.ts";
import { loadStore } from "../../src/store.ts";
import { expectAxiError, seed, useSandbox } from "../helpers.ts";

useSandbox();

const two = () =>
  seed({
    default: "ana@x.com",
    accounts: { "ana@x.com": { jwt: "a", cuits: [] }, "bob@x.com": { jwt: "b", cuits: [] } },
  });

test("no account logged in is a no-op", async () => {
  expect(await logout.run([], undefined)).toEqual({ logout: "no account logged in (no-op)" });
});

test("unknown account is a no-op", async () => {
  two();
  expect(await logout.run(["--usuario", "zoe@x.com"], undefined)).toEqual({ logout: "zoe@x.com was not logged in (no-op)" });
  expect(Object.keys(loadStore().accounts)).toHaveLength(2);
});

test("removes the default account and promotes the next one", async () => {
  two();
  expect(await logout.run([], undefined)).toEqual({ logout: "ana@x.com logged out", default: "bob@x.com" });
  expect(loadStore()).toEqual({ default: "bob@x.com", accounts: { "bob@x.com": { jwt: "b", cuits: [] } } });
});

test("--usuario removes a non-default account and keeps the default", async () => {
  two();
  await logout.run(["--usuario", "bob@x.com"], undefined);
  expect(loadStore().default).toBe("ana@x.com");
});

test("logging out the last account points at login", async () => {
  seed({ default: "ana@x.com", accounts: { "ana@x.com": { jwt: "a", cuits: [] } } });
  const out = (await logout.run([], undefined)) as Record<string, unknown>;
  expect(out.default).toBe("none");
  expect(out.help).toEqual([expect.stringContaining("sosc-axi login")]);
});

test("rejects positionals", async () => {
  await expectAxiError(logout.run(["ana@x.com"], undefined), "VALIDATION_ERROR", "unexpected argument");
});
