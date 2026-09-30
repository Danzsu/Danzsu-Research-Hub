import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { fakeDb, pgError } from "../../../../lib/pipeline/fake-db.ts";
import { feeds } from "../../../../lib/pipeline/feeds.ts";
import { geminiResponse, mockFetch, TEST_HOST, withBudgetGone, withEnv, withGeminiKey } from "../../../../lib/pipeline/mock-fetch.ts";
import { isoWeek } from "../../../../lib/pipeline/util.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

/** A good run's network: the model curates nothing, Hacker News and GitHub answer empty, every feed 404s. */
async function goodRunFetch(url: string): Promise<Response> {
  if (url.startsWith("https://generativelanguage.googleapis.com/")) return geminiResponse({ items: [], github: [] });
  if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
  if (url.startsWith("https://api.github.com/")) return Response.json({ items: [] });
  return new Response("", { status: 404 });
}

/** A cron run whose digest fails immediately (no model routes left) and has one pending source
 *  (id 4, a dead page) to retry — the shared setup for both "the digest failed, but…" tests below. */
function failedDigestWithOnePendingSource(t: TestContext): void {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "GEMINI_API_KEY", undefined); // daily_curate has no route left, so runDaily throws
  withEnv(t, "GROQ_API_KEY", undefined);
  withEnv(t, "RADAR_MIRROR_USER_ID", undefined); // the mirror queues nothing, with the warning mocked below
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  mockFetch(t, async () => new Response("", { status: 404 })); // every feed, and the pending source's page
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });
}

// X1: with CRON_SECRET unset, no header can be right, so the route never runs (model spend, DoS). Also
// pins revalidateTag behind the same check: moved above the secret check, it would drop the archive
// list's cache on every guess a scraper throws at the route, for free.
test("the cron answers 401 without a CRON_SECRET or with a wrong bearer, and never opens the admin client", async (t) => {
  resetRoute();
  for (const [secret, header] of [
    [undefined, undefined],
    [undefined, "Bearer undefined"],
    [undefined, "Bearer "],
    ["", undefined],
    ["", "Bearer "],
    ["s3cret", undefined],
    ["s3cret", "Bearer wrong"],
    ["s3cret", "s3cret"],
  ]) {
    withEnv(t, "CRON_SECRET", secret);
    const response = await GET(cronRequest(header));
    assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }], `${secret} / ${header}`);
  }
  assert.equal(routeStub.adminCalls, 0);
  assert.equal(routeStub.revalidated.length, 0);
});

// N1: a failed digest (model outage, bad key) must not also stall the pending link submissions.
test("a failed digest still retries the pending sources, and answers 500 with their count", async (t) => {
  failedDigestWithOnePendingSource(t);

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 1, mirrored: 0 }]);
  assert.deepEqual(routeStub.revalidated, [["archive", { expire: 0 }]]);
});

// Spec 1.5. Kills the revalidateTag call dropped, given the deprecated one-argument form (or "max",
// which serves the old list once more), or moved into one branch: every run drops the list, good or not.
test("a good cron run answers the digest and drops the archive list's cache at once", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "RADAR_MIRROR_USER_ID", "system-user");
  withGeminiKey(t);
  const warn = t.mock.method(console, "warn", () => {});
  mockFetch(t, goodRunFetch);
  routeStub.admin = fakeDb(undefined, { pending: [] });

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [200, { issue: isoWeek(new Date()).id, candidates: 0, shortlisted: 0, inserted: 0, repos: 0, mirrored: 0, retriedSources: 0 }]);
  assert.deepEqual(routeStub.revalidated, [["archive", { expire: 0 }]]);
  assert.equal(warn.mock.callCount(), feeds.length); // each feed's 404
});

// M2: the route must forward its own deadline (start + maxDuration), not let retryPendingSources run
// unbounded — dropping the argument (`retryPendingSources(db)`) would start every pending source
// regardless of how much of the route's own 300s budget is left.
test("the route forwards its own deadline: with 181s of the 300s budget already gone, no pending source is started", async (t) => {
  failedDigestWithOnePendingSource(t);

  // Only two Date.now() calls happen on this path: the route's own `start`, then
  // retryPendingSources' own start-gate check — nothing between them (this catch-and-continue
  // digest path never reaches processSource) calls Date.now() again.
  withBudgetGone(t, 181_000);

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 0, mirrored: 0 }]);
});

// Spec 2. Kills a mirror failure that takes the day's answer with it (the route would 500 though the
// digest is in), or one swallowed without a log.
test("a failing mirror queue is logged once, and the digest still answers 200 with mirrored 0", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "RADAR_MIRROR_USER_ID", "system-user");
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  mockFetch(t, goodRunFetch);
  routeStub.admin = fakeDb(undefined, {
    pending: [],
    rows: { digest_items: [{ issue_id: isoWeek(new Date()).id, url: "https://blog.test/best", score: 95, must_read: true }] },
    sourceUpsertError: pgError("08006", "connection failure"),
  });
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mirrored, 0);
  assert.equal(error.mock.callCount(), 1);
});
