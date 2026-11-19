import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { z } from "zod/v4";
import { generate, retryDelaysMs, retryWaitMs } from "./llm.ts";
import { fakeDb } from "./pipeline/fake-db.ts";
import { geminiResponse, mockFetch, withEnv } from "./pipeline/mock-fetch.ts";

const schema = z.object({ answer: z.string() });
// Groq first, Gemini as its fallback: the order the routing rules below are about.
const groqThenGemini = () => fakeDb({ provider: "groq", model: "g", fallback_provider: "gemini", fallback_model: "m" });
const groqAnswer = (out: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(out) } }] });

/** Sets both provider keys (undefined unsets one) and serves each provider from its own handler. */
function providers(t: TestContext, keys: { gemini?: string; groq?: string }, answer: { gemini: () => Response; groq: () => Response }) {
  withEnv(t, "GEMINI_API_KEY", keys.gemini);
  withEnv(t, "GROQ_API_KEY", keys.groq);
  t.mock.method(console, "warn", () => {});
  const calls: string[] = [];
  let geminiBody: unknown;
  mockFetch(t, async (url, init) => {
    if (url.startsWith("https://api.groq.com/")) {
      calls.push("groq");
      return answer.groq();
    }
    calls.push("gemini");
    geminiBody = JSON.parse(String(init?.body));
    return answer.gemini();
  });
  return { calls, geminiBody: () => geminiBody };
}

test("generate() runs the first route and never touches the fallback when it succeeds", async (t) => {
  const run = providers(t, { gemini: "k", groq: "k" }, { groq: () => groqAnswer({ answer: "groq" }), gemini: () => geminiResponse({ answer: "gemini" }) });
  assert.deepEqual(await generate(groqThenGemini(), "daily_shortlist", schema, "p"), { answer: "groq" });
  assert.deepEqual(run.calls, ["groq"]);
});

test("generate() skips a route whose API key is not set", async (t) => {
  const run = providers(t, { gemini: "k" }, { groq: () => groqAnswer({ answer: "groq" }), gemini: () => geminiResponse({ answer: "gemini" }) });
  assert.deepEqual(await generate(groqThenGemini(), "daily_shortlist", schema, "p"), { answer: "gemini" });
  assert.deepEqual(run.calls, ["gemini"]);
});

test("generate() falls back when the first route fails, whether by status or by an answer that fails the schema", async (t) => {
  let groqCalls = 0;
  const run = providers(t, { gemini: "k", groq: "k" }, {
    groq: () => (++groqCalls === 1 ? new Response("broken", { status: 500 }) : groqAnswer({ wrong: "shape" })),
    gemini: () => geminiResponse({ answer: "gemini" }),
  });
  assert.deepEqual(await generate(groqThenGemini(), "daily_shortlist", schema, "p"), { answer: "gemini" });
  assert.deepEqual(await generate(groqThenGemini(), "daily_shortlist", schema, "p"), { answer: "gemini" });
  assert.deepEqual(run.calls, ["groq", "gemini", "groq", "gemini"]);
});

