import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { POST } = await import("./route.ts");

// 2a spec D6. Kills a sign-out that lands on the sign-in form instead of the landing page, one that forgets
// to say it happened, and one that never signs the session out.
test("POST /auth/signout signs out and sends the visitor to the landing page with a signed_out mark", async () => {
  const calls = fakeAuth();
  const response = await POST(authRequest("/auth/signout", {}));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/about?signed_out=1");
  assert.deepEqual(calls, [["signOut", undefined]]);
});
