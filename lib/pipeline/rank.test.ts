import assert from "node:assert/strict";
import { test } from "node:test";
import type { Candidate } from "./collect.ts";
import { categoryFor, dropRepeatedStories, estimateMinutes, finalScore, NEUTRAL, ruleScore, similarity, words } from "./rank.ts";

const now = new Date("2026-11-13T12:00:00Z");
const candidate = (title: string, extra: Partial<Candidate> = {}): Candidate => ({
  url: `https://blog.test/${title}`,
  title,
  source: "Blog",
  snippet: "",
  publishedAt: "2026-11-13",
  hint: "companies",
  points: 0,
  weight: 1,
  ...extra,
});

test("words keeps a headline's distinctive words, without case, accents, punctuation or filler", () => {
  assert.deepEqual([...words("The New Qwen 3.8: Open Weights, Árvíztűrő!")].sort(), ["3", "8", "arvizturo", "open", "qwen", "weights"]);
});

test("similarity is the share of words two headlines have in common", () => {
  assert.equal(similarity(words("Anthropic releases Claude 5"), words("Anthropic releases Claude 5")), 1);
  assert.equal(similarity(words("alpha beta"), words("gamma delta")), 0);
  assert.equal(similarity(new Set(), words("x1 y1")), 0);
});

// Kills the story check left to the prompt: a paraphrased headline of a covered story, or two sources' take on
// one launch, each became a card.
test("dropRepeatedStories drops a covered story and the twin of a better source, and keeps the rest", () => {
  const kept = dropRepeatedStories(
    [
      candidate("Anthropic releases Claude 5 with faster inference", { source: "The Decoder", weight: 0.9 }),
      candidate("Claude 5 released by Anthropic with faster inference", { source: "Anthropic", weight: 1.4 }),
      candidate("Mistral Large 4 lands on Hugging Face"),
      candidate("OpenAI ships a new agents SDK for developers"),
    ],
    ["OpenAI ships new agents SDK for developers"],
  );
  assert.deepEqual(kept.map((c) => c.source + ":" + c.title.slice(0, 10)), ["Anthropic:Claude 5 r", "Blog:Mistral La"]);
});

test("dropRepeatedStories keeps the earlier of two equally trusted twins", () => {
  const kept = dropRepeatedStories([candidate("Qwen 3.8 open weights released", { url: "https://a.test/1" }), candidate("Qwen 3.8 open weights released today", { url: "https://a.test/2" })], []);
  assert.deepEqual(kept.map((c) => c.url), ["https://a.test/1"]);
});

// Kills a score that ignores one signal: trust, freshness (a 2-day half-life) or popularity (log scale).
test("ruleScore rises with the source's trust, freshness and popularity", () => {
  const base = ruleScore(candidate("x1"), now);
  assert.ok(ruleScore(candidate("x1", { weight: 1.4 }), now) > base);
  assert.ok(ruleScore(candidate("x1", { points: 300 }), now) > base);
  assert.ok(ruleScore(candidate("x1", { publishedAt: "2026-11-09" }), now) < base);
  assert.ok(Math.abs(ruleScore(candidate("x1", { publishedAt: "2026-11-11" }), now) - (ruleScore(candidate("x1", { publishedAt: "2026-11-13" }), now) - 0.15)) < 0.02, "two days halves the freshness part");
  assert.ok(ruleScore(candidate("x1", { weight: 5, points: 99999 }), now) <= 1);
});

// Kills every Hacker News link left "companies": a llama.cpp thread and a paper were filed under company news.
test("categoryFor sorts a Hacker News link by its words and trusts every other feed's hint", () => {
  const hn = { source: "Hacker News · 120 pts" };
  assert.equal(categoryFor(candidate("Running Llama locally with llama.cpp", hn)), "local");
  assert.equal(categoryFor(candidate("A paper on sparse attention: we propose", hn)), "research");
  assert.equal(categoryFor(candidate("OpenAI raises a new round", hn)), "companies");
  assert.equal(categoryFor(candidate("Running Llama locally", { hint: "research" })), "research");
});

test("estimateMinutes: a paper takes longer than a lab's post or a link from Hacker News", () => {
  assert.equal(estimateMinutes(candidate("p", { url: "https://arxiv.org/abs/2411.01234" })), 20);
  assert.equal(estimateMinutes(candidate("p", { source: "Hacker News · 90 pts" })), 6);
  assert.equal(estimateMinutes(candidate("p", { hint: "local" })), 8);
  assert.equal(estimateMinutes(candidate("p")), 5);
});

// Kills the weights drifting: relevance must lead, a promotion must sink, and 90+ must stay rare.
test("finalScore: relevance leads, a promotion is cut down, and the top of the scale is rare", () => {
  const trusted = ruleScore(candidate("x1", { weight: 1.4, points: 200 }), now);
  assert.ok(finalScore(trusted, { relevance: 1, promotion: 0 }) > finalScore(trusted, { relevance: 0.5, promotion: 0 }));
  assert.ok(finalScore(0.5, { relevance: 1, promotion: 0 }) > finalScore(1, { relevance: 0.25, promotion: 0 }), "relevance outweighs the feed's signals");
  assert.ok(finalScore(trusted, { relevance: 1, promotion: 0.9 }) < 35);
  assert.equal(finalScore(trusted, { relevance: 1, promotion: 0 }), 99, "capped");
  assert.ok(finalScore(0.55, { relevance: 0.75, promotion: 0 }) < 85, "a good story is not 85+");
  // The calibration the mirror's 85 line rests on (measured on live feeds: median rule score 0.52, best 0.72).
  assert.ok(finalScore(0.52, { relevance: 1, promotion: 0 }) >= 80 && finalScore(0.52, { relevance: 1, promotion: 0 }) <= 90, "essential from an average source ≈ 85");
  assert.ok(finalScore(0.52, { relevance: 0.5, promotion: 0 }) >= 40 && finalScore(0.52, { relevance: 0.5, promotion: 0 }) <= 55, "useful ≈ 50");
  assert.ok(finalScore(0.72, { relevance: 0, promotion: 0 }) < 35, "an irrelevant story never passes the day's minimum");
  assert.equal(finalScore(0, { relevance: 0, promotion: 0 }), 0);
  assert.equal(finalScore(0.6, NEUTRAL) > 30, true, "no judgement is neither good nor bad");
});
