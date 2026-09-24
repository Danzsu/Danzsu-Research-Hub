// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { TestContext } from "node:test";
import dns from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A public IP literal: `dns.lookup()` resolves it locally, no real DNS query, so `safeFetch` tests
 *  run offline just by using it as the host — no `mockDns(t)` needed. The one place this IP is spelled out. */
export const TEST_IP = "93.184.216.34";
export const TEST_HOST = `http://${TEST_IP}`;

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
export function mockDns(t: TestContext, address = TEST_IP): void {
  t.mock.method(dns, "lookup", async () => [{ address, family: 4 }]);
}

/** Extracts the text prompt from a captured Gemini `generateContent` request body — the first
 *  `parts` entry with a `text` field. Pair with `mockFetch`'s `init` to inspect what a test's
 *  handler actually asked the model, e.g. to route a cleanup vs. summarize call differently. */
export function geminiPrompt(init?: RequestInit): string {
  const body = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
  return body.contents[0].parts.find((part) => part.text)?.text ?? "";
}

/** Rows the `sources`/`posts` tables of a {@link fakeDb} answer with, offline. */
export type FakeIngestTables = {
  /** The row `sources`' `select().eq().single()` resolves to; omit to make it "not found". */
  source?: Record<string, unknown>;
  /** The row `posts`' `select().eq().maybeSingle()` resolves to; omit/null for "no existing post". */
  post?: Record<string, unknown> | null;
  /** Forces a `posts` lookup's `maybeSingle()` to resolve with this error instead of `post`. Applies
   *  to every lookup unless `postErrorOnCall` narrows it to just one of them. */
  postError?: unknown;
  /** Narrows `postError` to only the Nth `posts` select→maybeSingle() call (1-indexed, counting every
   *  `.from("posts").select(...).eq(...)`); every other call resolves normally. Needed to test code
   *  that reads `posts` more than once per run — e.g. the initial existing-post lookup succeeding,
   *  then a later re-read failing. */
  postErrorOnCall?: number;
  /** Bare object names (no `<sourceId>/` prefix) the media bucket already holds for this source. */
  media?: string[];
  /** Rows `retryPendingSources`' pending-sources listing resolves to. */
  pending?: Record<string, unknown>[];
  /** Every `storage.from().list/upload/remove` call rejects, for testing failure-path cleanup. */
  storageError?: boolean;
};

