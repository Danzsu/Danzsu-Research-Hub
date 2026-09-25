import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { z } from "zod/v4";
import { generate } from "./llm.ts";
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
    groq: () => (++groqCalls === 1 ? new Response("overloaded", { status: 503 }) : groqAnswer({ wrong: "shape" })),
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
