import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { fakeDb } from "../../../../lib/pipeline/fake-db.ts";
import { feeds } from "../../../../lib/pipeline/feeds.ts";
import { geminiResponse, mockFetch, TEST_HOST, withEnv, withGeminiKey } from "../../../../lib/pipeline/mock-fetch.ts";
import { isoWeek } from "../../../../lib/pipeline/util.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

/** A cron run whose digest fails immediately (no model routes left) and has one pending source
 *  (id 4, a dead page) to retry — the shared setup for both "the digest failed, but…" tests below. */
function failedDigestWithOnePendingSource(t: TestContext): void {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "GEMINI_API_KEY", undefined); // daily_curate has no route left, so runDaily throws
  withEnv(t, "GROQ_API_KEY", undefined);
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  mockFetch(t, async () => new Response("", { status: 404 })); // every feed, and the pending source's page
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });
}

// X1: with CRON_SECRET unset, no header can be right, so the route never runs (model spend, DoS).
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
});

// N1: a failed digest (model outage, bad key) must not also stall the pending link submissions.
test("a failed digest still retries the pending sources, and answers 500 with their count", async (t) => {
  failedDigestWithOnePendingSource(t);

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 1 }]);
  assert.deepEqual(routeStub.revalidated, [["archive", { expire: 0 }]]);
});

// Spec 1.5. Kills the revalidateTag call dropped, given the deprecated one-argument form (or "max",
// which serves the old list once more), or moved into one branch: every run drops the list, good or not.
test("a good cron run answers the digest and drops the archive list's cache at once", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withGeminiKey(t);
  const warn = t.mock.method(console, "warn", () => {});
  mockFetch(t, async (url) => {
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return geminiResponse({ items: [], github: [] });
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url.startsWith("https://api.github.com/")) return Response.json({ items: [] });
    return new Response("", { status: 404 }); // every feed
  });
  routeStub.admin = fakeDb(undefined, { pending: [] });

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [200, { issue: isoWeek(new Date()).id, candidates: 0, shortlisted: 0, inserted: 0, repos: 0, retriedSources: 0 }]);
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
  const start = 1_000_000;
  let calls = 0;
  t.mock.method(Date, "now", () => (calls++ === 0 ? start : start + 181_000));

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 0 }]);
});
