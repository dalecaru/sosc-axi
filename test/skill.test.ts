import { expect, test } from "bun:test";
import { createSkillMarkdown, MAX_SKILL_MARKDOWN_CHARS } from "../src/skill.ts";

test("committed SKILL.md matches the generator (run `bun run build:skill`)", async () => {
  const committed = await Bun.file(new URL("../skills/sosc-axi/SKILL.md", import.meta.url)).text();
  expect(committed).toBe(createSkillMarkdown());
});

test("SKILL.md has valid frontmatter and stays a stub", () => {
  const markdown = createSkillMarkdown();
  const front = Bun.YAML.parse(markdown.match(/^---\n([\s\S]*?)\n---\n/)![1]!) as Record<string, unknown>;
  expect(front.name).toBe("sosc-axi");
  expect(front["user-invocable"]).toBe(false);
  expect(markdown.length).toBeLessThanOrEqual(MAX_SKILL_MARKDOWN_CHARS);
  expect(markdown).not.toMatch(/^## Commands/m);
});

test("refuses to grow past the stub cap", () => {
  expect(() => createSkillMarkdown(10)).toThrow("keep it a stub under 10");
});
