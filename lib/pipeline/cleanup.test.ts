import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "../blocks.ts";
import { aiCleanup, applyCleanup, cleanupListing } from "./cleanup.ts";
import { fakeDb, geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";
import { NOT_INSTRUCTIONS } from "./summary.ts";

const paragraphs = (n: number, prefix = "p") =>
  assignIds(Array.from({ length: n }, (_, i): BlockDraft => ({ type: "paragraph", content: [{ text: `${prefix}${i} ${"x".repeat(200)}` }] })));

const blocks = paragraphs(10);

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

// M23: at 4 blocks, /2 (=2) and /2+1 (=3) genuinely differ from the 10-block case above —
// removing 2 of 4 must still be refused (kept=2 < 3).
test("applyCleanup refuses to remove 2 of 4 blocks (half+1 boundary, M23)", () => {
  const four = paragraphs(4, "q");
  assert.equal(applyCleanup(four, [four[0].id, four[1].id]).length, 4);
});

// M24: below the (now 4-block) minimum, aiCleanup makes no model call at all — not even a broken one.
test("aiCleanup makes no model call below the minimum block count (M24)", async () => {
  const three = paragraphs(3, "r");
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    return geminiResponse({ remove: [] });
  });
  try {
    const result = await aiCleanup(fakeDb(), three);
    assert.equal(calls, 0);
    assert.deepEqual(result, three);
  } finally {
    restore();
  }
});

test("aiCleanup includes summary.ts's prompt-injection guard line before the block listing", async () => {
  const restoreKey = withGeminiKey();
  const four = paragraphs(4, "s");
  let prompt = "";
  const restore = mockFetch(async (_url, init) => {
    prompt = geminiPrompt(init);
    return geminiResponse({ remove: [] });
  });
  try {
    await aiCleanup(fakeDb(), four);
    assert.ok(prompt.includes(NOT_INSTRUCTIONS));
    assert.ok(prompt.indexOf(NOT_INSTRUCTIONS) < prompt.indexOf(cleanupListing(four)));
  } finally {
    restore();
    restoreKey();
  }
});
