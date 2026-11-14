import assert from "node:assert/strict";
import { test } from "node:test";
import type { Extracted } from "./extract/types.ts";
import { keywordTags, leadSummary, quickSummary } from "./quick-summary.ts";

const sentence = (n: number) => `This is sentence number ${n} of a fairly ordinary article about models.`;

// Kills a summary that is the whole page, or one cut in the middle of a word or a sentence.
test("leadSummary takes whole leading sentences up to a paragraph, and cuts a single huge sentence at a word", () => {
  const text = Array.from({ length: 20 }, (_, i) => sentence(i)).join(" ");
  const lead = leadSummary(text);
  assert.ok(lead.length >= 280 && lead.length <= 600, String(lead.length));
  assert.ok(lead.endsWith("models."));
  const huge = leadSummary(`${"word ".repeat(400)}.`);
  assert.ok(huge.length <= 601 && huge.endsWith("…") && !huge.endsWith(" …"));
  assert.equal(leadSummary("  \n "), "");
  assert.equal(leadSummary("No final punctuation here"), "No final punctuation here");
});

// Kills tags from a single passing mention, and an unbounded tag list.
test("keywordTags needs two hits (a title word counts double), keeps the best four and stays inside the vocabulary", () => {
  assert.deepEqual(keywordTags("A note", "We mention an agent once."), []);
  assert.deepEqual(keywordTags("New agents release", "Nothing else."), ["agents"]);
  const many = "agents agents inference inference quantization quantization benchmark benchmark rag rag reasoning reasoning";
  const tags = keywordTags("", many);
  assert.equal(tags.length, 4);
  assert.ok(tags.every((tag) => ["agents", "inference", "quantization", "benchmarks", "rag", "reasoning"].includes(tag)));
});

test("quickSummary writes the title and lead once in both slots, with no key points and no brief", () => {
  const extracted = { blocks: [], title: "Qwen 3.8 released", author: null, siteName: "Blog", publishedAt: null, meta: {}, text: `${sentence(1)} ${sentence(2)}` } as Extracted;
  const out = quickSummary(extracted);
  assert.deepEqual(out.title, { hu: "Qwen 3.8 released", en: "Qwen 3.8 released" });
  assert.equal(out.summary.hu, out.summary.en);
  assert.deepEqual([out.keyPoints, out.brief], [{ hu: [], en: [] }, { hu: [], en: [] }]);
});
