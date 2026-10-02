import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";

const { GET } = await import("./route.ts");
const back = async (query: string) => (await GET(authRequest(`/auth/callback${query}`))).headers.get("location");

// Google sign-in spec, and Review Focus 2 and 3. Kills an uninvited account shown "link expired", a cancel
// shown "not invited", a refusal that still tries a session (an `error` with a stray `code` included),
// and an unsafe `next` kept on the error path.
test("the callback maps Google's refusals to not_invited or google, keeps a safe next, and opens no session", async () => {
  const calls = fakeAuth();
  assert.equal(await back("?next=%2Flibrary&via=google&error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance"), "http://localhost/login?error=not_invited&next=%2Flibrary");
  assert.equal(await back("?next=%2Flibrary&via=google&error=access_denied"), "http://localhost/login?error=google&next=%2Flibrary");
  assert.equal(await back("?next=%2F%2Fevil.test&via=google&error=server_error&code=abc"), "http://localhost/login?error=google&next=%2F");
  assert.deepEqual(calls, []);
});

// Final review, Important 1. GoTrue refuses a default magic link (expired, already used, opened first by a
// mail scanner) by sending the reader back with an error too. Kills that shown as a Google failure to a
// member who never touched Google: only a round trip marked via=google is Google's.
test("the callback keeps a refused magic link on the link message, and opens no session", async () => {
  const calls = fakeAuth();
  assert.equal(await back("?next=%2Flibrary&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"), "http://localhost/login?error=1&next=%2Flibrary");
  assert.equal(await back("?next=%2Flibrary&error=server_error"), "http://localhost/login?error=1&next=%2Flibrary");
  assert.deepEqual(calls, []);
});

// The two ways in that work today, now with `next` kept on failure. Kills the code and the token hash
// swapped or dropped, success not going to the safe next, and a failure that loses next.
test("the callback signs in with a code or a token hash and goes to the safe next; a failure goes to error=1", async () => {
  let calls = fakeAuth();
  assert.equal(await back("?code=abc&next=%2Flibrary"), "http://localhost/library");
  assert.deepEqual(calls, [["exchangeCodeForSession", "abc"]]);
  calls = fakeAuth();
  assert.equal(await back("?token_hash=th&type=email&next=%2F%2Fevil.test"), "http://localhost/");
  assert.deepEqual(calls, [["verifyOtp", { token_hash: "th", type: "email" }]]);
  fakeAuth({ exchangeCodeForSession: { error: { message: "invalid flow state" } } });
  assert.equal(await back("?code=abc&next=%2Flibrary"), "http://localhost/login?error=1&next=%2Flibrary");
  calls = fakeAuth();
  assert.equal(await back(""), "http://localhost/login?error=1&next=%2F");
  assert.deepEqual(calls, []);
});
