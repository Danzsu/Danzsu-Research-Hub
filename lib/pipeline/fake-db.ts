// Test helper only (not *.test.ts, so `npm test`'s glob skips it as its own suite).

import type { SupabaseClient } from "@supabase/supabase-js";

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
  /** Forces `posts`' `update(...).eq(...)` to resolve with this error instead of applying the write. */
  postUpdateError?: unknown;
  /** Bare object names (no `<sourceId>/` prefix) the media bucket already holds for this source. */
  media?: string[];
  /** Rows `retryPendingSources`' pending-sources listing resolves to. */
  pending?: Record<string, unknown>[];
  /** Every `storage.from().list/upload/remove` call rejects, for testing failure-path cleanup. */
  storageError?: boolean;
  /** Forces every `db.rpc(...)` call to resolve with this error instead of succeeding — e.g. `{
   *  code: "42501" }` for the `update_post_overrides` "not the submitter" case. */
  rpcError?: { code?: string; message?: string };
  /** Rows any other table's `select().gte()` resolves to, by table name (runDaily's recent-items lookup). */
  rows?: Record<string, Record<string, unknown>[]>;
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
  /** Every `posts` UPDATE payload (the `values` passed to `.update(...)`, before `.eq(...)`/`.is(...)`), in call order. */
  postUpdates: Record<string, unknown>[];
  /** Every `posts` UPDATE's own filters (every `.eq(...)`/`.is(...)` chained onto that `.update(...)`,
   *  in the order they were chained, `op` recording which one), same order as `postUpdates` — so a
   *  test can check exactly what a write was scoped to (e.g. `.eq("id", 7).is("extracted_at", null)`)
   *  without depending on `eqCalls`' cross-table, cross-operation ordering. The two matter for more
   *  than logging: real PostgREST sends `eq.null` for `.eq(col, null)`, which Postgres rejects for a
   *  timestamp column, so a test asserting `op: "is"` for the null case is asserting real safety. */
  postUpdateFilters: { column: string; value: unknown; op: "eq" | "is" }[][];
  /** Every `.eq(column, value)` call against `sources`' `update` or either table's `select`, in call
   *  order. `posts`' `update` filters (which can also be `.is(...)`) are on `postUpdateFilters` instead. */
  eqCalls: { table: "sources" | "posts"; column: string; value: unknown }[];
  /** Every media path passed to `storage.remove`, across all calls. */
  removedMedia: string[];
  /** Every `db.rpc(name, args)` call, in call order. */
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  /** Every UPSERT into a table other than `posts` (issues, digest_items, github_top), in call order. */
  upserts: { table: string; values: unknown; options: Record<string, unknown> }[];
  /** Every `select().gte(column, value)` against a table other than `posts`/`sources`, in call order. */
  gteCalls: { table: string; column: string; value: unknown }[];
  /** Every write across every table/bucket above, plus any `"fetch"` entries a test's own mockFetch
   *  handler chooses to push (same array — `db.writes`), in the single order it actually happened.
   *  For cross-operation ordering assertions, e.g. "attempts is bumped before the first fetch". */
  writes: ("sources.update" | "posts.upsert" | "posts.update" | "storage.list" | "storage.upload" | "storage.remove" | "fetch")[];
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

/** Projects `row` down to `columns` (comma-separated, `"*"` for everything) the way PostgREST's
 *  `select=` does — a column the fixture never set comes back `undefined`, not silently present
 *  because some other part of the row happened to have it. A `table(column)` embed (e.g.
 *  `sources(submitted_by)`) isn't projected per-column — the fake just needs the fixture's own
 *  embedded object present under its table key, so it reads `row.sources` whole. */
function project(row: Record<string, unknown> | null, columns: string): Record<string, unknown> | null {
  if (!row) return null;
  if (columns.trim() === "*") return row;
  const keys = columns.split(",").map((column) => column.trim()).filter(Boolean);
  return Object.fromEntries(
    keys.map((key) => {
      const embed = /^(\w+)\(.*\)$/.exec(key);
      const name = embed ? embed[1] : key;
      return [name, row[name]];
    }),
  );
}

