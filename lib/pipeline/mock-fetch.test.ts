import assert from "node:assert/strict";
import { test } from "node:test";
import { mockFetch, withEnv } from "./mock-fetch.ts";

test("mockFetch and withEnv restore the originals after a test, even one that mocks twice", async (t) => {
  const realFetch = globalThis.fetch;
  const before = process.env.MOCK_FETCH_TEST;
  await t.test("mocks twice", (inner) => {
    mockFetch(inner, () => new Response("first"));
    mockFetch(inner, () => new Response("second"));
    withEnv(inner, "MOCK_FETCH_TEST", "first");
    withEnv(inner, "MOCK_FETCH_TEST", "second");
    assert.equal(process.env.MOCK_FETCH_TEST, "second");
  });
  assert.equal(globalThis.fetch, realFetch);
  assert.equal(process.env.MOCK_FETCH_TEST, before);
});
