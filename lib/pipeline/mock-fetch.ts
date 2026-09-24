// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { TestContext } from "node:test";
import dns from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Replaces `globalThis.fetch` for the duration of a test; call the returned function to restore it.
 * `init` is passed through so a test can assert on the request body — existing handlers that only
 * take `url` keep working unchanged.
 */
export function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => handler(String(url), init)) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

/**
 * Fakes `safeFetch`'s DNS check so a fixed real hostname (e.g. arxiv.org, hardcoded inside an
 * extractor) resolves to `address` without a live query. `dns` is a default-imported object here,
 * so `t.mock.method` can redefine its `lookup` property (an `import * as` namespace object can't —
 * its exports are frozen); the test's own mock tracker restores it automatically afterward, no
 * production-side hook involved. Pair with `mockFetch` for the actual response.
 */
export function mockDns(t: TestContext, address = "93.184.216.34"): void {
  t.mock.method(dns, "lookup", async () => [{ address, family: 4 }]);
}

/**
 * Offline `model_settings` row: `from().select().eq().maybeSingle()` resolves to a fixed route. No
 * Supabase network call. `.tasks` records every value queried via `.eq("task", value)`, so a test can
 * assert which task (`ingest_video`, `ingest_article`, …) a call actually asked for.
 */
export function fakeModelDb(route: { provider: string; model: string } = { provider: "gemini", model: "m" }): SupabaseClient & { tasks: string[] } {
  const tasks: string[] = [];
  return {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          if (column === "task") tasks.push(value);
          return { maybeSingle: async () => ({ data: route, error: null }) };
        },
      }),
    }),
    tasks,
  } as unknown as SupabaseClient & { tasks: string[] };
}

/** A raw Gemini `generateContent` envelope with `text` as the model's literal (unparsed) output — for building malformed-response fixtures. */
export const geminiText = (text: string): Response => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

/** A Gemini `generateContent` response shaped like the real API, with `out` as its structured JSON payload. */
export const geminiResponse = (out: unknown): Response => geminiText(JSON.stringify(out));

/** A stable, public YouTube video URL for offline `extractYoutube` fixtures, shared across test files. */
export const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/**
 * A fetch handler for "oEmbed succeeds, the Gemini call itself fails" — the scenario shared by
 * `extractYoutube`'s own unit test and `extract()`'s integration test of the same behaviour.
 * `counter`, if given, is incremented once per request (oEmbed and Gemini alike).
 */
export function oembedThenBrokenGemini(info: unknown, counter?: { calls: number }): (url: string) => Response | Promise<Response> {
  return async (url: string) => {
    if (counter) counter.calls++;
    if (url.includes("/oembed")) return new Response(JSON.stringify(info));
    return geminiText("not valid json"); // the Gemini call itself fails
  };
}

/** Sets `GEMINI_API_KEY` for the duration of a test; call the returned function to restore it. */
export function withGeminiKey(value = "test"): () => void {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = value;
  return () => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  };
}
