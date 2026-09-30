import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../lib/pipeline/fake-db.ts";
import { mockFetch, TEST_HOST, withBudgetGone, withEnv } from "../../../../lib/pipeline/mock-fetch.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/mirror", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

/** One pending source (id 4, a dead page), as the daily run's queue leaves it. */
function onePendingSource() {
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });
}

// Kills the route shipped without the check: every scraper's guess would spend model calls. The
// check's own cases are isCronRequest's test (lib/api.test.ts).
test("the mirror cron answers 401 to a wrong bearer and never opens the admin client", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  const response = await GET(cronRequest("Bearer wrong"));
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
  assert.equal(routeStub.adminCalls, 0);
});

// Spec 3. Kills the queue left unworked (the mirror's sources would wait for tomorrow's run).
test("the mirror cron works the pending sources and says how many it took", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  mockFetch(t, async () => new Response("", { status: 404 })); // the pending source's page
  onePendingSource();
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.deepEqual([response.status, await response.json()], [200, { processed: 1 }]);
});

// Kills the route's own deadline dropped (`retryPendingSources(db)`): with 181 s of its 300 s gone,
// no source may start. Only two Date.now() calls happen on this path: the route's `start`, then the
// start gate's check.
test("the mirror cron forwards its own deadline: with 181 s of the 300 s gone, it starts nothing", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  onePendingSource();
  withBudgetGone(t, 181_000);
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.deepEqual([response.status, await response.json()], [200, { processed: 0 }]);
});
