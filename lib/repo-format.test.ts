import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStars, repoStats, weekSpan } from "./repo-format.ts";

// Kills a star count shown raw (152000 doesn't fit a card), a null shown as "null", and a week span
// that repeats one week ("W38–W38").
test("formatStars is compact and weekSpan collapses a single week", () => {
  assert.deepEqual([formatStars(152000), formatStars(640), formatStars(null)], ["152K", "640", "—"]);
  assert.deepEqual([weekSpan("2026-W36", "2026-W39"), weekSpan("2026-W38", "2026-W38")], ["W36–W39", "W38"]);
});

// Final review. Kills the Top 10 and the GitHub page building the same line each on their own.
test("repoStats is the one line both repo lists show", () => {
  assert.equal(repoStats("Rust", 64000, 61), "Rust · ★ 64K · 61/100");
  assert.equal(repoStats(null, null, null), "— · ★ — · —");
});
