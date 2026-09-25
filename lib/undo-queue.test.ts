import assert from "node:assert/strict";
import { test } from "node:test";
import { createToastQueue } from "./undo-queue.ts";

function logged(log: string[], name: string) {
  return { kind: name, undo: () => log.push(`undo ${name}`), commit: () => log.push(`commit ${name}`) };
}

test("a new toast makes the one it replaces final, exactly once", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  const first = queue.show(logged(log, "a"));
  queue.show(logged(log, "b"));
  assert.deepEqual(log, ["commit a"]);
  queue.dismiss(first); // the first toast's timer fires late
  queue.undo(first);
  assert.deepEqual(log, ["commit a"]);
  assert.equal(queue.getSnapshot()?.kind, "b");
});

test("undo runs once and never commits; a double click on Undo does nothing more", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  const id = queue.show(logged(log, "a"));
  queue.undo(id);
  queue.undo(id);
  queue.dismiss(id);
  assert.deepEqual(log, ["undo a"]);
  assert.equal(queue.getSnapshot(), null);
});

test("flush makes the pending action final when the page is closing", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  queue.show(logged(log, "a"));
  queue.flush();
  queue.flush();
  assert.deepEqual(log, ["commit a"]);
});
