import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Extracted } from "./extract/types.ts";
import { fakeDb } from "./fake-db.ts";
import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";
import { NOT_INSTRUCTIONS, summarize, writeNotes } from "./summary.ts";

const extracted: Extracted = {
  blocks: [],
  title: "A Title",
  author: null,
  siteName: "Example",
  publishedAt: null,
  meta: {},
  text: "Some article text.",
};

const okSummary = { title: { hu: "", en: "" }, summary: { hu: "", en: "" }, keyPoints: { hu: [], en: [] }, tags: [] };

/** Captures the prompt text sent in the single Gemini `generateContent` call the handler intercepts, replying with `out` (defaulting to a valid summary). */
function capturePrompt(t: TestContext, out: unknown = okSummary) {
  let prompt = "";
  mockFetch(t, async (_url, init) => {
    prompt = geminiPrompt(init);
    return geminiResponse(out);
  });
  return () => prompt;
}

test("summarize includes the extractionFailed note (with its 3-key-point cap) only when the flag is set", async (t) => {
  withGeminiKey(t);
  const prompt = capturePrompt(t);
  await summarize(fakeDb(), extracted, "");
  assert.doesNotMatch(prompt(), /Only the page's own description/);

  await summarize(fakeDb(), { ...extracted, meta: { extractionFailed: true } }, "");
  assert.match(prompt(), /Only the page's own description was available/);
  assert.match(prompt(), /1–2 sentences/);
  assert.match(prompt(), /at most 3 key points/);
});

test("summarize includes the submitter's note", async (t) => {
  withGeminiKey(t);
  const prompt = capturePrompt(t);
  await summarize(fakeDb(), extracted, "\nThe submitter's note: check the benchmark section");
  assert.match(prompt(), /check the benchmark section/);
});

test("summarize includes the prompt-injection guard line before the source", async (t) => {
  withGeminiKey(t);
  const prompt = capturePrompt(t);
  await summarize(fakeDb(), extracted, "");
  assert.ok(prompt().includes(NOT_INSTRUCTIONS));
  assert.ok(prompt().indexOf(NOT_INSTRUCTIONS) < prompt().indexOf('SOURCE "'));
});

test("writeNotes turns sections into heading and list blocks with ids, and includes the prompt-injection guard line before the source", async (t) => {
  withGeminiKey(t);
  const prompt = capturePrompt(t, { sections: [{ heading: "Findings", points: ["Point one", "Point two"] }] });
  const blocks = await writeNotes(fakeDb(), extracted);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].type === "heading" && blocks[0].text, "Findings");
  assert.equal(blocks[1].type, "list");
  assert.equal(blocks[1].type === "list" && blocks[1].items.length, 2);
  assert.ok(blocks.every((block) => typeof block.id === "string" && block.id.length > 0));
  assert.ok(prompt().includes(NOT_INSTRUCTIONS));
  assert.ok(prompt().indexOf(NOT_INSTRUCTIONS) < prompt().indexOf('SOURCE "'));
});
