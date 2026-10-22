import { expect, test } from "bun:test";
import { parse } from "../src/args.ts";

const FLAGS = { usuario: { type: "string" }, "password-stdin": { type: "boolean" } } as const;

const error = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as Error & { code: string; suggestions: string[] };
  }
  throw new Error("expected a throw");
};

test("parses flags and positionals", () => {
  expect(parse("login", ["--usuario", "a", "--password-stdin", "use"], FLAGS, 1)).toEqual({
    values: { usuario: "a", "password-stdin": true },
    positionals: ["use"],
  });
});

test("unknown flag lists the valid ones", () => {
  const e = error(() => parse("login", ["--password=x"], FLAGS));
  expect(e).toMatchObject({ code: "VALIDATION_ERROR", message: "unknown flag --password for `login`" });
  expect(e.suggestions).toEqual(["valid flags for `login`: --usuario, --password-stdin (--help always allowed)"]);
});

test("no flags at all says so", () => {
  expect(error(() => parse("x", ["-v"], {})).suggestions[0]).toContain("(none)");
});

test("missing flag value is a VALIDATION_ERROR", () => {
  expect(error(() => parse("login", ["--usuario"], FLAGS))).toMatchObject({ code: "VALIDATION_ERROR" });
});

test("extra positionals point at the command help", () => {
  const e = error(() => parse("cuits use", ["1", "2"], {}, 1));
  expect(e).toMatchObject({ code: "VALIDATION_ERROR", message: "unexpected argument 2 for `cuits use`" });
  expect(e.suggestions).toEqual(["Run `sosc-axi cuits --help`"]);
});
