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

/** Rows the `sources`/`posts` tables of a {@link fakeModelDb} answer with, offline. */
export type FakeIngestTables = {
  /** The row `sources`' `select().eq().single()` resolves to; omit to make it "not found". */
  source?: Record<string, unknown>;
  /** The row `posts`' `select().eq().maybeSingle()` resolves to; omit/null for "no existing post". */
  post?: Record<string, unknown> | null;
  /** Bare object names (no `<sourceId>/` prefix) the media bucket already holds for this source. */
  media?: string[];
  /** Rows `retryPendingSources`' pending-sources listing resolves to. */
  pending?: Record<string, unknown>[];
};

export type FakeIngestDb = SupabaseClient & {
  /** Every `model_settings` task queried, in call order — see the `fakeModelDb` doc comment. */
  tasks: string[];
  /** Every `sources` UPDATE payload, in call order (the attempts bump, then the final status write). */
  sourceUpdates: Record<string, unknown>[];
  /** Every `posts` UPSERT payload, in call order. */
  postUpserts: Record<string, unknown>[];
  /** Every media path passed to `storage.remove`, across all calls. */
  removedMedia: string[];
  /** Every write across every table/bucket above, in the single order it actually happened — for
   *  cross-table ordering assertions (e.g. "attempts is bumped before the post is upserted"). */
  writes: ("sources.update" | "posts.upsert" | "media.remove")[];
};

type PendingChain = {
  neq: (column: string, value: unknown) => PendingChain;
  lt: (column: string, value: unknown) => PendingChain;
  order: (column: string) => PendingChain;
  limit: (n: number) => Promise<{ data: Record<string, unknown>[]; error: null }>;
};

function pendingChain(rows: Record<string, unknown>[]): PendingChain {
  const chain: PendingChain = {
    neq: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: async (n) => ({ data: rows.slice(0, n), error: null }),
  };
  return chain;
}

/**
 * Offline `model_settings`, `sources`, `posts` and media-storage fake, for tests that exercise real
 * pipeline wiring (`processSource`, `retryPendingSources`) without a Supabase connection.
 * `model_settings`: `from().select().eq().maybeSingle()` resolves to a fixed `route`; `.tasks` records
 * every value queried via `.eq("task", value)`, so a test can assert which task (`ingest_video`,
 * `ingest_cleanup`, …) a call actually asked for, and how many times.
 * `sources`/`posts`/storage: fixed by `tables` (all optional — omit what a test never queries);
 * every write is both applied to the in-memory chain and recorded on `.sourceUpdates`/`.postUpserts`/`.removedMedia`.
 */
export function fakeModelDb(
  route: { provider: string; model: string } = { provider: "gemini", model: "m" },
  tables: FakeIngestTables = {},
): FakeIngestDb {
  const tasks: string[] = [];
  const sourceUpdates: Record<string, unknown>[] = [];
  const postUpserts: Record<string, unknown>[] = [];
  const removedMedia: string[] = [];
  const writes: FakeIngestDb["writes"] = [];

  const from = (table: string) => {
    if (table === "model_settings") {
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            if (column === "task") tasks.push(value);
            return { maybeSingle: async () => ({ data: route, error: null }) };
          },
        }),
      };
    }
    if (table === "sources") {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              tables.source ? { data: tables.source, error: null } : { data: null, error: new Error("source not found") },
          }),
          ...pendingChain(tables.pending ?? []),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            sourceUpdates.push(values);
            writes.push("sources.update");
            return { data: null, error: null };
          },
        }),
      };
    }
    if (table === "posts") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: tables.post ?? null, error: null }) }),
        }),
        upsert: async (values: Record<string, unknown>) => {
          postUpserts.push(values);
          writes.push("posts.upsert");
          return { data: null, error: null };
        },
      };
    }
    throw new Error(`fakeModelDb: table "${table}" not set up`);
  };

  const storage = {
    from: () => ({
      list: async () => ({ data: (tables.media ?? []).map((name) => ({ name })), error: null }),
      remove: async (paths: string[]) => {
        removedMedia.push(...paths);
        writes.push("media.remove");
        return { data: null, error: null };
      },
    }),
  };

  return { from, storage, tasks, sourceUpdates, postUpserts, removedMedia, writes } as unknown as FakeIngestDb;
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
