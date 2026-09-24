import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "../blocks.ts";
import { applyCleanup, cleanupListing } from "./cleanup.ts";

const blocks = assignIds(Array.from({ length: 10 }, (_, i): BlockDraft => ({ type: "paragraph", content: [{ text: `p${i} ${"x".repeat(200)}` }] })));

test("cleanupListing shows id, type and a 120 character preview", () => {
  const first = cleanupListing(blocks).split("\n")[0];
  assert.ok(first.startsWith(`${blocks[0].id} [paragraph] p0 `));
  assert.ok(first.length < 160);
});

test("applyCleanup removes named blocks but refuses to gut the article", () => {
  assert.equal(applyCleanup(blocks, [blocks[0].id, blocks[1].id]).length, 8);
  assert.equal(applyCleanup(blocks, blocks.slice(0, 6).map((b) => b.id)).length, 10);
  assert.equal(applyCleanup(blocks, ["unknown"]).length, 10);
});
