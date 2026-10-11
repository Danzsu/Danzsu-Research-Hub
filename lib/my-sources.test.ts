import assert from "node:assert/strict";
import { test } from "node:test";
import { duplicateSource, listMySources, readHerePosts, retrySource } from "./my-sources.ts";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";
import { MINE_LIMIT } from "./pipeline/util.ts";

/** A `sources` row as the listing selects it, submitted by "owner" on 2026-09-(10 + id). */
const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status: "done",
  error: null,
  note: null,
  submitted_by: "owner",
  created_at: `2026-09-${10 + id}T08:00:00Z`,
  posts: null,
  ...overrides,
});

// Review Focus 3. Kills: the `submitted_by` filter dropped (RLS lets every reader select every source,
// so another reader's links reach the thread), `ascending: true` (the 10 oldest instead of the 10
// newest), and a limit other than MINE_LIMIT. Fix round 1: ids 3 and 10 have swapped `created_at`
// values, so the id order and the created_at order disagree on where they fall — this also kills
// `.order("created_at", …)` narrowed to `.order("id", …)`, which the previous all-monotonic fixture
// couldn't catch (both columns happened to rank every row the same way).
test("listMySources answers the viewer's own latest MINE_LIMIT sources, newest first", async () => {
  const own = Array.from({ length: 12 }, (_, index) => {
    const id = index + 1;
    if (id === 3) return row(id, { created_at: "2026-09-20T08:00:00Z" }); // row(10)'s default created_at
    if (id === 10) return row(id, { created_at: "2026-09-13T08:00:00Z" }); // row(3)'s default created_at
    return row(id);
  });
  const db = fakeDb(undefined, { sources: [...own, row(19, { submitted_by: "other" })] });
  const sources = await listMySources(db, "owner");
  assert.equal(MINE_LIMIT, 10);
  assert.deepEqual(sources?.map((source) => source.id), [12, 11, 3, 9, 8, 7, 6, 5, 4, 10]);
});

// Kills: the model's title shown over the submitter's override (the thread and the post page would
// disagree), a post-less source reported with a post, and a column read under the wrong name.
test("listMySources maps each row to the thread's shape, the submitter's title override winning", async () => {
  const db = fakeDb(undefined, {
    sources: [
      row(1, { kind: "arxiv", status: "pending", note: "A módszertan" }),
      row(2, { posts: { id: 9, title: { hu: "Modell", en: "Model" }, overrides: { title: { hu: "Saját", en: "Own" } } } }),
      row(3, { status: "failed", error: "fetch 404" }),
    ],
  });
  assert.deepEqual(await listMySources(db, "owner"), [
    { id: 3, url: "https://blog.test/3", kind: "article", status: "failed", error: "fetch 404", note: null, createdAt: "2026-09-13T08:00:00Z", post: null },
    { id: 2, url: "https://blog.test/2", kind: "article", status: "done", error: null, note: null, createdAt: "2026-09-12T08:00:00Z", post: { id: 9, title: { hu: "Saját", en: "Own" } } },
    { id: 1, url: "https://blog.test/1", kind: "arxiv", status: "pending", error: null, note: "A módszertan", createdAt: "2026-09-11T08:00:00Z", post: null },
  ]);
});

// Kills: a failed query reported as an empty thread; the chat must say it can't reach the list.
// Fix round 1: mocks console.error rather than letting it print, and proves it fired exactly once
// (kills the log call itself being dropped, not just the null answer).
test("listMySources answers null when the query fails", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await listMySources(db, "owner"), null);
  assert.equal(error.mock.calls.length, 1);
});

// Kills: the post id read off the wrong embed shape, or the id and status the route acts on dropped.
test("duplicateSource answers the source's id and status, and its post's id when it has one", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", status: "done", attempts: 1, posts: { id: 9 } }] });
  assert.deepEqual(await duplicateSource(db, "https://blog.test/post"), { id: 4, status: "done", attempts: 1, postId: 9 });
});

// Kills: a source with no post yet answered as if it had one (a postId key of undefined or null counts).
test("duplicateSource leaves postId out when the duplicate link has no post yet", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", status: "pending", posts: null }] });
  const found = await duplicateSource(db, "https://blog.test/post");
  assert.deepEqual(found, { id: 4, status: "pending", attempts: 0 });
  assert.ok(found && !("postId" in found));
});

// Kills: a lookup failure left unlogged, or thrown instead of answered: the 409 the caller already
// decided on must still go out, just plain.
test("duplicateSource answers undefined and logs once when the lookup itself fails", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await duplicateSource(db, "https://blog.test/post"), undefined);
  assert.equal(warn.mock.calls.length, 1);
});

/** Source 5 as the reader reads it (RLS select) and as the admin client claims it (the CAS), plus
 *  source 6, the viewer's other failed one, which a retry of 5 must leave alone. */
function retryDbs(asRead: Record<string, unknown>, asClaimed: Record<string, unknown> = asRead) {
  const tables = { sources: [{ id: 5, ...asClaimed }, { id: 6, submitted_by: "owner", status: "failed" }] };
  return { db: fakeDb(undefined, { sources: [{ id: 5, ...asRead }] }), admin: fakeDb(undefined, tables), tables };
}

