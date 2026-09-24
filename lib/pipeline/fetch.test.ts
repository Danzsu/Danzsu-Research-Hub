import assert from "node:assert/strict";
import { test } from "node:test";
import { FetchError, readLimited, safeFetch } from "./fetch.ts";
import { mockFetch } from "./mock-fetch.ts";

// A public IP literal: dns.lookup() resolves it locally without a real DNS query, so these
// run offline. The mocked global fetch stands in for the actual network hop.
const PUB = "http://93.184.216.34";

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

test("safeFetch blocks a redirect to a loopback address", async () => {
  const restore = mockFetch(async () => redirect("http://127.0.0.1/admin"));
  try {
    await assert.rejects(() => safeFetch(`${PUB}/a`), FetchError);
  } finally {
    restore();
  }
});

test("safeFetch blocks a redirect to the cloud metadata address", async () => {
  const restore = mockFetch(async () => redirect("http://169.254.169.254/latest/meta-data/"));
  try {
    await assert.rejects(() => safeFetch(`${PUB}/a`), FetchError);
  } finally {
    restore();
  }
});

test("safeFetch blocks a redirect to a file: URL", async () => {
  const restore = mockFetch(async () => redirect("file:///etc/passwd"));
  try {
    await assert.rejects(() => safeFetch(`${PUB}/a`), FetchError);
  } finally {
    restore();
  }
});

test("safeFetch gives up after too many redirect hops", async () => {
  const restore = mockFetch(async () => redirect(`${PUB}/next`));
  try {
    await assert.rejects(
      () => safeFetch(`${PUB}/a`),
      (error: unknown) => error instanceof FetchError && /too many redirects/.test(error.message),
    );
  } finally {
    restore();
  }
});

test("safeFetch treats a malformed redirect Location as blocked, not a crash", async () => {
  const restore = mockFetch(async () => redirect("http://["));
  try {
    await assert.rejects(() => safeFetch(`${PUB}/a`), FetchError);
  } finally {
    restore();
  }
});

test("safeFetch cancels the body of an intermediate redirect response", async () => {
  let cancelled = false;
  let hop = 0;
  const restore = mockFetch(async () => {
    hop++;
    if (hop === 1) return new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { status: 302, headers: { location: `${PUB}/b` } });
    return new Response("ok");
  });
  try {
    const response = await safeFetch(`${PUB}/a`);
    assert.equal(await response.text(), "ok");
    assert.equal(cancelled, true);
  } finally {
    restore();
  }
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
