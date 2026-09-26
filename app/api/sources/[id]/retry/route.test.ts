import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError, type FakeIngestDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, scheduledSourceIds, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const retry = (id = "5") => POST(new Request(`http://localhost/api/sources/${id}/retry`, { method: "POST" }), { params: Promise.resolve({ id }) });

/** Source 5, submitted by "owner", in `status`, as both the reader and the admin client see it. */
function sourceAs(viewer: string, status = "failed"): FakeIngestDb {
  resetRoute();
  const row = { id: 5, submitted_by: "owner", status };
  routeStub.reader = signedIn(fakeDb(undefined, { sources: [row] }), viewer);
  const admin = fakeDb(undefined, { sources: [row] });
  routeStub.admin = admin;
  return admin;
}

// Kills `reader.viewer.id` → `reader.viewer.email` (nobody could retry), and a scheduled run of the
// wrong source. The run gets a fresh admin client, like POST /api/sources' own.
test("POST /api/sources/[id]/retry answers 202 to the submitter of a failed source, and schedules its run", async () => {
  const admin = sourceAs("owner");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [202, { ok: true }]);
  assert.deepEqual(admin.sourceUpdates, [{ status: "pending", error: null, attempts: 0 }]);
  const run = fakeDb();
  routeStub.admin = run;
  assert.deepEqual(await scheduledSourceIds(run), [5]);
});

// Review Focus 1: a double click. Both requests read "failed"; only the first compare-and-swap
// matches, so one run starts and the other click answers 409. Kills the CAS's `.eq("status", "failed")`.
test("POST /api/sources/[id]/retry: of two overlapping clicks, one starts the run and the other answers 409 not_failed", async () => {
  sourceAs("owner");
  const responses = await Promise.all([retry(), retry()]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [202, 409]);
  assert.equal(routeStub.scheduled.length, 1);
});

test("POST /api/sources/[id]/retry answers 403 to a reader who didn't submit it, and changes nothing", async () => {
  const admin = sourceAs("intruder");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [403, { error: "forbidden" }]);
  assert.deepEqual(admin.sourceUpdates, []);
  assert.deepEqual(routeStub.scheduled, []);
});

// Kills a not_failed mapped to 403/500: the chat refreshes on 409 instead of showing an error.
test("POST /api/sources/[id]/retry answers 409 not_failed for a source that isn't failed", async () => {
  sourceAs("owner", "pending");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [409, { error: "not_failed" }]);
  assert.deepEqual(routeStub.scheduled, []);
});

// The preview's fixture ids are negative: postRoute answers 404 before any read. For "-5" that's
// before the id is even parsed, so it must not have created the admin client either — proven with
// routeStub.adminCalls, since retrySource is only ever called with one already created.
test("POST /api/sources/[id]/retry answers 404 for a missing source and for an id no source can have", async () => {
  for (const id of ["6", "-5"]) {
    sourceAs("owner");
    const response = await retry(id);
    assert.deepEqual([response.status, await response.json()], [404, { error: "not_found" }], id);
    if (id === "-5") assert.equal(routeStub.adminCalls, 0, "-5 is rejected before any admin client is created");
  }
});

// Fix round 1: a claim failure must surface as a 500 the chat can show, not read as "not_failed"
// (which the chat treats as "refresh" and hides a real DB outage). Kills `if (claimError) return
// "failed";` being dropped, and a swallowed console.error.
test("POST /api/sources/[id]/retry answers 500 db_error when the claim fails, and schedules nothing", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  resetRoute();
  const row = { id: 5, submitted_by: "owner", status: "failed" };
  routeStub.reader = signedIn(fakeDb(undefined, { sources: [row] }), "owner");
  routeStub.admin = fakeDb(undefined, { sources: [row], sourceUpdateError: pgError("08006", "connection failure") });
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
  assert.deepEqual(routeStub.scheduled, []);
  assert.equal(error.mock.calls.length, 1);
});

test("POST /api/sources/[id]/retry answers 401 when signed out", async () => {
  resetRoute();
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
