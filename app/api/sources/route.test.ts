import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError, type FakeIngestTables } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, scheduledSourceIds, signedIn } from "../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const submit = (body: unknown) => POST(new Request("http://localhost/api/sources", { method: "POST", body: JSON.stringify(body) }));

function reader(tables: FakeIngestTables = {}) {
  resetRoute();
  const db = fakeDb(undefined, tables);
  routeStub.reader = signedIn(db);
  return db;
}

// X5: parseSubmittedUrl is the API boundary; a private or non-http link is never even stored.
test("POST /api/sources answers 400 invalid_url for a private or non-http link, and stores nothing", async () => {
  const db = reader();
  for (const url of ["http://127.0.0.1/admin", "http://10.0.0.1/", "http://localhost:3000/", "http://printer.local/", "http://metadata.google.internal/", "file:///etc/passwd", "javascript:alert(1)", "not a url", 42]) {
    const response = await submit({ url });
    assert.deepEqual([response.status, await response.json()], [400, { error: "invalid_url" }], String(url));
  }
  assert.deepEqual(db.sourceInserts, []);
  assert.deepEqual(routeStub.scheduled, []);
});

// N3: `sources.url` is unique; a second submission of the same link is the reader's news, not a 500.
test("POST /api/sources answers 409 already_submitted when the link is already in the library", async () => {
  reader({ sourceInsertError: pgError("23505", 'duplicate key value violates unique constraint "sources_url_key"') });
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [409, { error: "already_submitted" }]);
  assert.deepEqual(routeStub.scheduled, []);
});

// N4: the 202 is a promise that the link gets processed after the response.
test("POST /api/sources stores the link as the reader, answers 202 with its id, and schedules its processing", async () => {
  const db = reader({ sources: [{ id: 1 }, { id: 2 }] });
  const response = await submit({ url: " https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=1 ", note: `  ${"n".repeat(600)}` });
  assert.deepEqual([response.status, await response.json()], [202, { ok: true, id: 3 }]);
  assert.deepEqual(db.sourceInserts, [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "youtube", note: "n".repeat(500) }]);
  assert.equal(routeStub.scheduled.length, 1);
  assert.equal(routeStub.adminCalls, 0, "the admin client is opened only when the scheduled run starts");

  // The scheduled task really processes the new source (id 3), not just any resolved promise.
  const admin = fakeDb();
  routeStub.admin = admin;
  assert.deepEqual(await scheduledSourceIds(admin), [3]);
});

// N3 continued: only the 23505 (duplicate url) code is the reader's news; any other insert
// error is a plain 500, not silently reported as "already submitted".
test("POST /api/sources answers 500 insert_failed for an insert error that isn't a duplicate", async () => {
  reader({ sourceInsertError: pgError("08006", "connection failure") });
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [500, { error: "insert_failed" }]);
  assert.deepEqual(routeStub.scheduled, []);
});

test("POST /api/sources answers 401 when signed out", async () => {
  resetRoute();
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
