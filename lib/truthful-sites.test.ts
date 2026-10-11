import assert from "node:assert/strict";
import { test } from "node:test";
import { docFile } from "./test/doc-file.ts";
import { DEFAULT_FEED_LIMIT, feeds, githubTopics, hnNames, hnQueries } from "../config/sources.ts";

// truthful_sites.md → "Bent van" documents config/sources.ts. This keeps the two equal, both ways:
// it fails for a source added to or removed from either side, and for a changed URL, limit or category.

const markdown = docFile("truthful_sites.md");

/** The lines under the `### heading`, up to the next heading of any level. */
function section(heading: string): string {
  const start = markdown.indexOf(`\n### ${heading}\n`);
  assert.notEqual(start, -1, `truthful_sites.md has no "### ${heading}" section`);
  const body = markdown.slice(start + heading.length + 6);
  const end = body.search(/^#/m);
  return end === -1 ? body : body.slice(0, end);
}

/** The `` - `value` `` bullets of a section. */
const bullets = (heading: string) => [...section(heading).matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]);

test("truthful_sites.md lists exactly the feeds the daily run reads, with their category and limit", () => {
  const rows = [...section("Hírcsatornák (RSS, Atom)").matchAll(/^\| ([^|]+) \| `(https:[^`]+)` \| (\w+) \| (\d+) \|/gm)];
  assert.deepEqual(
    rows.map(([, name, url, hint, limit]) => [name.trim(), url, hint, Number(limit)]),
    feeds.map(({ name, url, hint, limit }) => [name, url, hint, limit ?? DEFAULT_FEED_LIMIT]),
  );
});

test("truthful_sites.md lists exactly the Hacker News queries and GitHub topics the daily run searches", () => {
  assert.deepEqual(bullets("Hacker News"), [...hnQueries, ...hnNames]);
  assert.deepEqual(bullets("GitHub"), githubTopics);
});
