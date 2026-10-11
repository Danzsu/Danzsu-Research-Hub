import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStars, weekSpan } from "./repo-format.ts";

// Kills a star count shown raw (152000 doesn't fit a card), a null shown as "null", and a week span
// that repeats one week ("W38–W38").
test("formatStars is compact and weekSpan collapses a single week", () => {
  assert.deepEqual([formatStars(152000), formatStars(640), formatStars(null)], ["152K", "640", "—"]);
  assert.deepEqual([weekSpan("2026-W36", "2026-W39"), weekSpan("2026-W38", "2026-W38")], ["W36–W39", "W38"]);
});
