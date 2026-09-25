import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReaderStore,
  memorySend,
  postStateKey,
  readPostIds,
  type ReaderData,
  type SendState,
  type StateWrite,
  type Todo,
} from "./reader-store.ts";

const empty: ReaderData = { states: {}, todos: [] };
const todo = (id: number): Todo => ({ id, itemId: null, text: `t${id}`, done: false });
const noop = () => {};
/** What fetch does with no network: it rejects with a TypeError instead of answering !ok. */
const offline: SendState = async () => {
  throw new TypeError("Failed to fetch");
};
/** Lets every pending promise callback run. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

function recording() {
  const sent: StateWrite[] = [];
  const send: SendState = async (write) => {
    sent.push(write);
    return write.action === "add_todo" ? { id: 100 + sent.length } : {};
  };
  return { sent, send };
}

/** A send the test settles call by call, to see the order and the in-flight state. */
function manual() {
  const calls: { write: StateWrite; resolve: (value: { id?: number }) => void; reject: (error: Error) => void }[] = [];
  const send: SendState = (write) =>
    new Promise((resolve, reject) => {
      calls.push({ write, resolve, reject });
    });
  return { calls, send };
}

test("setting a flag to its current value sends nothing", async () => {
  const { sent, send } = recording();
  const store = createReaderStore(send, noop, empty);
  assert.equal(store.setFlag("a", "read", true), true);
  assert.equal(store.setFlag("a", "read", true), false, "a second Open click changes nothing");
  await store.settled();
  assert.deepEqual(sent, [{ action: "set_read", itemId: "a", value: true }]);
});

test("an offline write rolls back and reports the error once", async () => {
  let errors = 0;
  const store = createReaderStore(offline, () => errors++, empty);
  store.setFlag("a", "saved", true);
  assert.equal(store.getSnapshot().states.a.saved, true, "shown before the server answers");
  await store.settled();
  assert.equal(store.getSnapshot().states.a.saved, false);
  assert.equal(errors, 1);
});

test("a quick double toggle reaches the server in click order", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop, empty);
  store.toggleFlag("a", "saved");
  store.toggleFlag("a", "saved");
  await tick();
  assert.equal(calls.length, 1, "the second write waits for the first");
  calls[0].resolve({});
  await tick();
  assert.deepEqual(
    calls.map((call) => call.write),
    [
      { action: "set_saved", itemId: "a", value: true },
      { action: "set_saved", itemId: "a", value: false },
    ],
  );
  calls[1].resolve({});
  await store.settled();
  assert.equal(store.getSnapshot().states.a.saved, false);
});

test("when the newest of several writes fails, the flag shows what the server last confirmed", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop, empty);
  store.toggleFlag("a", "read"); // true
  store.toggleFlag("a", "read"); // false
  store.toggleFlag("a", "read"); // true
  await tick();
  calls[0].resolve({}); // the server now has read = true
  await tick();
  calls[1].reject(new TypeError("Failed to fetch"));
  await tick();
  calls[2].reject(new TypeError("Failed to fetch"));
  await store.settled();
  // Undoing each failure in turn would end on false; the server says true.
  assert.equal(store.getSnapshot().states.a.read, true);
});

test("an added to-do shows at once and takes the server's id; a failed one disappears", async () => {
  let errors = 0;
  const send: SendState = async (write) => {
    if (write.action === "add_todo" && write.text === "boom") throw new TypeError("Failed to fetch");
    return { id: 7 };
  };
  const store = createReaderStore(send, () => errors++, empty);
  store.addTodo("  read the paper  ");
  store.addTodo("boom");
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.text), ["boom", "read the paper"]);
  assert.ok(store.getSnapshot().todos.every((item) => item.id < 0), "pending until the server answers");
  await store.settled();
  assert.deepEqual(store.getSnapshot().todos, [{ id: 7, itemId: null, text: "read the paper", done: false }]);
  assert.equal(errors, 1);
});

test("a second to-do for the same item is refused", () => {
  const store = createReaderStore(memorySend(), noop, empty);
  assert.equal(store.addTodo("Title", "item-1"), true);
  assert.equal(store.addTodo("Title", "item-1"), false);
  assert.equal(store.getSnapshot().todos.length, 1);
});

test("to-do text is trimmed and capped like the API; blank text is refused", () => {
  const store = createReaderStore(memorySend(), noop, empty);
  assert.equal(store.addTodo("   "), false);
  store.addTodo("x".repeat(500));
  assert.equal(store.getSnapshot().todos[0].text.length, 180);
});

test("a to-do still being created cannot be ticked or deleted", () => {
  const store = createReaderStore(manual().send, noop, empty);
  store.addTodo("pending");
  const [{ id }] = store.getSnapshot().todos;
  assert.equal(store.setTodoDone(id, true), false);
  assert.equal(store.removeTodo(id), null);
});

test("delete hides at once, sends nothing until commit, and undo puts it back in place", async () => {
  const { sent, send } = recording();
  const store = createReaderStore(send, noop, { states: {}, todos: [todo(1), todo(2), todo(3)] });
  const removal = store.removeTodo(2);
  assert.ok(removal);
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 3]);
  removal.undo();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 2, 3]);
  await store.settled();
  assert.deepEqual(sent, []);
});

test("a committed delete that fails offline brings the to-do back", async () => {
  let errors = 0;
  const store = createReaderStore(offline, () => errors++, { states: {}, todos: [todo(1), todo(2)] });
  store.removeTodo(1)?.commit();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [2]);
  await store.settled();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 2]);
  assert.equal(errors, 1);
});

