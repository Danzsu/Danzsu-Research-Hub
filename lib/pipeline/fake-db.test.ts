import assert from "node:assert/strict";
import { test } from "node:test";
import { retryPendingSources } from "./ingest.ts";
import { fakeDb } from "./fake-db.ts";
import { mockFetch, TEST_HOST } from "./mock-fetch.ts";

// Fix round 1: SQL's own null rule — `.neq("status", "done")` must not match a row whose status is
// null (null compares to UNKNOWN, never true, in eq/neq/lt alike). Not a real case (sources.status is
// never null in production) but a regression pin for fakeDb's own `passes()` null handling, exercised
// through retryPendingSources since that's the one caller whose filter chain reaches it.
test("fakeDb's select filters never match a row whose column is null (SQL null rules apply)", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, async (url) => {
    fetched.push(url);
    return new Response("", { status: 404 });
  });
  const source = { id: 40, url: `${TEST_HOST}/nullstatus`, kind: "article", note: null, attempts: 0, status: null };
  const db = fakeDb(undefined, { sources: [source], post: null, pending: [source] });
  assert.equal(await retryPendingSources(db), 0);
  assert.deepEqual(fetched, []);
});
