import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { fakeModelDb, mockDns, mockFetch, withGeminiKey } from "../mock-fetch.ts";
import { extract } from "./index.ts";

const db = fakeModelDb();
const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/**
 * A fetch handler that fails every Gemini call with invalid JSON (counting it in `counters.gemini`)
 * and routes anything else to `onOther` (counted in `counters.other` first, so it can tell calls apart by order).
 */
function brokenGeminiHandler(counters: { gemini: number; other: number }, onOther: (url: string) => Response | Promise<Response>) {
  return async (url: string) => {
    if (url.includes("googleapis.com")) {
      counters.gemini++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not valid json" }] } }] }));
    }
    counters.other++;
    return onOther(url);
  };
}

// (a) article kind: FetchError rethrows, metadataOnly is never reached.
test("extract() rethrows FetchError for kind='article' instead of falling back to metadataOnly", async (t) => {
  mockDns(t);
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    return new Response("", { status: 500 });
  });
  try {
    await assert.rejects(() => extract(db, "article", "http://93.184.216.34/post", ""), FetchError);
    assert.equal(calls, 1); // only the one failed article fetch — metadataOnly was never tried
  } finally {
    restore();
  }
});

// (b) a non-article, non-404 extractor failure falls to the article extractor, and its result wins.
test("extract() falls back to the article extractor when github's own extractor fails on a non-404 status", async (t) => {
  mockDns(t);
  const articleHtml = `<!doctype html><html><head><title>Repo mirror</title></head><body><article><h1>Fallback article</h1><p>${"This repository has a long enough description to pass Readability's minimum content length check easily. ".repeat(3)}</p></article></body></html>`;
  const restore = mockFetch(async (url) => (url.includes("api.github.com") ? new Response("", { status: 500 }) : new Response(articleHtml, { headers: { "content-type": "text/html" } })));
  try {
    const result = await extract(db, "github", "https://github.com/owner/repo", "");
    assert.equal(result.blocks[0]?.type, "heading"); // article extraction, not github's own "repo" block
    assert.equal(result.title, "Repo mirror");
    assert.equal(result.meta.extractionFailed, undefined);
  } finally {
    restore();
  }
});

// (c) pdf: skips the article fallback (it would repeat the same Gemini transcription).
test("extract() skips the article fallback for pdf and reaches metadata-only after exactly one Gemini call", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const counters = { gemini: 0, other: 0 };
  const metaHtml = `<!doctype html><html><head><title>Paper landing page</title><meta property="og:description" content="Abstract only."></head><body></body></html>`;
  const restore = mockFetch(
    brokenGeminiHandler(counters, () =>
      counters.other === 1
        ? new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }) // extractPdf's own fetch
        : new Response(metaHtml, { headers: { "content-type": "text/html" } }), // metadataOnly's fetch
    ),
  );
  try {
    const result = await extract(db, "pdf", "http://93.184.216.34/paper.pdf", "");
    assert.equal(counters.gemini, 1);
    assert.equal(counters.other, 2); // extractPdf's fetch + metadataOnly's — an article-fallback attempt would make it 3
    assert.equal(result.meta.extractionFailed, true);
    assert.deepEqual(result.blocks, []);
  } finally {
    restore();
    restoreKey();
  }
});

// (d) every extractor and the article fallback fail, but the page itself is reachable.
test("extract() gives extractionFailed metadata with no blocks when everything fails but the page is reachable", async (t) => {
  mockDns(t);
  const tinyHtml = `<!doctype html><html><head><title>Thin page</title><meta property="og:description" content="A short description."></head><body><p>Too short.</p></body></html>`;
  const restore = mockFetch(async (url) => (url.includes("api.github.com") ? new Response("", { status: 500 }) : new Response(tinyHtml, { headers: { "content-type": "text/html" } })));
  try {
    const result = await extract(db, "github", "https://github.com/owner/repo", "");
    assert.equal(result.meta.extractionFailed, true);
    assert.deepEqual(result.blocks, []);
    assert.equal(result.title, "Thin page");
  } finally {
    restore();
  }
});

// (e) youtube: skips the article fallback (the watch page is JS-rendered) and keeps the video embed.
test("extract() falls to metadata-only with a video block when the youtube extractor's Gemini call fails", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const counters = { gemini: 0, other: 0 };
  const watchHtml = `<!doctype html><html><head><title>A video</title></head><body></body></html>`;
  const restore = mockFetch(
    brokenGeminiHandler(counters, (url) =>
      url.includes("/oembed") ? new Response("", { status: 404 }) : new Response(watchHtml, { headers: { "content-type": "text/html" } }),
    ),
  );
  try {
    const result = await extract(db, "youtube", youtubeUrl, "");
    assert.equal(counters.gemini, 1);
    assert.equal(counters.other, 2); // oEmbed + metadataOnly — an article-fallback attempt would make it 3
    assert.equal(result.meta.extractionFailed, true);
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
    assert.equal((result.blocks[0] as Extract<Block, { type: "video" }>).videoId, "dQw4w9WgXcQ");
  } finally {
    restore();
    restoreKey();
  }
});

// (f) the page is unreachable: metadataOnly itself throws FetchError.
test("extract() throws FetchError from metadataOnly when the page is unreachable after every extractor fails", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("", { status: 503 }));
  try {
    await assert.rejects(() => extract(db, "x", "https://x.com/someone/status/1", ""), FetchError);
  } finally {
    restore();
  }
});
