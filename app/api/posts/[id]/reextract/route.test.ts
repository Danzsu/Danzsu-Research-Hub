import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const reextract = (id = "7") => POST(new Request(`http://localhost/api/posts/${id}/reextract`, { method: "POST" }), { params: Promise.resolve({ id }) });

/** Post 7, from source 3, submitted by "owner"; `extractedAt` is when it was last (re-)extracted. */
function postBy(viewer: string, extractedAt: string | null = null) {
  resetRoute();
  const admin = fakeDb(undefined, { post: { id: 7, source_id: 3, extracted_at: extractedAt, sources: { submitted_by: "owner" } } });
  routeStub.reader = signedIn(fakeDb(), viewer);
  routeStub.admin = admin;
  return admin;
}

test("POST /reextract answers 403 to a reader who didn't submit the post, and schedules nothing", async () => {
  const admin = postBy("intruder");
  const response = await reextract();
  assert.deepEqual([response.status, await response.json()], [403, { error: "forbidden" }]);
  assert.deepEqual(routeStub.scheduled, []);
  assert.deepEqual(admin.postUpdates, []); // the cooldown was never claimed
});

// N5, N6: the ownership check gets the viewer's id, and the scheduled run re-extracts the post's own
// source (3), not a source that happens to share the post's id (7).
test("POST /reextract answers 202 to the submitter and schedules a run of the post's own source", async () => {
  const admin = postBy("owner");
  const response = await reextract();
  assert.deepEqual([response.status, await response.json()], [202, { ok: true }]);
  assert.equal(routeStub.scheduled.length, 1);
  await assert.rejects(async () => routeStub.scheduled[0](), { code: "PGRST116" }); // the fake holds no sources row
  assert.deepEqual(admin.eqCalls.filter((call) => call.table === "sources"), [{ table: "sources", column: "id", value: 3 }]);
});

// N7: the client shows "try again in N minutes" from retryAfter.
test("POST /reextract inside the cooldown answers 429 with the seconds left", async () => {
  const admin = postBy("owner", new Date(Date.now() - 5 * 60_000).toISOString());
  const response = await reextract();
  const body = (await response.json()) as { error: string; retryAfter: number };
  assert.equal(response.status, 429);
  assert.equal(body.error, "cooldown");
  assert.ok(body.retryAfter > 295 && body.retryAfter <= 300, String(body.retryAfter));
  assert.deepEqual(routeStub.scheduled, []);
  assert.deepEqual(admin.postUpdates, []); // still inside the cooldown: the claim was never attempted
});
