import assert from "node:assert/strict";
import { test } from "node:test";
import type { Candidate } from "./collect.ts";
import { decide, judgements, questionsFor } from "./decisions.ts";
import { mockFetch, withEnv } from "./mock-fetch.ts";

const candidate = (title: string): Candidate => ({ url: `https://blog.test/${title}`, title, source: "Blog", snippet: "s", publishedAt: "2026-11-13", hint: "companies", points: 0, weight: 1 });

// Kills a question shape Gemini refuses: a score and a choice need criteria, a yes/no none; keys are [A-Za-z0-9_-].
test("questionsFor asks relevance, promotion and category for each candidate", () => {
  const questions = questionsFor(2) as Record<string, { type: string; criteria?: unknown }>;
  assert.deepEqual(Object.keys(questions), ["r0", "p0", "c0", "r1", "p1", "c1"]);
  assert.deepEqual([questions.r0.type, questions.p0.type, questions.c0.type], ["score", "noul", "choice"]);
  assert.equal(Array.isArray(questions.r0.criteria) && questions.r0.criteria.length, 5);
  assert.equal(questions.p0.criteria, undefined);
  assert.deepEqual(Object.keys(questions.c0.criteria as object), ["local", "research", "companies"]);
});

// Kills a relevance left on the 0–4 level scale, and a malformed answer reaching the score.
test("judgements maps the answers to 0–1 relevance, the promotion probability and the category, and skips a bad candidate", () => {
  const decided = judgements(
    {
      r0: { type: "score", score: 3 }, p0: { type: "noul", noul: 0.1 }, c0: { type: "choice", choice: "local" },
      r1: { type: "score", score: 9 }, p1: { type: "noul", noul: 0.9 }, c1: { type: "choice", choice: "research" },
      r2: { type: "score", score: 2 }, p2: { type: "noul", noul: 0.2 }, c2: { type: "choice", choice: "github" },
      r3: { type: "score", score: 2 },
    },
    4,
  );
  assert.deepEqual(decided.get(0), { relevance: 0.75, promotion: 0.1, category: "local" });
  assert.equal(decided.get(1)?.relevance, 1, "clamped");
  assert.equal(decided.has(2), false, "an unknown category");
  assert.equal(decided.has(3), false, "a missing answer");
});

test("decide posts the listing and the questions once, with the key, and returns the judgements", async (t) => {
  withEnv(t, "GEMINI_API_KEY", "k");
  let seen: { url: string; key: string | null; body: { model: string; input: string; questions: object } } | undefined;
  mockFetch(t, async (url, init) => {
    seen = { url, key: new Headers(init?.headers).get("x-goog-api-key"), body: JSON.parse(String(init?.body)) };
    return Response.json({ answers: { r0: { type: "score", score: 4 }, p0: { type: "noul", noul: 0.05 }, c0: { type: "choice", choice: "companies" } } });
  });
  const decided = await decide([candidate("Big launch")]);
  assert.equal(seen?.url, "https://generativelanguage.googleapis.com/v1beta/decisions");
  assert.equal(seen?.key, "k");
  assert.equal(seen?.body.model, "gemini-decision-1");
  assert.match(seen?.body.input ?? "", /\[0\] Big launch — Blog/);
  assert.deepEqual(decided.get(0), { relevance: 1, promotion: 0.05, category: "companies" });
});

// Kills a failure swallowed here: the caller must know to fall back to the rule score.
test("decide throws without a key, and on a refused request", async (t) => {
  withEnv(t, "GEMINI_API_KEY", "");
  await assert.rejects(decide([candidate("a")]), /GEMINI_API_KEY not set/);
  withEnv(t, "GEMINI_API_KEY", "k");
  mockFetch(t, async () => new Response('{"error":{"code":"safety"}}', { status: 400 }));
  await assert.rejects(decide([candidate("a")]), /gemini decisions failed: .*400/);
});
