import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonError, postRoute } from "./api.ts";

test("jsonError answers JSON with the status, the error and any extra fields", async () => {
  const response = jsonError(429, "cooldown", { retryAfter: 60 });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "cooldown", retryAfter: 60 });
});

const request = new Request("http://localhost/api/posts/7", { method: "POST" });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

test("postRoute answers 401 when signed out and 404 for an id no post can have, without running the handler", async () => {
  let calls = 0;
  const handler = async () => {
    calls++;
    return Response.json({ ok: true });
  };
  const signedOut = await postRoute(async () => null, handler)(request, context("7"));
  assert.deepEqual([signedOut.status, await signedOut.json()], [401, { error: "unauthorized" }]);
  for (const id of ["abc", "0", "07", "-1"]) {
    const invalid = await postRoute(async () => ({ id: "reader" }), handler)(request, context(id));
    assert.deepEqual([invalid.status, await invalid.json()], [404, { error: "not_found" }], id);
  }
  assert.equal(calls, 0);
});

test("postRoute hands the handler the request, the reader and the numeric post id", async () => {
  const reader = { id: "reader" };
  const response = await postRoute(async () => reader, async (got, target) => {
    assert.equal(got, request);
    assert.deepEqual(target, { reader, postId: 7 });
    return Response.json({ ok: true }, { status: 202 });
  })(request, context("7"));
  assert.equal(response.status, 202);
});
