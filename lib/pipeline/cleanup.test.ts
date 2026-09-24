import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "../blocks.ts";
import { aiCleanup, applyCleanup, cleanupListing } from "./cleanup.ts";
import { fakeDb } from "./fake-db.ts";
import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";
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

// At 4 blocks, /2 (=2) and /2+1 (=3) genuinely differ from the 10-block case above —
// removing 2 of 4 must still be refused (kept=2 < 3).
test("applyCleanup refuses to remove 2 of 4 blocks (the half-plus-one boundary)", () => {
  const four = paragraphs(4, "q");
  assert.equal(applyCleanup(four, [four[0].id, four[1].id]).length, 4);
});

// Exactly at the boundary. Both halves need an ambient key — without one, `generate()` never
// fetches regardless of the block-count guard, and the "no call" half would pass for the wrong reason.
test("aiCleanup makes no model call below the minimum block count, and exactly one at it", async (t) => {
  withGeminiKey(t);
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    return geminiResponse({ remove: [] });
  });
  const three = paragraphs(3, "r");
  const result = await aiCleanup(fakeDb(), three);
  assert.equal(calls, 0);
  assert.deepEqual(result, three);

  const four = paragraphs(4, "t");
  await aiCleanup(fakeDb(), four);
  assert.equal(calls, 1);
});

test("aiCleanup includes summary.ts's prompt-injection guard line before the block listing", async (t) => {
  withGeminiKey(t);
  const four = paragraphs(4, "s");
  let prompt = "";
  mockFetch(t, async (_url, init) => {
    prompt = geminiPrompt(init);
    return geminiResponse({ remove: [] });
  });
  await aiCleanup(fakeDb(), four);
  assert.ok(prompt.includes(NOT_INSTRUCTIONS));
  assert.ok(prompt.indexOf(NOT_INSTRUCTIONS) < prompt.indexOf(cleanupListing(four)));
});
