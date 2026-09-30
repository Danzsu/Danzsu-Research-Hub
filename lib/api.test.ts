import assert from "node:assert/strict";
import { test } from "node:test";
import { isCronRequest, jsonError, postRoute } from "./api.ts";
import { withEnv } from "./pipeline/mock-fetch.ts";

test("jsonError answers JSON with the status, the error and any extra fields", async () => {
  const response = jsonError(429, "cooldown", { retryAfter: 60 });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "cooldown", retryAfter: 60 });
});

test("jsonError never lets an extra field override the error code", async () => {
  assert.deepEqual(await jsonError(400, "invalid", { error: "spoofed", field: "title" }).json(), { error: "invalid", field: "title" });
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

// X1, for both cron routes. Kills `Bearer undefined` matching an unset secret, an empty secret opening
// the route, and a compare that is case-insensitive or takes a prefix. (Surrounding whitespace can't be
// tested: Headers trims a value, as HTTP does.)
test("isCronRequest takes only the exact bearer of a set CRON_SECRET", (t) => {
  const request = (authorization?: string) => new Request("http://localhost/api/cron/x", { headers: authorization ? { authorization } : {} });
  const cases: [string | undefined, string | undefined, boolean][] = [
    [undefined, undefined, false],
    [undefined, "Bearer undefined", false],
    ["", "Bearer ", false],
    ["s3cret", undefined, false],
    ["s3cret", "Bearer wrong", false],
    ["s3cret", "s3cret", false],
    ["s3cret", "bearer s3cret", false],
    ["s3cret", "Bearer s3cre", false],
    ["s3cret", "Bearer s3cret", true],
  ];
  for (const [secret, header, expected] of cases) {
    withEnv(t, "CRON_SECRET", secret);
    assert.equal(isCronRequest(request(header)), expected, `${secret} / ${header}`);
  }
});
