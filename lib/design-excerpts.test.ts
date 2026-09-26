import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// DESIGN.md's UI kit quotes the real code. Each ```tsx / ```css block names its source on the fence
// (```tsx app/components/tag.tsx) and must appear in that file verbatim, so an edited component whose
// excerpt wasn't re-copied fails here. Only CRLF and trailing whitespace are normalized.

const repoRoot = new URL("../", import.meta.url);
const normalize = (text: string) => text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
const readRepoFile = (path: string) => normalize(readFileSync(new URL(path, repoRoot), "utf8"));

const blocks = [...readRepoFile("DESIGN.md").matchAll(/^```(tsx|css)(?: (\S+))?\n([\s\S]*?)^```$/gm)].map(([, lang, source, body]) => ({
  lang,
  source,
  body: body.replace(/\n$/, ""),
}));

test("DESIGN.md has code excerpts to check", () => {
  // Not vacuous: a changed fence syntax would otherwise match nothing and pass.
  assert.ok(blocks.length >= 20, `only ${blocks.length} tsx/css blocks found in DESIGN.md`);
});

for (const [index, { lang, source, body }] of blocks.entries()) {
  test(`DESIGN.md excerpt ${index + 1} (${lang} ${source ?? "no source"}) appears verbatim in its source`, () => {
    assert.ok(source, `excerpt ${index + 1} names no source file on its fence: ${JSON.stringify(body.split("\n")[0])}`);
    assert.ok(existsSync(new URL(source, repoRoot)), `excerpt ${index + 1}'s source ${source} does not exist`);
    assert.ok(readRepoFile(source).includes(body), `excerpt ${index + 1} is no longer in ${source}: re-copy it from the file`);
  });
}
