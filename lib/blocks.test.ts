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

test("safeHref keeps only http(s) and resolves relative links", () => {
  assert.equal(safeHref("/a?b=1", "https://site.test/post/"), "https://site.test/a?b=1");
  assert.equal(safeHref("//cdn.test/x", "https://site.test/"), "https://cdn.test/x");
  assert.equal(safeHref("javascript:alert(1)", "https://site.test/"), undefined);
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

test("parseBlocks turns bad stored data into an empty list instead of throwing", () => {
  assert.deepEqual(parseBlocks([{ id: "x", type: "nope" }]), []);
  assert.deepEqual(parseBlocks(null), []);
  const valid = assignIds([p("ok")]);
  assert.deepEqual(parseBlocks(valid), valid);
});

test("fnv1a refactor keeps existing digest item ids unchanged", () => {
  // Pinned value: ids are primary keys in item_states and must never change.
  const week = isoWeek(new Date("2026-09-23T00:00:00Z"));
  assert.equal(shortHash("https://a.example/1"), "a42106");
  assert.equal(itemId("research", week, "Title", "https://a.example/1"), "research-2026w39-title-a42106");
});
