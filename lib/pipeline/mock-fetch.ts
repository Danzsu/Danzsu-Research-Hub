// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { TestContext } from "node:test";
import dns from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Replaces `globalThis.fetch` for the duration of a test; call the returned function to restore it. */
export function mockFetch(handler: (url: string) => Response | Promise<Response>): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => handler(String(url))) as typeof fetch;
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

/** Offline `model_settings` row: `from().select().eq().maybeSingle()` resolves to a fixed route. No Supabase network call. */
export function fakeModelDb(route: { provider: string; model: string } = { provider: "gemini", model: "m" }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: route, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

/** A Gemini `generateContent` response shaped like the real API, with `out` as its structured JSON payload. */
export const geminiResponse = (out: unknown): Response =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));

/** Sets `GEMINI_API_KEY` for the duration of a test; call the returned function to restore it. */
export function withGeminiKey(value = "test"): () => void {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = value;
  return () => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  };
}
