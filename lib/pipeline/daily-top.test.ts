import assert from "node:assert/strict";
import { test } from "node:test";
import { budapestDay, budapestDayStart, budapestHour, pickDailyTop, type DailyCandidate } from "./daily-top.ts";

const item = (id: string, score: number, minutes: number): DailyCandidate => ({ id, score, read_minutes: minutes });
const ids = (items: DailyCandidate[]) => items.map((entry) => entry.id);
const longs = (n: number, from: number) => Array.from({ length: n }, (_, i) => item(`L${i}`, from - i, 30));

// Spec N2, Review Focus 3. Kills the UTC date: 23:30 in Budapest is still that evening, 00:30 the next day,
// in summer (UTC+2) and in winter (UTC+1).
test("budapestDay is the date in Budapest, across midnight in summer and winter", () => {
  assert.equal(budapestDay(new Date("2026-07-01T21:30:00Z")), "2026-07-01");
  assert.equal(budapestDay(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
  assert.equal(budapestDay(new Date("2026-01-15T22:30:00Z")), "2026-01-15");
  assert.equal(budapestDay(new Date("2026-01-15T23:30:00Z")), "2026-01-16");
});

// Spec N4. Kills a list not cut at 10 or not ranked by score.
test("pickDailyTop takes the ten best by score when the short reads already fit", () => {
  const items = [...longs(8, 90), item("S1", 70, 5), item("S2", 69, 10), item("S3", 68, 15), item("X", 10, 4)];
  assert.deepEqual(ids(pickDailyTop(items)), ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "S1", "S2", "S3"].slice(0, 10));
});

// Spec N4. Kills too few short reads kept (the best long ones crowd them out) and the wrong long ones dropped:
// the lowest-scored long reads make room for the best short ones, and the list is ranked again.
test("pickDailyTop swaps the lowest long reads for the best short ones until three are short", () => {
  const items = [...longs(10, 90), item("S1", 60, 8), item("S2", 50, 15), item("S3", 40, 3), item("S4", 30, 2)];
  assert.deepEqual(ids(pickDailyTop(items)), ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "S1", "S2", "S3"]);
});

// Spec N4. Kills more than five short reads kept while long ones wait, and a swap that runs past the
// long reads there are.
test("pickDailyTop keeps at most five short reads, as far as long ones allow", () => {
  const shorts = Array.from({ length: 12 }, (_, i) => item(`S${i}`, 99 - i, 5));
  assert.deepEqual(ids(pickDailyTop([...shorts, ...longs(3, 50)])), ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "L0", "L1", "L2"]);
  const plenty = [...shorts, ...longs(9, 50)];
  assert.equal(pickDailyTop(plenty).filter((entry) => entry.read_minutes <= 15).length, 5);
});

// Kills a short day padded or a missing short read invented, a tie reordered, and a crash on no items.
test("pickDailyTop keeps a short day whole, ties in their given order, and nothing for nothing", () => {
  assert.deepEqual(ids(pickDailyTop([item("a", 50, 30), item("b", 80, 30)])), ["b", "a"]);
  assert.deepEqual(ids(pickDailyTop(longs(12, 90))), ids(longs(10, 90)));
  assert.deepEqual(ids(pickDailyTop([item("first", 70, 30), item("second", 70, 30)])), ["first", "second"]);
  // Two short reads tied at 70 swap in one after the other, landing in reverse slots: the tie still keeps their order.
  assert.deepEqual(ids(pickDailyTop([...longs(10, 90), item("S1", 70, 5), item("S2", 70, 5), item("S3", 60, 5)])).slice(7), ["S1", "S2", "S3"]);
  assert.deepEqual(pickDailyTop([]), []);
});

// Review Focus 1. Kills the day's start taken in UTC, or with the wrong offset in summer or winter.
test("budapestDayStart is Budapest's midnight as a UTC instant, in summer and winter", () => {
  assert.equal(budapestDayStart(new Date("2026-07-01T15:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(budapestDayStart(new Date("2026-01-15T15:00:00Z")).toISOString(), "2026-01-14T23:00:00.000Z");
  assert.equal(budapestDayStart(new Date("2026-07-01T22:30:00Z")).toISOString(), "2026-07-01T22:00:00.000Z");
});

// Polish 1, Review Focus 3. Kills the hour taken in UTC: 16:30 UTC is 18:30 in a Budapest summer, 17:30 in winter.
test("budapestHour reads Budapest's clock, summer and winter", () => {
  assert.equal(budapestHour(new Date("2026-07-01T16:30:00Z")), 18);
  assert.equal(budapestHour(new Date("2026-01-15T16:30:00Z")), 17);
});
