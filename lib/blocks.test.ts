import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, blockSchema, limitBlocks, parseBlocks, plainText, safeHref, sectionsToBlocks, type BlockDraft } from "./blocks.ts";
import { itemId, isoWeek, shortHash } from "./pipeline/util.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });

test("assignIds is content-derived: inserting a block does not change the others", () => {
  const before = assignIds([p("alpha"), p("beta")]);
  const after = assignIds([p("intro"), p("alpha"), p("beta")]);
  assert.equal(after[1].id, before[0].id);
  assert.equal(after[2].id, before[1].id);
});

test("assignIds suffixes repeated identical blocks", () => {
  const ids = assignIds([p("same"), p("same"), p("same")]).map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
  assert.match(ids[1], /-2$/);
  assert.match(ids[2], /-3$/);
});

// B2: every saved `hidden_blocks` entry, and every future annotation, is one of these ids.
test("assignIds output is pinned forever: type prefix, content hash, normalization and the duplicate suffix", () => {
  // ⚠️ If this test fails, the change orphans every submitter's hidden blocks: fix the code, never the expected ids.
  const ids = assignIds([
    { type: "paragraph", content: [{ text: "Local models are  " }, { text: "Fast", bold: true }] },
    { type: "heading", level: 2, text: "Results" },
    { type: "image", originalUrl: "https://blog.test/figure.png", alt: "A figure", path: null },
    { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
    { type: "paragraph", content: [{ text: "local MODELS are fast" }] },
  ]).map((block) => block.id);
  assert.deepEqual(ids, ["pd6988894", "h073e213f", "i599b87fb", "v1aaaff45", "pd6988894-2"]);
});

test("safeHref keeps only http(s) and resolves relative links", () => {
  assert.equal(safeHref("/a?b=1", "https://site.test/post/"), "https://site.test/a?b=1");
  // Protocol-relative is fine: it still resolves to an http(s) URL, just on another host.
  assert.equal(safeHref("//cdn.test/x", "https://site.test/"), "https://cdn.test/x");
  assert.equal(safeHref("javascript:alert(1)", "https://site.test/"), undefined);
  // React 19 neutralizes `javascript:` on render but not `data:` — safeHref is the actual gate.
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>", "https://site.test/"), undefined);
  assert.equal(safeHref("data:image/svg+xml;base64,AAAA", "https://site.test/"), undefined);
  assert.equal(safeHref("vbscript:msgbox(1)", "https://site.test/"), undefined);
  assert.equal(safeHref("mailto:a@b.c", "https://site.test/"), undefined);
  assert.equal(safeHref("", "https://site.test/"), undefined);
});

test("blocks round-trip through the schema", () => {
  for (const block of assignIds([
    p("text"),
    { type: "heading", level: 2, text: "H" },
    { type: "list", ordered: false, items: [[{ text: "a", href: "https://x.test/" }]] },
    { type: "code", language: "ts", code: "let a = 1;" },
    { type: "image", originalUrl: "https://x.test/a.png", alt: "", path: null },
    { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
    { type: "divider" },
  ])) {
    assert.deepEqual(blockSchema.parse(block), block);
  }
});

test("sectionsToBlocks and plainText", () => {
  const drafts = sectionsToBlocks([{ heading: "Findings", points: ["one", "two"] }]);
  assert.equal(drafts[0].type, "heading");
  assert.equal(plainText(drafts), "Findings\n\none\ntwo");
});

test("limitBlocks clips by count and by characters", () => {
  const many = assignIds(Array.from({ length: 450 }, (_, i) => p(`para ${i}`)));
  assert.equal(limitBlocks(many).blocks.length, 400);
  assert.equal(limitBlocks(many).clipped, true);
  const long = assignIds([p("x".repeat(150_000)), p("y".repeat(100_000)), p("z")]);
  const limited = limitBlocks(long);
  assert.equal(limited.blocks.length, 1);
  assert.equal(limited.clipped, true);
  assert.equal(limitBlocks(assignIds([p("short")])).clipped, false);
});

test("parseBlocks keeps valid blocks and drops malformed ones", () => {
  assert.deepEqual(parseBlocks([{ id: "x", type: "nope" }]), []);
  assert.deepEqual(parseBlocks(null), []);
  const valid = assignIds([p("ok")]);
  assert.deepEqual(parseBlocks(valid), valid);
  // Keeps valid blocks and drops invalid ones (not blanking entire array)
  const mixed = assignIds([p("first"), p("second")]);
  const withInvalid = [mixed[0], { id: "x", type: "nope" }, mixed[1]];
  assert.deepEqual(parseBlocks(withInvalid), [mixed[0], mixed[1]]);
});

test("fnv1a refactor keeps existing digest item ids unchanged", () => {
  // Pinned value: ids are primary keys in item_states and must never change.
  const week = isoWeek(new Date("2026-09-23T00:00:00Z"));
  assert.equal(shortHash("https://a.example/1"), "a42106");
  assert.equal(itemId("research", week, "Title", "https://a.example/1"), "research-2026w39-title-a42106");
});
