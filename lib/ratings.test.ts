import assert from "node:assert/strict";
import { test } from "node:test";
import { createRatingStore, downLast, nextRating, radarTargets, ratingFilter, ratingKey, ratingTargetId, type RatingWrite } from "./ratings.ts";

// Review Focus 1. Kills a repo keyed by its casing (the Top 10's "Owner/Repo" and the tab's "owner/repo"
// would hold two ratings), and an item or post id lowercased (they are case-sensitive keys).
test("a repo is rated by its lowercase name; items and posts keep their id", () => {
  assert.equal(ratingKey({ kind: "repo", id: "Owner/Repo" }), "repo:owner/repo");
  assert.equal(ratingTargetId({ kind: "repo", id: "Owner/Repo" }), "owner/repo");
  assert.equal(ratingKey({ kind: "item", id: "local-2026w39-Abc" }), "item:local-2026w39-Abc");
  assert.equal(ratingKey({ kind: "post", id: "12" }), "post:12");
});

// B spec 2.1. Kills a second press that keeps the value instead of clearing it.
test("pressing the active value clears it; another value replaces it", () => {
  assert.equal(nextRating(2, 2), null);
  assert.equal(nextRating(1, 2), 2);
  assert.equal(nextRating(null, -1), -1);
});

// G1 spec 3, deviation 2. Kills a sort that reorders the rest, or drops the disliked ones.
test("downLast moves the disliked entries to the end and keeps every other order", () => {
  assert.deepEqual(downLast([1, 2, 3, 4, 5], (n) => n % 2 === 0), [1, 3, 5, 2, 4]);
});

// Review Focus 3. Kills a lookup that walks the prototype: "?rating=toString" must not become a filter.
test("ratingFilter takes only the four known filters", () => {
  assert.deepEqual(["heart", "up", "down", "none"].map(ratingFilter), ["heart", "up", "down", "none"]);
  for (const param of [undefined, "", "toString", "__proto__", "HEART", "2"]) assert.equal(ratingFilter(param), undefined, String(param));
});

test("radarTargets rates the week's items and repos", () => {
  assert.deepEqual(radarTargets([{ id: "a" }], [{ repo: "O/R" }]), [{ kind: "item", id: "a" }, { kind: "repo", id: "O/R" }]);
});

/** A sender whose answers the test releases one by one, in any order. */
function heldSend() {
  const writes: { write: RatingWrite; resolve: () => void; reject: () => void }[] = [];
  const send = (write: RatingWrite) => new Promise<void>((resolve, reject) => writes.push({ write, resolve, reject: () => reject(new Error("offline")) }));
  return { send, writes };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

// G1 spec 3. Kills a press that waits for the server, a write with the repo's casing, and a store that
// forgets this tab's value (Back would show the render's).
test("a press shows at once, sends the lowercase repo id, and this tab's value wins over the render's", async () => {
  const { send, writes } = heldSend();
  const store = createRatingStore(send, () => {});
  const target = { kind: "repo", id: "Owner/Repo" } as const;
  const done = store.press(target, null, 2);
  assert.equal(store.valueOf("repo:owner/repo", null), 2);
  assert.equal(store.valueOf("repo:owner/repo", 1), 2, "the tab's value, not the cached render's");
  await flush();
  assert.deepEqual(writes.map((w) => w.write), [{ action: "set_rating", kind: "repo", id: "owner/repo", value: 2 }]);
  writes[0].resolve();
  await done;
  assert.equal(store.valueOf("item:other", -1), -1, "an untouched target shows the render's value");
});

// Review Focus 2. Kills writes sent side by side (the server could apply the clear first), and a store
// that rolls back to the render's value after the newest write succeeded.
test("two quick presses write in click order, and the second press clears", async () => {
  const { send, writes } = heldSend();
  const store = createRatingStore(send, () => {});
  const target = { kind: "item", id: "a" } as const;
  const first = store.press(target, null, 2);
  const second = store.press(target, null, 2);
  assert.equal(store.valueOf("item:a", null), null);
  await flush();
  assert.equal(writes.length, 1, "the second write waits for the first");
  writes[0].resolve();
  await first;
  await flush();
  assert.deepEqual(writes.map((w) => w.write.value), [2, null]);
  writes[1].resolve();
  await second;
  assert.equal(store.valueOf("item:a", null), null);
});

// Kills a failure that keeps the optimistic value, one that rolls back to the render's value instead of
// the last confirmed one, a rollback by an older write while a newer one is still on its way, and a
// failure that says nothing.
test("the newest failed write falls back to the last confirmed value, and every failure is reported", async () => {
  const { send, writes } = heldSend();
  let errors = 0;
  const store = createRatingStore(send, () => errors++);
  const target = { kind: "post", id: "7" } as const;
  const confirmed = store.press(target, null, 1);
  await flush();
  writes[0].resolve();
  await confirmed;
  const older = store.press(target, null, 2);
  const newer = store.press(target, null, -1);
  await flush();
  writes[1].reject();
  await older;
  assert.equal(store.valueOf("post:7", null), -1, "an older failure leaves the newer press shown");
  await flush();
  writes[2].reject();
  await newer;
  assert.equal(store.valueOf("post:7", null), 1, "back to the last value the server confirmed");
  assert.equal(errors, 2);
});
