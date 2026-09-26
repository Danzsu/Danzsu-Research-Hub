import assert from "node:assert/strict";
import { test } from "node:test";
import { blockSchema, parseBlocks } from "./blocks.ts";
import { previewItems, previewMySources, previewPosts } from "./fixtures.ts";
import { parseId } from "./pipeline/util.ts";

test("the preview posts cover every block type", () => {
  const shown = new Set(previewPosts.flatMap((post) => post.blocks.map((block) => block.type)));
  for (const option of blockSchema.options) {
    const type = option.shape.type.value;
    assert.ok(shown.has(type), `no preview block of type ${type}: add one to lib/fixtures.ts`);
  }
});

test("every fixture block survives parseBlocks unchanged", () => {
  for (const post of previewPosts) assert.deepEqual(parseBlocks(post.blocks), post.blocks);
});

test("the preview posts show all four banners", () => {
  for (const flag of ["noarchive", "extractionFailed", "truncated", "clipped"] as const) {
    assert.ok(previewPosts.some((post) => post.meta[flag]), flag);
  }
});

test("the preview radar has exactly three must-read items and unique ids", () => {
  assert.equal(previewItems.filter((item) => item.mustRead).length, 3);
  assert.equal(new Set(previewItems.map((item) => item.id)).size, previewItems.length);
});

test("the preview post ids are negative, so the posts/[id] routes 404 before touching a real post", () => {
  for (const post of previewPosts) {
    assert.ok(post.id < 0, `post ${post.id}`);
    assert.equal(parseId(String(post.id)), null, `post ${post.id}`);
  }
});

// Kills a positive fixture id (a preview click could then reach a real source), and a state missing
// from the preview's thread.
test("the preview chat's sources have negative ids and show all three states", () => {
  for (const source of previewMySources) assert.equal(parseId(String(source.id)), null, `source ${source.id}`);
  assert.deepEqual(new Set(previewMySources.map(({ status }) => status)), new Set(["pending", "done", "failed"]));
});
