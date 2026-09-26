import assert from "node:assert/strict";
import { test } from "node:test";
import { retryPendingSources } from "./ingest.ts";
import { fakeDb, pgError } from "./fake-db.ts";
import { mockFetch, TEST_HOST } from "./mock-fetch.ts";

// Fix round 1: SQL's own null rule — `.neq("status", "done")` must not match a row whose status is
// null (null compares to UNKNOWN, never true, in eq/neq/lt alike). Not a real case (sources.status is
// never null in production) but a regression pin for fakeDb's own `passes()` null handling, exercised
// through retryPendingSources since that's the one caller whose filter chain reaches it.
test("fakeDb's select filters never match a row whose column is null (SQL null rules apply)", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, async (url) => {
    fetched.push(url);
    return new Response("", { status: 404 });
  });
  const source = { id: 40, url: `${TEST_HOST}/nullstatus`, kind: "article", note: null, attempts: 0, status: null };
  const db = fakeDb(undefined, { sources: [source], post: null, pending: [source] });
  assert.equal(await retryPendingSources(db), 0);
  assert.deepEqual(fetched, []);
});

// Kills: `order()` ignored (the listing comes back in fixture order), the sort after `limit`, and a
// listing that reads only `pending` (listMySources passes none, and would always get []).
test("a sources listing without `pending` reads the sources rows: filtered, ordered, then limited", async () => {
  const sources = [
    { id: 1, submitted_by: "owner", created_at: "2026-09-20T10:00:00Z" },
    { id: 2, submitted_by: "other", created_at: "2026-09-23T10:00:00Z" },
    { id: 3, submitted_by: "owner", created_at: "2026-09-22T10:00:00Z" },
    { id: 4, submitted_by: "owner", created_at: "2026-09-21T10:00:00Z" },
  ];
  const db = fakeDb(undefined, { sources });
  const { data } = await db.from("sources").select("id").eq("submitted_by", "owner").order("created_at", { ascending: false }).limit(2);
  assert.deepEqual(data?.map((row) => row.id), [3, 4]);
});

// Kills: maybeSingle() answering the first of several rows, or an error for none.
test("a sources maybeSingle() answers the one matching row, null for none, and PGRST116 for several", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 1, status: "failed" }, { id: 2, status: "failed" }] });
  assert.equal((await db.from("sources").select("id, status").eq("id", 2).maybeSingle()).data?.id, 2);
  assert.deepEqual(await db.from("sources").select("status").eq("id", 3).maybeSingle(), { data: null, error: null });
  assert.equal((await db.from("sources").select("status").eq("status", "failed").maybeSingle()).error?.code, "PGRST116");
});

// Kills: an update that ignores its filters (every row changes), or one that isn't written through —
// then a second compare-and-swap on the same status matches again, and one retry starts two runs.
test("a sources update changes only the rows its filters match, writes through, and .select() reports them", async () => {
  const tables = { sources: [{ id: 5, status: "failed" }, { id: 6, status: "failed" }] };
  const db = fakeDb(undefined, tables);
  const claim = () => db.from("sources").update({ status: "pending" }).eq("id", 5).eq("status", "failed").select("id");
  assert.deepEqual((await claim()).data, [{ id: 5 }]);
  assert.deepEqual((await claim()).data, []);
  assert.deepEqual(tables.sources.map((row) => row.status), ["pending", "failed"]);
  assert.deepEqual(db.sourceUpdates, [{ status: "pending" }, { status: "pending" }]);
});

// Fix round 1: the fake's `sources` select used to ignore its own column list — a query string
// (here, or in lib/my-sources.ts) could drop a column and every test would still pass. Now every
// answer is projected, one level into a `table(...)` embed too. Kills: the projection dropped
// entirely (both `url` and `overrides` would leak through), and the embed's own inner columns
// ignored (the naive `columns.split(",")` this replaced tore `posts(id, title)` apart on its own
// inner comma, which `posts(id, title, overrides)` — lib/my-sources.ts's real select — has one of).
test("a sources select projects both the top-level row and one level into a table(...) embed", async () => {
  const db = fakeDb(undefined, {
    sources: [
      {
        id: 1,
        url: "https://blog.test/1",
        posts: { id: 9, title: { hu: "Cím", en: "Title" }, overrides: { title: { hu: "S", en: "O" } } },
      },
    ],
  });
  const { data } = await db.from("sources").select("id, posts(id, title)").eq("id", 1).maybeSingle();
  assert.deepEqual(data, { id: 1, posts: { id: 9, title: { hu: "Cím", en: "Title" } } });
});

// Kills: sourceSelectError ignored by one of the three terminal calls.
test("sourceSelectError answers the listing, single() and maybeSingle() alike", async () => {
  const error = pgError("08006", "connection failure");
  const db = fakeDb(undefined, { sources: [{ id: 1 }], sourceSelectError: error });
  const results = [
    await db.from("sources").select("id").order("id").limit(10),
    await db.from("sources").select("id").eq("id", 1).single(),
    await db.from("sources").select("id").eq("id", 1).maybeSingle(),
  ];
  for (const result of results) assert.deepEqual(result, { data: null, error });
});

// Fix round 1: a `sources` update can fail too (e.g. retrySource's claim) — the row must stay
// untouched and the error must come back, but the attempted payload is still recorded, same as a
// real caller that logs what it tried. Kills sourceUpdateError being ignored, and the payload not
// being pushed to .sourceUpdates before the error check.
test("sourceUpdateError makes a sources update fail without touching the row, but still records the attempt", async () => {
  const tables = { sources: [{ id: 5, status: "failed" }], sourceUpdateError: pgError("08006", "connection failure") };
  const db = fakeDb(undefined, tables);
  const result = await db.from("sources").update({ status: "pending" }).eq("id", 5).select("id");
  assert.deepEqual(result, { data: null, error: tables.sourceUpdateError });
  assert.deepEqual(tables.sources, [{ id: 5, status: "failed" }]);
  assert.deepEqual(db.sourceUpdates, [{ status: "pending" }]);
});
