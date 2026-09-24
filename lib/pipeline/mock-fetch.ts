// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { TestContext } from "node:test";
import dns from "node:dns/promises";

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