export type FakeIngestDb = SupabaseClient & {
  /** Every `model_settings` task queried, in call order — see the `fakeDb` doc comment. */
  tasks: string[];
  /** Every `sources` UPDATE payload, in call order (the attempts bump, then the final status write). */
  sourceUpdates: Record<string, unknown>[];
  /** Every `posts` UPSERT payload, in call order. */
  postUpserts: Record<string, unknown>[];
  /** Every `posts` UPSERT's second (options) argument, same order as `postUpserts`. */
  postUpsertOptions: Record<string, unknown>[];
  /** Every `.eq(column, value)` call against `sources`/`posts`, in call order. */
  eqCalls: { table: "sources" | "posts"; column: string; value: unknown }[];
  /** Every media path passed to `storage.remove`, across all calls. */
  removedMedia: string[];
  /** Every write across every table/bucket above, plus any `"fetch"` entries a test's own mockFetch
   *  handler chooses to push (same array — `db.writes`), in the single order it actually happened.
   *  For cross-operation ordering assertions, e.g. "attempts is bumped before the first fetch". */
  writes: ("sources.update" | "posts.upsert" | "storage.list" | "storage.upload" | "storage.remove" | "fetch")[];
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

/** A storage path's bare object name: whatever follows the first `/` (the `<sourceId>/` prefix real
 *  Supabase storage strips when listing a folder), or the whole path if there's no prefix to strip. */
const bareObjectName = (path: string) => (path.includes("/") ? path.slice(path.indexOf("/") + 1) : path);

/**
 * Offline `model_settings`, `sources`, `posts` and media-storage fake, for tests that exercise real
 * pipeline wiring (`processSource`, `retryPendingSources`) without a Supabase connection.
 * `model_settings`: `from().select().eq().maybeSingle()` resolves to a fixed `route`; `.tasks` records
 * every value queried via `.eq("task", value)`, so a test can assert which task (`ingest_video`,
 * `ingest_cleanup`, …) a call actually asked for, and how many times.
 * `sources`/`posts`/storage: fixed by `tables` (all optional — omit what a test never queries).
 * Storage keeps its own in-memory object set, seeded from `tables.media`: `upload` adds to it and
 * `list` reflects it, so a test can mirror an image and then see it (or its absence) in a later list.
 * Every write is recorded on `.sourceUpdates`/`.postUpserts`/`.postUpsertOptions`/`.eqCalls`/`.removedMedia`/`.writes`.
 */
export function fakeDb(
  route: { provider: string; model: string } = { provider: "gemini", model: "m" },
  tables: FakeIngestTables = {},
): FakeIngestDb {
  const tasks: string[] = [];
  const sourceUpdates: Record<string, unknown>[] = [];
  const postUpserts: Record<string, unknown>[] = [];
  const postUpsertOptions: Record<string, unknown>[] = [];
  const eqCalls: FakeIngestDb["eqCalls"] = [];
  const removedMedia: string[] = [];
  const writes: FakeIngestDb["writes"] = [];
  const objects = new Set(tables.media ?? []);
  let postSelectCalls = 0;

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
          eq: (column: string, value: unknown) => {
            eqCalls.push({ table: "sources", column, value });
            return {
              single: async () =>
                tables.source ? { data: tables.source, error: null } : { data: null, error: new Error("source not found") },
            };
          },
          ...pendingChain(tables.pending ?? []),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async (column: string, value: unknown) => {
            eqCalls.push({ table: "sources", column, value });
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
          eq: (column: string, value: unknown) => {
            eqCalls.push({ table: "posts", column, value });
            postSelectCalls++;
            const callNumber = postSelectCalls;
            return {
              maybeSingle: async () => {
                const errored = tables.postErrorOnCall !== undefined ? callNumber === tables.postErrorOnCall : Boolean(tables.postError);
                return errored ? { data: null, error: tables.postError ?? new Error("posts lookup failed") } : { data: tables.post ?? null, error: null };
              },
            };
          },
        }),
        // Write-through: a later `posts` lookup (e.g. a failure-path re-read) sees this row, so a
        // test can simulate a concurrent run's own successful upsert with a real call instead of
        // reaching into the fake's internals to mutate a row object directly.
        upsert: async (values: Record<string, unknown>, options?: Record<string, unknown>) => {
          postUpserts.push(values);
          postUpsertOptions.push(options ?? {});
          writes.push("posts.upsert");
          tables.post = values;
          return { data: null, error: null };
        },
      };
    }
    throw new Error(`fakeDb: table "${table}" not set up`);
  };

  const storage = {
    from: () => ({
      // `writes` records the attempt before the storageError check in all three: a caller that
      // swallows this failure (e.g. skips cleanup once the post is already saved) should still be
      // distinguishable, by call count, from one that let the attempt through and it just failed.
      list: async () => {
        writes.push("storage.list");
        if (tables.storageError) throw new Error("storage down");
        return { data: [...objects].map((name) => ({ name })), error: null };
      },
      upload: async (path: string) => {
        writes.push("storage.upload");
        if (tables.storageError) throw new Error("storage down");
        objects.add(bareObjectName(path));
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        writes.push("storage.remove");
        if (tables.storageError) throw new Error("storage down");
        for (const path of paths) objects.delete(bareObjectName(path));
        removedMedia.push(...paths);
        return { data: null, error: null };
      },
    }),
  };

  return { from, storage, tasks, sourceUpdates, postUpserts, postUpsertOptions, eqCalls, removedMedia, writes } as unknown as FakeIngestDb;
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
