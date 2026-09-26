import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "../../../../../lib/blocks.ts";
import { fakeDb, type FakeIngestTables } from "../../../../../lib/pipeline/fake-db.ts";
import { geminiResponse, mockFetch, withGeminiKey } from "../../../../../lib/pipeline/mock-fetch.ts";
import { resetRoute, routeStub, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const translate = () => POST(new Request("http://localhost/api/posts/7/translate", { method: "POST" }), { params: Promise.resolve({ id: "7" }) });

// One translatable block, just enough to make translatePost actually call the model instead of
// short-circuiting to "ok" (nothing to translate).
const blocks = assignIds([{ type: "heading", level: 2, text: "Results" }] satisfies BlockDraft[]);

// N9: RLS decides whether the reader can see the post; only then does the secret key run the model.
test("POST /translate answers 404 for a post the reader can't see, without opening the admin client", async () => {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { post: null }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks: [], blocks_hu: null, extracted_at: null } });
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [404, { error: "not_found" }]);
  assert.equal(routeStub.adminCalls, 0);
});

test("POST /translate runs the translation with the admin client once the reader sees the post", async () => {
  resetRoute();
  // source_id deliberately differs from id: a fixture with only `id` would still "match" a mutant
  // `.eq("source_id", postId)` on route.ts:19 (a column the fixture never set passes every filter),
  // so this test would keep passing under that mutant without a distinct source_id to fail against.
  const readerDb = fakeDb(undefined, { post: { id: 7, source_id: 3 } });
  routeStub.reader = signedIn(readerDb);
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks: [], blocks_hu: null, extracted_at: null } }); // nothing to translate: ok, no model call
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  assert.equal(routeStub.adminCalls, 1);
  // Pins route.ts:19's own lookup column: id (7), not source_id.
  assert.deepEqual(readerDb.eqCalls, [{ table: "posts", column: "id", value: 7 }]);
});

// The route maps translatePost's own result codes to HTTP; these two pin that RESULT_STATUS mapping,
// not translatePost's internal logic (already covered exhaustively in lib/translate.test.ts).
test("POST /translate answers 409 translation_stale when a re-extraction lands mid-run", async (t) => {
  resetRoute();
  withGeminiKey(t);
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7, source_id: 3 } }));
  const tables: FakeIngestTables = { post: { id: 7, blocks, blocks_hu: null, extracted_at: "2026-01-01T00:00:00Z" } };
  routeStub.admin = fakeDb(undefined, tables);
  mockFetch(t, () => {
    // A concurrent processSource() run replaces the row (a new object, not a mutation) while the
    // model call above is in flight, so translatePost's own CAS read is now stale.
    tables.post = { ...tables.post, extracted_at: "2026-02-02T00:00:00Z" };
    return geminiResponse({ blocks: [{ id: blocks[0].id, text: "Eredmények" }] });
  });
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [409, { error: "translation_stale" }]);
});

test("POST /translate answers 502 translation_shape when the model's answer doesn't match the post's blocks", async (t) => {
  resetRoute();
  withGeminiKey(t);
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7, source_id: 3 } }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks, blocks_hu: null, extracted_at: null } });
  mockFetch(t, () => geminiResponse({ blocks: [] })); // missing the heading's own entry
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [502, { error: "translation_shape" }]);
});

// Every model route failing (not a shape mismatch) maps to a different error: translation_failed.
test("POST /translate answers 502 translation_failed when every model route fails", async (t) => {
  resetRoute();
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7, source_id: 3 } }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks, blocks_hu: null, extracted_at: null } });
  mockFetch(t, () => new Response("server error", { status: 500 }));
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [502, { error: "translation_failed" }]);
});
