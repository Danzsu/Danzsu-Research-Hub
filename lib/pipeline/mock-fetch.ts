// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import { setDnsLookup } from "./fetch.ts";

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
 * extractor) resolves to `address` without a live query. Pair with `mockFetch` for the actual
 * response; call the returned function to restore.
 */
export function mockDns(address = "93.184.216.34"): () => void {
  return setDnsLookup(async () => [{ address }]);
}
