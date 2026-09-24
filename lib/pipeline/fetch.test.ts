import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { test, type TestContext } from "node:test";
import { apiFetch, ensureOk, FetchError, readLimited, safeFetch, USER_AGENT } from "./fetch.ts";
import { mockFetch, TEST_HOST } from "./mock-fetch.ts";

// A public IP literal: dns.lookup() resolves it locally without a real DNS query, so these
// run offline. The mocked global fetch stands in for the actual network hop.
const PUB = TEST_HOST;

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

/**
 * Redirects only the first call (the public start URL) to `location`; every other URL — in
 * particular the blocked hop itself, if the guard fails to stop it — gets a plain 200. A mock
 * that redirects unconditionally would mask a broken guard behind "too many redirects" instead
 * of the real rejection, so this shape is what actually pins the SSRF check.
 */
function redirectOnceThenOk(t: TestContext, location: string): string[] {
  const calls: string[] = [];
  mockFetch(t, async (url) => {
    calls.push(url);
    return url === `${PUB}/a` ? redirect(location) : new Response("ok");
  });
  return calls;
}

test("safeFetch blocks a redirect to a loopback address", async (t) => {
  const calls = redirectOnceThenOk(t, "http://127.0.0.1/admin");
  await assert.rejects(() => safeFetch(`${PUB}/a`), (error: unknown) => error instanceof FetchError && /blocked/.test(error.message));
  assert.equal(calls.length, 1); // the blocked hop must never actually be fetched
});

test("safeFetch blocks a redirect to the cloud metadata address", async (t) => {
  const calls = redirectOnceThenOk(t, "http://169.254.169.254/latest/meta-data/");
  await assert.rejects(() => safeFetch(`${PUB}/a`), (error: unknown) => error instanceof FetchError && /blocked/.test(error.message));
  assert.equal(calls.length, 1);
});

test("safeFetch checks each hop's DNS-resolved address, not only its hostname", async (t) => {
  // parseSubmittedUrl already rejects private IP literals, so only a hostname that resolves to a
  // private (here CGNAT) address can reach the post-lookup check in checkedHop.
  t.mock.method(dns, "lookup", async (host: string) => [{ address: host === "internal.test" ? "100.64.0.1" : host, family: 4 }]);
  const calls = redirectOnceThenOk(t, "http://internal.test/");
  await assert.rejects(() => safeFetch(`${PUB}/a`), (error: unknown) => error instanceof FetchError && error.message === "blocked address");
  assert.equal(calls.length, 1);
});

test("safeFetch blocks a redirect to a file: URL via the parseSubmittedUrl guard", async (t) => {
  const calls = redirectOnceThenOk(t, "file:///etc/passwd");
  // The exact message the non-http(s) guard produces — not just "some FetchError" — so a
  // guard that silently falls through to `new URL(raw)` instead of rejecting still fails this.
  await assert.rejects(() => safeFetch(`${PUB}/a`), (error: unknown) => error instanceof FetchError && error.message === "blocked url");
  assert.equal(calls.length, 1);
});

/** Redirects for the first `n` calls, then 200s — lets the redirect-hop cap be pinned exactly. */
function redirectChain(n: number) {
  let calls = 0;
  return async () => {
    calls++;
    return calls <= n ? redirect(`${PUB}/hop${calls}`) : new Response("ok");
  };
}

test("safeFetch follows redirects up to its cap and succeeds", async (t) => {
  mockFetch(t, redirectChain(4)); // 4 redirects then a 200 fits within the cap
  const response = await safeFetch(`${PUB}/a`);
  assert.equal(await response.text(), "ok");
});

test("safeFetch gives up one hop past its cap with 'too many redirects'", async (t) => {
  mockFetch(t, redirectChain(5)); // the 6th call (the 200) is never reached
  await assert.rejects(
    () => safeFetch(`${PUB}/a`),
    (error: unknown) => error instanceof FetchError && /too many redirects/.test(error.message),
  );
});

