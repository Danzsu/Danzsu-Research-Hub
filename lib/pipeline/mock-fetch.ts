// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { TestContext } from "node:test";
import dns from "node:dns/promises";

/** A public IP literal: `dns.lookup()` resolves it locally, no real DNS query, so `safeFetch` tests
 *  run offline just by using it as the host — no `mockDns(t)` needed. The one place this IP is spelled out. */
export const TEST_IP = "93.184.216.34";
export const TEST_HOST = `http://${TEST_IP}`;

// Restores go back to these load-time originals rather than to whatever the previous call replaced:
// `t.after` hooks run in the order they were added, so a test that mocks twice would otherwise end
// with its first mock reinstated.
const realFetch = globalThis.fetch;
const originalEnv = { ...process.env };

/** Replaces `globalThis.fetch` for the rest of test `t`. `init` is passed through so a handler can inspect the request. */
export function mockFetch(t: TestContext, handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => handler(String(url), init)) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
}

/**
 * Fakes `safeFetch`'s DNS check so a fixed real hostname (e.g. arxiv.org, hardcoded inside an
 * extractor) resolves to `addresses` (default: TEST_IP) without a live query, all of them in one
 * answer the way `lookup(host, { all: true })` gives them. `dns` is a default-imported object here,
 * so `t.mock.method` can redefine its `lookup` property (an `import * as` namespace object can't —
 * its exports are frozen); the test's own mock tracker restores it automatically afterward, no
 * production-side hook involved. Pair with `mockFetch` for the actual response.
 */
export function mockDns(t: TestContext, ...addresses: string[]): void {
  const answer = (addresses.length ? addresses : [TEST_IP]).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  t.mock.method(dns, "lookup", async () => answer);
}

/** Extracts the text prompt from a captured Gemini `generateContent` request body — the first
 *  `parts` entry with a `text` field. Pair with `mockFetch`'s `init` to inspect what a test's
 *  handler actually asked the model, e.g. to route a cleanup vs. summarize call differently. */
export function geminiPrompt(init?: RequestInit): string {
  const body = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
  return body.contents[0].parts.find((part) => part.text)?.text ?? "";
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

const setEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

/**
 * A response body that never ends (each read yields `chunkBytes` more) and records whether it was
 * cancelled and how many chunks were read. `highWaterMark: 0` means nothing is pulled until a reader
 * asks, so `reads() === 0` proves a body was released unread, not read up to a cap and then cancelled.
 */
export function endlessBody(chunkBytes = 1024): { body: ReadableStream<Uint8Array>; cancelled: () => boolean; reads: () => number } {
  let cancelled = false;
  let reads = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull: (controller) => {
        reads++;
        controller.enqueue(new Uint8Array(chunkBytes));
      },
      cancel: () => {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, cancelled: () => cancelled, reads: () => reads };
}

/** Sets (or, with `undefined`, unsets) an environment variable for the rest of test `t`. */
export function withEnv(t: TestContext, name: string, value: string | undefined): void {
  setEnv(name, value);
  t.after(() => setEnv(name, originalEnv[name]));
}

/** Sets `GEMINI_API_KEY` for the rest of test `t`, so `generate()` takes its Gemini route. */
export const withGeminiKey = (t: TestContext, value = "test") => withEnv(t, "GEMINI_API_KEY", value);
