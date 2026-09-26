import assert from "node:assert/strict";
import { test } from "node:test";
import { existingPostId, listMySources, MINE_LIMIT } from "./my-sources.ts";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";

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

// Kills: the post id read off the wrong embed shape, or a truthy post answered as if there were none.
test("existingPostId answers the post's id when the duplicate link already has one", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", posts: { id: 9 } }] });
  assert.equal(await existingPostId(db, "https://blog.test/post"), 9);
});

// Kills: a source with no post yet answered as if it had one.
test("existingPostId answers undefined when the duplicate link has no post yet", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", posts: null }] });
  assert.equal(await existingPostId(db, "https://blog.test/post"), undefined);
});

// Kills: a lookup failure left unlogged, or thrown instead of answered — the 409 the caller already
// decided on must still go out, just without a postId.
test("existingPostId answers undefined and logs once when the lookup itself fails", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await existingPostId(db, "https://blog.test/post"), undefined);
  assert.equal(warn.mock.calls.length, 1);
});
