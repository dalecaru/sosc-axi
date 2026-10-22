// Generates skills/sosc-axi/SKILL.md from src/skill.ts.
//   bun run build:skill            # write the file
//   bun run build:skill --check    # exit 1 if the committed file is stale
import { createSkillMarkdown } from "../src/skill.ts";

const target = Bun.file(new URL("../skills/sosc-axi/SKILL.md", import.meta.url));
const expected = createSkillMarkdown();

if (process.argv.includes("--check")) {
  if (!(await target.exists()) || (await target.text()) !== expected) {
    console.error("skills/sosc-axi/SKILL.md is out of date. Run `bun run build:skill` and commit the result.");
    process.exit(1);
  }
  console.log("skills/sosc-axi/SKILL.md is up to date.");
} else {
  await Bun.write(target, expected);
  console.log(`Wrote ${target.name}`);
}
