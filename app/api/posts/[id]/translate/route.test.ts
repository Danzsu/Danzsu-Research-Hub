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
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7 } }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks: [], blocks_hu: null, extracted_at: null } }); // nothing to translate: ok, no model call
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  assert.equal(routeStub.adminCalls, 1);
});

// The route maps translatePost's own result codes to HTTP; these two pin that RESULT_STATUS mapping,
// not translatePost's internal logic (already covered exhaustively in lib/translate.test.ts).
test("POST /translate answers 409 translation_stale when a re-extraction lands mid-run", async (t) => {
  resetRoute();
  withGeminiKey(t);
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7 } }));
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
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7 } }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks, blocks_hu: null, extracted_at: null } });
  mockFetch(t, () => geminiResponse({ blocks: [] })); // missing the heading's own entry
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [502, { error: "translation_shape" }]);
});