// Kills a claim that writes the wrong values (the old error stays on the row, or the attempts aren't
// reset: a retry killed at 300 s would then stay pending at 3+ attempts, which the daily cron never
// picks up), and one not keyed on the id (source 6 would be sent back too).
test("retrySource sends the viewer's failed source, and only it, back to pending with no error and its attempts reset", async () => {
  const { db, admin, tables } = retryDbs({ submitted_by: "owner", status: "failed", error: "fetch 404", attempts: 3 });
  assert.equal(await retrySource(db, admin, "owner", 5), "accepted");
  assert.deepEqual(tables.sources, [
    { id: 5, submitted_by: "owner", status: "pending", error: null, attempts: 0 },
    { id: 6, submitted_by: "owner", status: "failed" },
  ]);
});

// Kills the read's owner check, its status check, and a read keyed on anything but the id.
test("retrySource refuses another reader's source, one that isn't failed, and a missing one, writing nothing", async () => {
  const cases = [
    [{ submitted_by: "other", status: "failed" }, 5, "forbidden"],
    [{ submitted_by: "owner", status: "done" }, 5, "not_failed"],
    [{ submitted_by: "owner", status: "failed" }, 6, "not_found"],
  ] as const;
  for (const [asRead, sourceId, expected] of cases) {
    const { db, admin } = retryDbs(asRead);
    assert.equal(await retrySource(db, admin, "owner", sourceId), expected);
    assert.deepEqual(admin.sourceUpdates, [], expected);
  }
});

// The spec's rule: the checks are in the CAS too, not only in the read. The read passes both; the
// row the admin client finds is someone else's, then no longer failed. Kills the CAS's
// `.eq("submitted_by", …)` and its `.eq("status", "failed")`, each on its own.
test("retrySource's compare-and-swap repeats the owner and the status check: a row that changed since the read stays as it is", async () => {
  for (const asClaimed of [{ submitted_by: "other", status: "failed" }, { submitted_by: "owner", status: "pending" }]) {
    const { db, admin, tables } = retryDbs({ submitted_by: "owner", status: "failed" }, asClaimed);
    assert.equal(await retrySource(db, admin, "owner", 5), "not_failed");
    assert.deepEqual(tables.sources[0], { id: 5, ...asClaimed });
  }
});

// Kills a read error taken for "not found" (the route would answer 404 instead of 500), and a
// dropped console.error (a DB failure must leave a trace, not vanish silently).
test("retrySource answers failed and logs once when the read fails", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await retrySource(db, fakeDb(), "owner", 5), "failed");
  assert.equal(error.mock.calls.length, 1);
});

// Fix round 1. Kills `if (claimError) return "failed";` being dropped — every other test still
// passes without it, because the fake's own update never errors on its own; a claim failure must not
// read as "not_failed" (the chat would just refresh and hide a real DB outage). Also kills a dropped
// console.error on this branch.
test("retrySource answers failed and logs once when the claim fails, leaving the row alone", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const db = fakeDb(undefined, { sources: [{ id: 5, submitted_by: "owner", status: "failed" }] });
  const tables = { sources: [{ id: 5, submitted_by: "owner", status: "failed" }], sourceUpdateError: pgError("08006", "connection failure") };
  const admin = fakeDb(undefined, tables);
  assert.equal(await retrySource(db, admin, "owner", 5), "failed");
  assert.deepEqual(tables.sources, [{ id: 5, submitted_by: "owner", status: "failed" }]);
  assert.equal(error.mock.calls.length, 1);
});

// Spec 1, Review Focus 4. Kills a lookup by the raw item URL (a #fragment or an upper-case host misses
// the normalized row the mirror and a submission store), a post given to the wrong item, a source with
// no post given one, and a URL a submission refuses looked up at all.
test("readHerePosts maps each item to the post made from its normalized URL, and leaves the rest out", async () => {
  const db = fakeDb(undefined, {
    sources: [
      { id: 1, url: "https://blog.test/a", posts: { id: 11 } },
      { id: 2, url: "https://blog.test/queued", posts: null },
    ],
  });
  const posts = await readHerePosts(db, [
    { id: "local-2026w40-a-1", url: "https://BLOG.test/a#section" },
    { id: "local-2026w40-queued-2", url: "https://blog.test/queued" },
    { id: "local-2026w40-new-3", url: "https://blog.test/new" },
    { id: "local-2026w40-private-4", url: "http://10.0.0.1/x" },
  ]);
  assert.deepEqual(posts, { "local-2026w40-a-1": 11 });
});

// Kills the lookup cut to its first chunk: a busy week's 31st story would never find its post.
test("readHerePosts looks up every chunk of a long week", async () => {
  const urls = Array.from({ length: 31 }, (_, index) => `https://blog.test/${index}`);
  const db = fakeDb(undefined, { sources: urls.map((url, index) => ({ id: index + 1, url, posts: { id: 100 + index } })) });
  const posts = await readHerePosts(db, urls.map((url, index) => ({ id: `item-${index}`, url })));
  assert.equal(Object.keys(posts).length, 31);
  assert.equal(posts["item-30"], 130);
});

// Review Focus 5. Kills a lookup failure thrown (the Radar page would error) or swallowed without a log.
test("readHerePosts answers {} and logs once when the lookup fails, so the cards offer the chat instead", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.deepEqual(await readHerePosts(db, [{ id: "a", url: "https://blog.test/a" }]), {});
  assert.equal(warn.mock.callCount(), 1);
});
