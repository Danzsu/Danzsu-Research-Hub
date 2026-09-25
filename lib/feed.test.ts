import assert from "node:assert/strict";
import { test } from "node:test";
import { feedItems, sortUnreadFirst } from "./feed.ts";
import { digestItem } from "./fixtures.ts";

const read = { read: true, saved: false };
const ids = (items: { id: string }[]) => items.map((item) => item.id);

test("sortUnreadFirst moves read items to the end of their own group", () => {
  const items = [digestItem("m1", { mustRead: true }), digestItem("m2", { mustRead: true }), digestItem("a"), digestItem("b"), digestItem("c")];
  assert.deepEqual(ids(sortUnreadFirst(items, { m1: read, a: read })), ["m2", "m1", "b", "c", "a"]);
});

test("feedItems leaves the Top 3 out of the all view only", () => {
  const items = [digestItem("m", { mustRead: true, category: "research" }), digestItem("r", { category: "research" }), digestItem("l")];
  assert.deepEqual(ids(feedItems(items, "all", {}, {})), ["r", "l"]);
  assert.deepEqual(ids(feedItems(items, "research", {}, {})), ["m", "r"], "a category view has no Top 3 above it");
});

test("feedItems sorts by the loaded states, so a card read just now stays put", () => {
  const items = [digestItem("a"), digestItem("b")];
  assert.deepEqual(ids(feedItems(items, "all", { a: read }, {})), ["a", "b"]);
  assert.deepEqual(ids(feedItems(items, "all", { a: read }, { a: read })), ["b", "a"]);
});

test("the saved view follows the live state", () => {
  const items = [digestItem("a"), digestItem("b", { mustRead: true })];
  assert.deepEqual(ids(feedItems(items, "saved", { b: { read: false, saved: true } }, {})), ["b"]);
});

test("the saved view keeps a card saved at load time even after it's un-saved live, until the next load", () => {
  const items = [digestItem("a"), digestItem("b")];
  const states = { a: { read: false, saved: false } };
  const loadedStates = { a: { read: false, saved: true } };
  assert.deepEqual(ids(feedItems(items, "saved", states, loadedStates)), ["a"]);
});
