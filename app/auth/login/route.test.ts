import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { POST } = await import("./route.ts");

// The magic link, unchanged, now through authCallback. Kills shouldCreateUser flipped (an uninvited
// address would get an account), `next` dropped or not through safeNext, the address not trimmed and
// lowercased, and any answer that differs for an unknown address (it would enumerate members).
test("POST /auth/login asks for an invite-only link back to the callback with a safe next, and always answers the same", async () => {
  const calls = fakeAuth();
  const sent = await POST(authRequest("/auth/login", { email: " Tag@Example.Test ", next: "/library?x=1" }));
  assert.deepEqual(calls, [["signInWithOtp", { email: "tag@example.test", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost/auth/callback?next=%2Flibrary%3Fx%3D1" } }]]);
  const evil = fakeAuth();
  await POST(authRequest("/auth/login", { email: "a@b.test", next: "//evil.test" }));
  assert.deepEqual(evil, [["signInWithOtp", { email: "a@b.test", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost/auth/callback?next=%2F" } }]]);
  const none = fakeAuth();
  const notAnEmail = await POST(authRequest("/auth/login", { email: "nincs-kukac" }));
  assert.deepEqual(none, []);
  for (const response of [sent, notAnEmail]) {
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://localhost/login?sent=1");
  }
});
