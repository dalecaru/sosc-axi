import { expect, test } from "bun:test";
import { COMMANDS } from "../../src/commands/index.ts";

test("command names are unique and do not shadow the built-in update", () => {
  const names = COMMANDS.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names).not.toContain("update");
});

test("every command has help starting with its usage line", () => {
  for (const c of COMMANDS) expect(c.help).toStartWith(`usage: sosc-axi ${c.name}`);
});

test("every command module is a real API module (OpenAPI tag)", async () => {
  const spec = Bun.YAML.parse(await Bun.file(new URL("../../openapi/sos-contador.openapi.yaml", import.meta.url)).text()) as {
    paths: Record<string, Record<string, { tags?: string[] }>>;
  };
  const tags = new Set(Object.values(spec.paths).flatMap((ops) => Object.values(ops).flatMap((o) => o.tags ?? [])));
  for (const c of COMMANDS) if (c.module) expect(tags).toContain(c.module);
});
