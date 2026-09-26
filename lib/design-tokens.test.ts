import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// DESIGN.md's front-matter colours document app/globals.css's :root. This keeps the two equal, both ways:
// it fails for a changed hex, and for a colour added to or removed from either side.

const repoRoot = new URL("../", import.meta.url);
const readRepoFile = (path: string) => readFileSync(new URL(path, repoRoot), "utf8").replace(/\r\n/g, "\n");

const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})/;

/** The `colors:` block of the YAML front matter. Every line in it must be `  name: "#hex"`; the next top-level key ends it. */
function designColors(markdown: string): Map<string, string> {
  const frontMatter = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1];
  assert.ok(frontMatter, "DESIGN.md has no front matter");
  const lines = frontMatter.split("\n");
  const start = lines.indexOf("colors:");
  assert.notEqual(start, -1, "DESIGN.md's front matter has no colors: block");
  const colors = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(" ")) break;
    const match = new RegExp(`^  ([a-z][a-z0-9-]*): "(${HEX.source})"$`).exec(line);
    assert.ok(match, `not a  name: "#hex"  line in DESIGN.md's colors: ${JSON.stringify(line)}`);
    assert.ok(!colors.has(match[1]), `DESIGN.md names the colour ${match[1]} twice`);
    colors.set(match[1], match[2]);
  }
  return colors;
}

/** Every `--name: #hex;` declaration of the `:root { … }` block (the test below keeps it the only one). Non-colour custom properties (`--radius`) are skipped. */
function rootColors(css: string): Map<string, string> {
  const block = /^:root \{\n([\s\S]*?)\n\}/m.exec(css)?.[1];
  assert.ok(block, "app/globals.css has no :root block");
  const colors = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = new RegExp(`^\\s*--([a-z][a-z0-9-]*):\\s*(${HEX.source});$`).exec(line);
    if (match) colors.set(match[1], match[2]);
  }
  return colors;
}

test("DESIGN.md's colour tokens equal app/globals.css's :root, and neither side has one the other lacks", () => {
  const design = designColors(readRepoFile("DESIGN.md"));
  const css = rootColors(readRepoFile("app/globals.css"));
  // Not vacuous: an empty parse on both sides would otherwise compare equal.
  for (const brand of ["ink", "paper", "cream", "signal", "cyan"]) {
    assert.ok(design.has(brand) && css.has(brand), `brand token ${brand} missing from DESIGN.md or globals.css`);
  }
  assert.deepEqual(
    {
      onlyInDesign: [...design.keys()].filter((name) => !css.has(name)),
      onlyInCss: [...css.keys()].filter((name) => !design.has(name)),
      different: [...design].filter(([name, hex]) => css.has(name) && css.get(name) !== hex).map(([name, hex]) => `${name}: DESIGN.md ${hex}, globals.css ${css.get(name)}`),
    },
    { onlyInDesign: [], onlyInCss: [], different: [] },
  );
});

// `npx shadcn add` appends a second :root and a .dark block after @theme inline, where they win the cascade.
test("app/globals.css keeps one :root and a single fixed theme: no .dark block, no prefers-color-scheme", () => {
  const css = readRepoFile("app/globals.css");
  assert.equal(css.match(/:root\b/g)?.length ?? 0, 1, "app/globals.css must have exactly one :root");
  assert.doesNotMatch(css, /\.dark\b/, "app/globals.css has a .dark rule (DESIGN.md: one fixed theme)");
  assert.doesNotMatch(css, /prefers-color-scheme/, "app/globals.css has a prefers-color-scheme query (DESIGN.md: one fixed theme)");
});
