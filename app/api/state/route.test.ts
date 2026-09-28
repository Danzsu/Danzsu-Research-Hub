import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { GET, POST } = await import("./route.ts");

const write = (body: unknown) => POST(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify(body) }));

// X3: the read and the saved flag are two columns of one row; crossing them flips the reader's state.
test("POST /api/state writes set_read to is_read and set_saved to is_saved, each alone, on the reader's row", async () => {
  resetRoute();
  const db = fakeDb();
  routeStub.reader = signedIn(db);
  for (const body of [{ action: "set_read", itemId: "local-a", value: true }, { action: "set_saved", itemId: "local-a", value: false }]) {
    const response = await write(body);
    assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  }
  const rows = db.upserts.map(({ table, values, options }) => {
    const { updated_at, ...flags } = values as Record<string, unknown>;
    assert.equal(typeof updated_at, "string");
    return { table, flags, options };
  });
  assert.deepEqual(rows, [
    { table: "item_states", flags: { item_id: "local-a", is_read: true }, options: { onConflict: "user_id,item_id" } },
    { table: "item_states", flags: { item_id: "local-a", is_saved: false }, options: { onConflict: "user_id,item_id" } },
  ]);
});

// Spec 4. Kills the issue check dropped or loosened: the week id reaches the `like` pattern only
// once isoWeekMonday has accepted it.
test("GET /api/state answers 400 invalid_issue for a missing or malformed week, before any query", async () => {
  resetRoute();
  const db = fakeDb();
  routeStub.reader = signedIn(db);
  for (const query of ["", "?issue=", "?issue=2026-W54", "?issue=%25", "?issue=2026w39"]) {
    const response = await GET(new Request(`http://localhost/api/state${query}`));
    assert.deepEqual([response.status, await response.json()], [400, { error: "invalid_issue" }], query);
  }
  assert.deepEqual(db.queries, []);
});

// Spec 1.3. Kills `?issue=` ignored (every week's flags answered) or read from the wrong parameter.
test("GET /api/state answers the caller's flags on the named week's items, and every to-do", async () => {
  resetRoute();
  routeStub.reader = signedIn(
    fakeDb(undefined, {
      rows: {
        item_states: [
          { item_id: "research-2026w39-a-1a2b3c", is_read: true, is_saved: false },
          { item_id: "research-2026w38-b-4d5e6f", is_read: true, is_saved: false },
        ],
        todos: [{ id: 3, item_id: null, text: "Loose", is_done: false }],
      },
    }),
  );
  const response = await GET(new Request("http://localhost/api/state?issue=2026-W39"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    states: { "research-2026w39-a-1a2b3c": { read: true, saved: false } },
    todos: [{ id: 3, itemId: null, text: "Loose", done: false }],
  });
});

test("POST /api/state answers 401 when signed out", async () => {
  resetRoute();
  const response = await write({ action: "set_read", itemId: "local-a", value: true });
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});

test("GET /api/state answers 401 when signed out", async () => {
  resetRoute();
  const response = await GET(new Request("http://localhost/api/state?issue=2026-W39"));
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});

// Kills getReaderState's failure swallowed silently: a failed query must both surface as 500 and be
// logged exactly once (console.error is mocked, not left to print into the test's own output).
test("GET /api/state answers 500 db_error when the underlying query fails, and logs it once", async (t) => {
  resetRoute();
  const error = t.mock.method(console, "error", () => {});
  routeStub.reader = signedIn(fakeDb(undefined, { tableErrors: { item_states: pgError("08006", "connection failure") } }));
  const response = await GET(new Request("http://localhost/api/state?issue=2026-W39"));
  assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
  assert.equal(error.mock.calls.length, 1);
});