/**
 * Offline `model_settings`, `sources`, `posts` and media-storage fake, for tests that exercise real
 * pipeline wiring (`processSource`, `retryPendingSources`) without a Supabase connection.
 * `model_settings`: `from().select().eq().maybeSingle()` resolves to a fixed `route`; `.tasks` records
 * every value queried via `.eq("task", value)`, so a test can assert which task (`ingest_video`,
 * `ingest_cleanup`, …) a call actually asked for, and how many times.
 * `sources`/`posts`/storage: fixed by `tables` (all optional — omit what a test never queries).
 * Any other table only upserts (recorded on `.upserts`) and answers `select().gte()` from `tables.rows`.
 * Storage keeps its own in-memory object set, seeded from `tables.media`: `upload` adds to it and
 * `list` reflects it, so a test can mirror an image and then see it (or its absence) in a later list.
 * Every write is recorded on `.sourceUpdates`/`.postUpserts`/`.postUpsertOptions`/`.postUpdates`/`.postUpdateFilters`/`.eqCalls`/`.removedMedia`/`.writes`.
 */
export function fakeDb(
  route: { provider: string; model: string; fallback_provider?: string; fallback_model?: string } = { provider: "gemini", model: "m" },
  tables: FakeIngestTables = {},
): FakeIngestDb {
  const tasks: string[] = [];
  const sourceUpdates: Record<string, unknown>[] = [];
  const postUpserts: Record<string, unknown>[] = [];
  const postUpsertOptions: Record<string, unknown>[] = [];
  const postUpdates: Record<string, unknown>[] = [];
  const postUpdateFilters: FakeIngestDb["postUpdateFilters"] = [];
  const eqCalls: FakeIngestDb["eqCalls"] = [];
  const removedMedia: string[] = [];
  const writes: FakeIngestDb["writes"] = [];
  const rpcCalls: FakeIngestDb["rpcCalls"] = [];
  const upserts: FakeIngestDb["upserts"] = [];
  const gteCalls: FakeIngestDb["gteCalls"] = [];
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
        select: (columns = "*") => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push({ table: "posts", column, value });
            postSelectCalls++;
            const callNumber = postSelectCalls;
            return {
              maybeSingle: async () => {
                const errored = tables.postErrorOnCall !== undefined ? callNumber === tables.postErrorOnCall : Boolean(tables.postError);
                return errored
                  ? { data: null, error: tables.postError ?? new Error("posts lookup failed") }
                  : { data: project(tables.post ?? null, columns), error: null };
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
        // Merges into the existing row (real UPDATE only touches the given columns), unlike
        // `upsert` above which replaces it — so a caller that does a targeted single-column write
        // (e.g. `.update({ blocks_hu }).eq("id", id)`) doesn't lose the row's other fields here either.
        // Chainable (`.eq(...).eq(...)`, `.is(...)`) and awaitable with or without a trailing
        // `.select(...)` — like the real client, only `.select(...)` (or an explicit `Prefer:
        // return=representation`, which the real translatePost gets via `.select()`) reports which
        // rows matched; a bare `.update().eq()` reports `data: null` like a real minimal-return update.
        update: (values: Record<string, unknown>) => {
          const filters: FakeIngestDb["postUpdateFilters"][number] = [];
          const run = async (withRepresentation: boolean) => {
            postUpdates.push(values);
            postUpdateFilters.push(filters);
            writes.push("posts.update");
            if (tables.postUpdateError) return { data: null, error: tables.postUpdateError };
            const row = tables.post as Record<string, unknown> | null;
            const matched = row !== null && filters.every((f) => (row[f.column] ?? null) === f.value);
            if (matched) tables.post = { ...row, ...values };
            if (!withRepresentation) return { data: null, error: null };
            return { data: matched ? [{ id: row!.id }] : [], error: null };
          };
          const builder = {
            eq: (column: string, value: unknown) => {
              filters.push({ column, value, op: "eq" });
              return builder;
            },
            is: (column: string, value: unknown) => {
              filters.push({ column, value, op: "is" });
              return builder;
            },
            select: () => run(true),
            then: (onFulfilled: (result: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) =>
              run(false).then(onFulfilled, onRejected),
          };
          return builder;
        },
      };
    }
    return {
      upsert: async (values: unknown, options?: Record<string, unknown>) => {
        upserts.push({ table, values, options: options ?? {} });
        return { data: null, error: null };
      },
      select: () => ({
        gte: async (column: string, value: unknown) => {
          gteCalls.push({ table, column, value });
          return { data: tables.rows?.[table] ?? [], error: null };
        },
      }),
    };
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

  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ name, args });
    return tables.rpcError ? { data: null, error: tables.rpcError } : { data: null, error: null };
  };

  return {
    from,
    storage,
    rpc,
    tasks,
    sourceUpdates,
    postUpserts,
    postUpsertOptions,
    postUpdates,
    postUpdateFilters,
    eqCalls,
    removedMedia,
    writes,
    rpcCalls,
    upserts,
    gteCalls,
  } as unknown as FakeIngestDb;
}
