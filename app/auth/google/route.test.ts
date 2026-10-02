import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { POST } = await import("./route.ts");
const start = (next: string) => POST(authRequest("/auth/google", { next }));

// Google sign-in spec and Review Focus 1. Kills the wrong provider, a redirectTo without the callback or
// its safe next (a query and hash must survive, encoded once), PKCE's browser redirect left on, and an
// answer that doesn't follow Supabase's URL.
test("POST /auth/google starts Google's PKCE sign-in back to the callback with a safe next, and follows its URL", async () => {
  const calls = fakeAuth();
  const response = await start("/library/12?text=hu#b-3");
  assert.deepEqual(calls, [["signInWithOAuth", { provider: "google", options: { redirectTo: "http://localhost/auth/callback?next=%2Flibrary%2F12%3Ftext%3Dhu%23b-3", skipBrowserRedirect: true } }]]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://ref.supabase.test/auth/v1/authorize?provider=google");
  const evil = fakeAuth();
  await start("//evil.test");
  assert.deepEqual(evil, [["signInWithOAuth", { provider: "google", options: { redirectTo: "http://localhost/auth/callback?next=%2F", skipBrowserRedirect: true } }]]);
});

// Kills a failed start sent on to a missing URL, or to the "link expired" message instead of Google's.
test("POST /auth/google answers the login page's google error when Supabase can't start it, keeping next", async () => {
  for (const answer of [{ data: { provider: "google", url: null }, error: { message: "provider is not enabled" } }, { data: { provider: "google", url: null }, error: null }]) {
    fakeAuth({ signInWithOAuth: answer });
    const response = await start("/library");
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://localhost/login?error=google&next=%2Flibrary");
  }
});
