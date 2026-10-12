import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "./fake-db.ts";
import { MIRROR_MIN_SCORE, queueMirrors } from "./mirror.ts";
import { withEnv } from "./mock-fetch.ts";

const item = (url: string, score: number, mustRead = false, issue = "2026-W40") => ({ issue_id: issue, url, score, must_read: mustRead });

// Spec 2, Review Focus 4. Kills a threshold off by one (84 in, or 85 out), the Top 3 left out below it,
// another week's items taken, the URL stored raw (a #fragment or an upper-case host would miss the
// card's lookup and a later paste), the kind not detected, a duplicate URL sent twice in one upsert
// (Postgres refuses that), and rows not stamped with the system account.
test("queueMirrors queues the week's 85+ items and its Top 3 under the system account, normalized", async () => {
  const db = fakeDb(undefined, {
    rows: {
      digest_items: [
        item("https://BLOG.test/edge#section", MIRROR_MIN_SCORE),
        item("https://blog.test/a", 96),
        item("https://blog.test/a#top", 90),
        item("https://github.com/owner/tool", 90),
        item("https://blog.test/top-but-low", 70, true),
        item("https://blog.test/b", MIRROR_MIN_SCORE - 1),
        item("https://blog.test/other-week", 99, true, "2026-W39"),
      ],
    },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 4);
  assert.deepEqual(db.sourceUpserts, [
    {
      values: [
        { url: "https://blog.test/edge", kind: "article", submitted_by: "system-user" },
        { url: "https://blog.test/a", kind: "article", submitted_by: "system-user" },
        { url: "https://github.com/owner/tool", kind: "github", submitted_by: "system-user" },
        { url: "https://blog.test/top-but-low", kind: "article", submitted_by: "system-user" },
      ],
      options: { onConflict: "url", ignoreDuplicates: true },
    },
  ]);
});

// Kills a member's own submission overwritten (ignoreDuplicates dropped), or counted as newly queued.
test("queueMirrors leaves a URL already in sources alone, and counts only what it newly queued", async () => {
  const db = fakeDb(undefined, {
    sources: [{ id: 1, url: "https://blog.test/a", submitted_by: "member", status: "done" }],
    rows: { digest_items: [item("https://blog.test/a", 95), item("https://blog.test/new", 95)] },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 1);
  assert.deepEqual(db.sourceUpserts[0].options, { onConflict: "url", ignoreDuplicates: true });
});

// Review Focus 3. Kills a mirror that queues under no one (submitted_by is NOT NULL: the upsert would
// fail every day) or reads the week anyway, and a private URL queued past parseSubmittedUrl.
test("queueMirrors queues nothing without RADAR_MIRROR_USER_ID, saying so once, and skips a URL a submission would refuse", async (t) => {
  withEnv(t, "RADAR_MIRROR_USER_ID", undefined);
  const warn = t.mock.method(console, "warn", () => {});
  const unset = fakeDb(undefined, { rows: { digest_items: [item("https://blog.test/a", 95)] } });
  assert.equal(await queueMirrors(unset, "2026-W40"), 0);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(unset.queries, []);

  const privateOnly = fakeDb(undefined, { rows: { digest_items: [item("http://10.0.0.1/x", 95)] } });
  assert.equal(await queueMirrors(privateOnly, "2026-W40", "system-user"), 0);
  assert.deepEqual(privateOnly.sourceUpserts, []);
});

// Daily news spec N5. Kills the day's Top 10 left out below 85 points (its card would have no brief), and an
// item outside it queued.
test("queueMirrors also queues the items ranked in a daily Top 10, whatever their score", async () => {
  const db = fakeDb(undefined, {
    rows: {
      digest_items: [
        { ...item("https://blog.test/daily", 60), daily_top: [{ rank: 4 }] },
        { ...item("https://blog.test/plain", 60), daily_top: [] },
      ],
    },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 1);
  assert.deepEqual(db.sourceUpserts[0].values, [{ url: "https://blog.test/daily", kind: "article", submitted_by: "system-user" }]);
});
