import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

// Daily news spec N2 and its final review. Hobby crons fire within the hour, in UTC: the run at 13 and the mirror rounds
// at 14 and 15 all end before 18:00 in Budapest even in summer (UTC+2), so the ten briefs are ready by then; 16 retries
// what is left. Kills a schedule moved without the spec.
test("the daily run fires at 13 UTC and its mirror rounds at 14, 15 and 16", () => {
  assert.deepEqual(config.crons, [
    { path: "/api/cron/daily", schedule: "0 13 * * *" },
    { path: "/api/cron/mirror", schedule: "0 14 * * *" },
    { path: "/api/cron/mirror", schedule: "0 15 * * *" },
    { path: "/api/cron/mirror", schedule: "0 16 * * *" },
  ]);
});
