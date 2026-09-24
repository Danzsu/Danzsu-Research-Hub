// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

/** Replaces `globalThis.fetch` for the duration of a test; call the returned function to restore it. */
export function mockFetch(handler: (url: string) => Response | Promise<Response>): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => handler(String(url))) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}
