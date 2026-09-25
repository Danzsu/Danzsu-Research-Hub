import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../lib/test/route-hooks.ts";

const { PATCH } = await import("./route.ts");

const save = (body: unknown) =>
  PATCH(new Request("http://localhost/api/posts/7", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "7" }) });

// N8: update_post_overrides raises 42501 for anyone but the submitter; the editor shows that as "not yours".
test("PATCH /api/posts/[id] answers 403 when the database refuses the edit, and 400 for a malformed body", async () => {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7, blocks: [] }, rpcError: pgError("42501", "only the submitter can edit this post") }), "intruder");
  const refused = await save({ hidden: [] });
  assert.deepEqual([refused.status, await refused.json()], [403, { error: "forbidden" }]);
  const malformed = await save({ hidden: "b1" });
  assert.deepEqual([malformed.status, await malformed.json()], [400, { error: "invalid" }]);
  assert.equal(routeStub.adminCalls, 0, "an edit runs as the reader, never with the secret key");
});