test("the first load keeps what the reader changed meanwhile", async () => {
  const store = createReaderStore(memorySend(), noop);
  assert.equal(store.getSnapshot().syncing, true);
  store.setFlag("a", "read", true); // clicked before GET /api/state answered
  store.addTodo("early");
  await store.settled();
  store.hydrate({ states: { a: { read: false, saved: true }, b: { read: true, saved: false } }, todos: [todo(9)] });
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.states.a, { read: true, saved: true }, "the local read wins, the server's saved stays");
  assert.deepEqual(snapshot.states.b, { read: true, saved: false });
  assert.deepEqual(snapshot.todos.map((item) => item.text), ["early", "t9"]);
  assert.equal(snapshot.syncing, false);
});

test("marking read after the load leaves loadedStates alone", () => {
  const store = createReaderStore(memorySend(), noop, { states: { a: { read: false, saved: false } }, todos: [] });
  store.setFlag("a", "read", true);
  assert.equal(store.getSnapshot().states.a.read, true);
  assert.equal(store.getSnapshot().loadedStates.a.read, false, "the feed keeps sorting by this, so the card stays put");
});

test("a seeded store's revalidation refreshes flags and to-dos but keeps sorting by the seed", async () => {
  const seed: ReaderData = { states: { a: { read: false, saved: false } }, todos: [todo(1), todo(2), todo(3)] };
  const store = createReaderStore(memorySend(), noop, seed, true);
  assert.equal(store.getSnapshot().syncing, true, "the revalidation is still coming");
  store.setTodoDone(3, true); // ticked before it answered
  await store.settled();
  store.hydrate({ states: { a: { read: true, saved: false } }, todos: [{ ...todo(1), done: true }, todo(3), todo(4)] });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.states.a.read, true, "read since the seed was rendered");
  assert.equal(snapshot.loadedStates.a.read, false, "the feed keeps the order it was first painted in");
  assert.deepEqual(
    snapshot.todos.map((item) => [item.id, item.done]),
    [[1, true], [3, true], [4, false]],
    "2 was deleted elsewhere; the local tick on 3 stays",
  );
  assert.equal(snapshot.syncing, false);
});

test("post read state is item_states post:<id>, within the 120-character key limit", () => {
  assert.equal(postStateKey(42), "post:42");
  assert.ok(postStateKey(Number.MAX_SAFE_INTEGER).length <= 120);
  const ids = readPostIds(["post:42", "post:7", "local-2026-W38-x-1a2b3c4d", "post:", "post:0", "post:12abc"]);
  assert.deepEqual([...ids].sort((a, b) => a - b), [7, 42]);
});

test("an early write that fails after the hydrate still rolls back to the server's own value", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop); // no initial: syncing
  store.setFlag("a", "saved", true); // clicked before GET /api/state answered
  await tick();
  store.hydrate({ states: { a: { read: false, saved: true } }, todos: [] });
  assert.equal(store.getSnapshot().states.a.saved, true, "hydrate keeps showing the local value");
  calls[0].reject(new TypeError("Failed to fetch")); // the write itself now fails
  await store.settled();
  assert.equal(store.getSnapshot().states.a.saved, true, "the server already confirmed true via the load");
});

test("an early write that fails before the hydrate does not force the rolled-back value over the server's", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop); // no initial: syncing
  store.setFlag("a", "saved", true); // clicked before GET /api/state answered
  await tick();
  calls[0].reject(new TypeError("Failed to fetch")); // the write fails first
  await tick();
  assert.equal(store.getSnapshot().states.a.saved, false, "rolled back to the pre-write default");
  store.hydrate({ states: { a: { read: false, saved: true } }, todos: [] }); // the load answers afterwards
  assert.equal(store.getSnapshot().states.a.saved, true, "the server's own value wins, not the rolled-back local one");
});

test("pins the newest-write guard: an old failure must not override two newer successes", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop, empty);
  store.toggleFlag("a", "read"); // 1st write: true
  store.toggleFlag("a", "read"); // 2nd write: false
  store.toggleFlag("a", "read"); // 3rd write: true
  await tick();
  calls[0].reject(new TypeError("Failed to fetch")); // the 1st fails, but by now it is no longer the newest write
  await tick();
  calls[1].resolve({}); // 2nd succeeds
  await tick();
  calls[2].resolve({}); // 3rd succeeds
  await store.settled();
  assert.equal(store.getSnapshot().states.a.read, true);
});

test("hydrate bringing an already-added to-do does not duplicate it once the add resolves", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop); // no initial: syncing
  store.addTodo("read the paper"); // tempId -1, its write not yet answered
  await tick();
  store.hydrate({ states: {}, todos: [{ id: 7, itemId: null, text: "read the paper", done: false }] });
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [-1, 7], "both rows visible until the add resolves");
  calls[0].resolve({ id: 7 }); // the add's own response finally arrives, with the id hydrate already brought
  await store.settled();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [7]);
});

test("a to-do add that resolves before the hydrate is not duplicated when hydrate brings the same id back", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop); // no initial: syncing
  store.addTodo("read the paper");
  await tick();
  calls[0].resolve({ id: 7 });
  await store.settled();
  store.hydrate({ states: {}, todos: [{ id: 7, itemId: null, text: "read the paper", done: false }] });
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [7]);
});
