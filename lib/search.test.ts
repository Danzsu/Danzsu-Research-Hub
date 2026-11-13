import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";
import { normalizeQuery, SEARCH_MAX_LENGTH, searchAll } from "./search.ts";

const row = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, id: 1, title: "T", snippet: "S", href: "/x", url: null, meta: "M", rank: 1, ...extra });

// Kills a query sent as typed: stray whitespace and an unbounded length reached the database.
test("normalizeQuery collapses whitespace, trims and caps the length, and answers '' for a non-string", () => {
  assert.equal(normalizeQuery("  kv   cache \n reuse "), "kv cache reuse");
  assert.equal(normalizeQuery("x".repeat(500)).length, SEARCH_MAX_LENGTH);
  assert.equal(normalizeQuery(undefined), "");
  assert.equal(normalizeQuery(["a"]), "");
});

// Kills a one-letter query reaching the database (it would match nearly every row), and the limit dropped.
test("searchAll asks search_all with the tidied query and the limit, and skips queries under two characters", async () => {
  const db = fakeDb(undefined, { rpcData: [] });
  assert.deepEqual(await searchAll(db, " a "), []);
  assert.deepEqual(db.rpcCalls, []);
  await searchAll(db, "  KV   cache ", 8);
  assert.deepEqual(db.rpcCalls, [{ name: "search_all", args: { q: "KV cache", lim: 8 } }]);
});

// Kills rows of an unknown kind reaching a page that has no icon for them, and a missing url answered as "null" text.
test("searchAll maps the rows and drops a kind it doesn't know", async () => {
  const db = fakeDb(undefined, { rpcData: [row("item", { id: "i1", url: "https://a.com/1" }), row("mystery"), row("post", { id: 7 })] });
  const hits = await searchAll(db, "cache");
  assert.deepEqual(hits.map((hit) => [hit.kind, hit.id, hit.url]), [["item", "i1", "https://a.com/1"], ["post", "7", null]]);
});

// Kills a failed query shown as "no matches".
test("searchAll throws on a failed query, with the PostgREST error as the cause", async () => {
  const error = pgError("08006", "down");
  await assert.rejects(searchAll(fakeDb(undefined, { rpcError: error }), "cache"), (e: unknown) => e instanceof Error && e.cause === error && /search query failed/.test(e.message));
});
