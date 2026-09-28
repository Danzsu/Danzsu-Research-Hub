import assert from "node:assert/strict";
import { test } from "node:test";
import { createReaderStore, memorySend } from "../../lib/reader-store.ts";
import { markItemRead } from "./use-model-context-tools.ts";

// mark_digest_item_read's execute logic, pulled into markItemRead so it can be tested without the DOM
// or an effect (app/components/shell.test.ts's static harness never runs one). The reader store is
// scoped to the page's own items, so an id off it (another week's, or a post:<id> key) must refuse the
// write rather than silently no-op and report success.

test("markItemRead refuses an id outside the page's items, and makes no write", async () => {
  const store = createReaderStore(memorySend(), () => {});
  const result = await markItemRead(store, ["a", "b"], { itemId: "c", value: true });
  assert.deepEqual(result, { itemId: "c", error: "not_on_this_page" });
  assert.equal(store.getSnapshot().states.c, undefined);
});

test("markItemRead writes and reports the value for an id on the page", async () => {
  const store = createReaderStore(memorySend(), () => {});
  const result = await markItemRead(store, ["a", "b"], { itemId: "a", value: true });
  assert.deepEqual(result, { itemId: "a", read: true });
  assert.equal(store.getSnapshot().states.a.read, true);
});
