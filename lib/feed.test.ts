import assert from "node:assert/strict";
import { test } from "node:test";
import { addedDayLabel, dailyTop, feedItems, sortUnreadFirst } from "./feed.ts";
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

// The AI companies page's Top 5. Kills a pick that ignores the day (yesterday's 99 would push out a story
// of today's run), one that orders by anything but the score, one that keeps more than five, and a day
// cut at UTC midnight instead of Budapest's.
test("dailyTop takes the latest day's items by their Budapest date, highest score first, at most five", () => {
  const at = (id: string, addedAt: string, score: number) => digestItem(id, { addedAt, score });
  const scores = [61, 90, 72, 55, 83, 47];
  const items = [at("yesterday", "2026-09-28T05:59:00Z", 99), ...scores.map((score, i) => at(`today-${score}`, `2026-09-29T05:5${i}:00Z`, score))];
  assert.deepEqual(ids(dailyTop(items)), ["today-90", "today-83", "today-72", "today-61", "today-55"]);
  // 23:30 UTC on the 28th is already the 29th in Budapest (CEST, UTC+2).
  const late = at("late", "2026-09-28T23:30:00Z", 10);
  assert.deepEqual(ids(dailyTop([late, at("morning", "2026-09-29T06:00:00Z", 20)])), ["morning", "late"]);
  assert.equal(addedDayLabel(late.addedAt), "09. 29.");
  // One run's rows share one created_at: a tie goes by id, so the Top 5 is the same on every load.
  const tie = (id: string) => at(id, "2026-09-29T05:59:00Z", 70);
  assert.deepEqual(ids(dailyTop([tie("b"), tie("a")])), ["a", "b"]);
  assert.deepEqual(dailyTop([]), []);
});
