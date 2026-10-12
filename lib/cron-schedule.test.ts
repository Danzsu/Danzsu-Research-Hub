import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

// Daily news spec N2. Hobby crons fire within the hour, in UTC: the run at 14 and the mirror rounds at 15–17 keep
// the day's list ready by 18:00 in Budapest, summer and winter. Kills a schedule moved without the spec.
test("the daily run fires at 14 UTC and its mirror rounds at 15, 16 and 17", () => {
  assert.deepEqual(config.crons, [
    { path: "/api/cron/daily", schedule: "0 14 * * *" },
    { path: "/api/cron/mirror", schedule: "0 15 * * *" },
    { path: "/api/cron/mirror", schedule: "0 16 * * *" },
    { path: "/api/cron/mirror", schedule: "0 17 * * *" },
  ]);
});
