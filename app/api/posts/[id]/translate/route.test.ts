import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const translate = () => POST(new Request("http://localhost/api/posts/7/translate", { method: "POST" }), { params: Promise.resolve({ id: "7" }) });

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
