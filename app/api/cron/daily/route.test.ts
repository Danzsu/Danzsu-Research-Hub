import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../lib/pipeline/fake-db.ts";
import { mockFetch, TEST_HOST, withEnv } from "../../../../lib/pipeline/mock-fetch.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

// X1: with CRON_SECRET unset, no header can be right, so the route never runs (model spend, DoS).
test("the cron answers 401 without a CRON_SECRET or with a wrong bearer, and never opens the admin client", async (t) => {
  resetRoute();
  for (const [secret, header] of [[undefined, undefined], [undefined, "Bearer undefined"], [undefined, "Bearer "], ["s3cret", "Bearer wrong"], ["s3cret", "s3cret"]]) {
    withEnv(t, "CRON_SECRET", secret);
    const response = await GET(cronRequest(header));
    assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }], `${secret} / ${header}`);
  }
  assert.equal(routeStub.adminCalls, 0);
});

// N1: a failed digest (model outage, bad key) must not also stall the pending link submissions.
test("a failed digest still retries the pending sources, and answers 500 with their count", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "GEMINI_API_KEY", undefined); // daily_curate has no route left, so runDaily throws
  withEnv(t, "GROQ_API_KEY", undefined);
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  mockFetch(t, async () => new Response("", { status: 404 })); // every feed, and the pending source's page
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 1 }]);
});
