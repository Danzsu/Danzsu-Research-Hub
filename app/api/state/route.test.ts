import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

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

test("POST /api/state answers 401 when signed out", async () => {
  resetRoute();
  const response = await write({ action: "set_read", itemId: "local-a", value: true });
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