test("generate() sends video and PDF input to Gemini only, as file_data and inline_data parts", async (t) => {
  const run = providers(t, { gemini: "k", groq: "k" }, { groq: () => groqAnswer({ answer: "groq" }), gemini: () => geminiResponse({ answer: "gemini" }) });
  await generate(groqThenGemini(), "ingest_video", schema, "p", { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  const videoParts = (run.geminiBody() as { contents: { parts: unknown[] }[] }).contents[0].parts;
  assert.deepEqual(videoParts[0], { file_data: { file_uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  await generate(groqThenGemini(), "ingest_pdf", schema, "p", { pdfBase64: "JVBERi0=" });
  const pdfParts = (run.geminiBody() as { contents: { parts: unknown[] }[] }).contents[0].parts;
  assert.deepEqual(pdfParts[0], { inline_data: { mime_type: "application/pdf", data: "JVBERi0=" } });
  assert.deepEqual(run.calls, ["gemini", "gemini"]);
});

test("generate() names a route it skipped for media input when nothing succeeds", async (t) => {
  providers(t, { groq: "k" }, { groq: () => groqAnswer({ answer: "unused" }), gemini: () => geminiResponse({ answer: "unused" }) });
  await assert.rejects(
    () => generate(groqThenGemini(), "ingest_pdf", schema, "p", { pdfBase64: "JVBERi0=" }),
    { message: "ingest_pdf failed — groq/g: skipped, only Gemini reads video and PDF input; gemini: GEMINI_API_KEY not set" },
  );
});

test("generate() names the task and every route's failure when nothing succeeds", async (t) => {
  noRetryWait(t);
  providers(t, { groq: "k" }, { groq: () => new Response("rate limited", { status: 429 }), gemini: () => geminiResponse({ answer: "unused" }) });
  await assert.rejects(
    () => generate(groqThenGemini(), "daily_curate", schema, "p"),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith("daily_curate failed — ") &&
      error.message.includes("groq/g: api.groq.com 429: rate limited") &&
      error.message.includes("gemini: GEMINI_API_KEY not set"),
  );
});

/** For the rest of test `t`, the retries wait no time. */
function noRetryWait(t: TestContext) {
  const saved = [...retryDelaysMs];
  retryDelaysMs.fill(0);
  t.after(() => retryDelaysMs.splice(0, retryDelaysMs.length, ...saved));
}
const geminiThenGroq = () => fakeDb({ provider: "gemini", model: "m", fallback_provider: "groq", fallback_model: "g" });

// 2026-11-19 outage. Kills a busy provider's quick 503 ending the run: Google turned down every free request for an
// afternoon, and one refusal per route left the whole week's Radar empty.
test("generate() retries a busy route (503, 429) on the same model before it falls back", async (t) => {
  noRetryWait(t);
  let geminiCalls = 0;
  const run = providers(t, { gemini: "k", groq: "k" }, {
    gemini: () => (++geminiCalls < 3 ? new Response(geminiCalls === 1 ? "high demand" : "rate limit per minute", { status: geminiCalls === 1 ? 503 : 429 }) : geminiResponse({ answer: "gemini" })),
    groq: () => groqAnswer({ answer: "groq" }),
  });
  assert.deepEqual(await generate(geminiThenGroq(), "daily_curate", schema, "p"), { answer: "gemini" });
  assert.deepEqual(run.calls, ["gemini", "gemini", "gemini"]);
});

test("generate() gives a route at most two retries, then falls back", async (t) => {
  noRetryWait(t);
  const run = providers(t, { gemini: "k", groq: "k" }, {
    gemini: () => new Response("high demand", { status: 503 }),
    groq: () => groqAnswer({ answer: "groq" }),
  });
  assert.deepEqual(await generate(geminiThenGroq(), "daily_curate", schema, "p"), { answer: "groq" });
  assert.deepEqual(run.calls, ["gemini", "gemini", "gemini", "groq"]);
});

// Kills a spent balance or a daily quota retried: neither comes back within the run, and the waits would eat its 300 s.
test("generate() never retries a spent balance or a daily quota", async (t) => {
  noRetryWait(t);
  for (const [status, body] of [[402, "Your prepayment credits are depleted"], [429, "Quota exceeded: requests per day"]] as const) {
    const run = providers(t, { gemini: "k", groq: "k" }, {
      gemini: () => new Response(body, { status }),
      groq: () => groqAnswer({ answer: "groq" }),
    });
    assert.deepEqual(await generate(geminiThenGroq(), "daily_curate", schema, "p"), { answer: "groq" });
    assert.deepEqual(run.calls, ["gemini", "groq"], `${status}`);
  }
});

test("retryWaitMs follows the provider's own retry hint, capped at a minute, else the default", () => {
  assert.equal(retryWaitMs("Please retry in 5s or upgrade", 10_000), 5_500);
  assert.equal(retryWaitMs("Please retry in 1.2s", 10_000), 1_700);
  assert.equal(retryWaitMs("Please retry in 600s", 10_000), 60_000);
  assert.equal(retryWaitMs("high demand", 10_000), 10_000);
});