test("safeFetch treats a malformed redirect Location as blocked, not a crash", async (t) => {
  mockFetch(t, async () => redirect("http://["));
  await assert.rejects(() => safeFetch(`${PUB}/a`), FetchError);
});

test("safeFetch cancels the body of an intermediate redirect response", async (t) => {
  let cancelled = false;
  let hop = 0;
  mockFetch(t, async () => {
    hop++;
    if (hop === 1) return new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { status: 302, headers: { location: `${PUB}/b` } });
    return new Response("ok");
  });
  const response = await safeFetch(`${PUB}/a`);
  assert.equal(await response.text(), "ok");
  assert.equal(cancelled, true);
});

test("readLimited cancels the body when the declared content-length exceeds the limit", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull: (controller) => controller.enqueue(new Uint8Array(10)),
    cancel: () => { cancelled = true; },
  });
  const response = new Response(body, { headers: { "content-length": String(10 * 1024 * 1024) } });
  await assert.rejects(() => readLimited(response, 5 * 1024 * 1024), /larger than/);
  assert.equal(cancelled, true);
});

test("readLimited rejects a body that outgrows a lying content-length, and cancels the stream", async () => {
  // A stream fully buffered-and-closed before the limit check runs has already reached the
  // spec's terminal "closed" state, where cancel() is a no-op — so this stays open via pull(),
  // still mid-flight when the size cap trips.
  let cancelled = false;
  const body = new ReadableStream({
    pull: (controller) => controller.enqueue(new Uint8Array(1024 * 1024)),
    cancel: () => { cancelled = true; },
  });
  const response = new Response(body, { headers: { "content-length": "10" } });
  await assert.rejects(() => readLimited(response, 5 * 1024 * 1024), /larger than/);
  assert.equal(cancelled, true);
});

test("readLimited wraps a mid-stream read failure as FetchError", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
      controller.error(new TypeError("terminated"));
    },
  });
  await assert.rejects(() => readLimited(new Response(body), 5 * 1024 * 1024), FetchError);
});

test("readLimited wraps an aborted read as FetchError", async () => {
  const body = new ReadableStream({
    pull: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
  });
  await assert.rejects(() => readLimited(new Response(body), 5 * 1024 * 1024), FetchError);
});

test("readLimited with `truncate` returns the prefix read so far instead of throwing, on both a lying content-length and an oversized stream", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull: (controller) => controller.enqueue(new Uint8Array(1024 * 1024)),
    cancel: () => { cancelled = true; },
  });
  // A declared content-length far over the limit would normally reject before a single byte is read.
  const response = new Response(body, { headers: { "content-length": String(10 * 1024 * 1024) } });
  const result = await readLimited(response, 2 * 1024 * 1024, { truncate: true });
  assert.ok(result.length > 0 && result.length <= 2 * 1024 * 1024);
  assert.equal(cancelled, true); // the rest of the stream is still released, not left hanging
});

test("ensureOk passes an ok response through and otherwise cancels the body and throws FetchError('<label> <status>')", async () => {
  const ok = new Response("fine");
  assert.equal(await ensureOk(ok, "github"), ok);
  let cancelled = false;
  const gone = new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), { status: 404 });
  await assert.rejects(() => ensureOk(gone, "github"), (error: unknown) => error instanceof FetchError && error.message === "github 404");
  assert.equal(cancelled, true);
});

test("apiFetch sends this app's user agent and keeps the caller's own headers", async (t) => {
  let headers: Record<string, string> = {};
  mockFetch(t, async (_url, init) => {
    headers = init?.headers as Record<string, string>;
    return new Response("ok");
  });
  await apiFetch("https://api.github.com/x", { headers: { accept: "application/json" } });
  assert.deepEqual(headers, { "user-agent": USER_AGENT, accept: "application/json" });
});
