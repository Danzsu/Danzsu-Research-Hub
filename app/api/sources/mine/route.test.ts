import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError, type FakeIngestTables } from "../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

function readerWith(tables: FakeIngestTables) {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, tables), "owner");
}

const source = (id: number, submittedBy: string) => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status: "pending",
  error: null,
  note: null,
  submitted_by: submittedBy,
  created_at: `2026-09-2${id}T08:00:00Z`,
  posts: null,
});

// Review Focus 3, at the route. Kills `reader.viewer.id` → `reader.viewer.email`: the filter would
// match nobody's rows (or, unfiltered, everybody's).
test("GET /api/sources/mine answers the caller's own sources only", async () => {
  readerWith({ sources: [source(1, "owner"), source(2, "other")] });
  const response = await GET();
  const body = (await response.json()) as { sources: { id: number }[] };
  assert.equal(response.status, 200);
  assert.deepEqual(body.sources.map(({ id }) => id), [1]);
});

// Kills a failed query answered as 200 with an empty thread.
test("GET /api/sources/mine answers 500 db_error when the query fails", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  readerWith({ sourceSelectError: pgError("08006", "connection failure") });
  const response = await GET();
  assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
  assert.equal(error.mock.calls.length, 1);
});

test("GET /api/sources/mine answers 401 when signed out", async () => {
  resetRoute();
  const response = await GET();
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
