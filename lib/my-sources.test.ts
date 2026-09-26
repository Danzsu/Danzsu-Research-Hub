import assert from "node:assert/strict";
import { test } from "node:test";
import { listMySources, MINE_LIMIT } from "./my-sources.ts";
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
// newest), and a limit other than MINE_LIMIT.
test("listMySources answers the viewer's own latest MINE_LIMIT sources, newest first", async () => {
  const own = Array.from({ length: 12 }, (_, index) => row(index + 1));
  const db = fakeDb(undefined, { sources: [...own, row(19, { submitted_by: "other" })] });
  const sources = await listMySources(db, "owner");
  assert.equal(MINE_LIMIT, 10);
  assert.deepEqual(sources?.map((source) => source.id), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
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
test("listMySources answers null when the query fails", async () => {
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await listMySources(db, "owner"), null);
});
