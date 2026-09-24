import assert from "node:assert/strict";
import { test } from "node:test";
import { FetchError } from "../fetch.ts";
import { fakeDb } from "../fake-db.ts";
import { endlessBody, geminiResponse, geminiText, mockDns, mockFetch, oembedThenBrokenGemini, TEST_IP, withGeminiKey, youtubeUrl } from "../mock-fetch.ts";
import { extract, isHtml, metadataOnly } from "./index.ts";

const db = fakeDb();

/**
 * A fetch handler that fails every Gemini call with invalid JSON (counting it in `counters.gemini`)
 * and routes anything else to `onOther` (counted in `counters.other` first, so it can tell calls apart by order).
 */
function brokenGeminiHandler(counters: { gemini: number; other: number }, onOther: (url: string) => Response | Promise<Response>) {
  return async (url: string) => {
    if (url.includes("googleapis.com")) {
      counters.gemini++;
      return geminiText("not valid json");
    }
    counters.other++;
    return onOther(url);
  };
}

test("extract() rethrows FetchError for kind='article' instead of falling back to metadataOnly", async (t) => {
  mockDns(t);
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    return new Response("", { status: 500 });
  });
  await assert.rejects(() => extract(db, "article", `http://${TEST_IP}/post`, ""), FetchError);
  assert.equal(calls, 1); // only the one failed article fetch — metadataOnly was never tried
});

test("extract() never re-runs extractArticle as its own fallback for kind='article'", async (t) => {
  mockDns(t);
  let calls = 0;
  const tinyHtml = `<!doctype html><html><head><title>Thin</title></head><body><p>too short</p></body></html>`;
  mockFetch(t, async () => {
    calls++;
    return new Response(tinyHtml, { headers: { "content-type": "text/html" } });
  });
  const result = await extract(db, "article", `http://${TEST_IP}/post`, "");
  assert.equal(calls, 2); // extractArticle's own attempt + metadataOnly — never a second extractArticle attempt
  assert.equal(result.meta.extractionFailed, true);
});

test("extract() falls back to the article extractor when github's own extractor fails on a non-404 status", async (t) => {
  mockDns(t);
  const articleHtml = `<!doctype html><html><head><title>Repo mirror</title></head><body><article><h1>Fallback article</h1><p>${"This repository has a long enough description to pass Readability's minimum content length check easily. ".repeat(3)}</p></article></body></html>`;
  mockFetch(t, async (url) => (url.includes("api.github.com") ? new Response("", { status: 500 }) : new Response(articleHtml, { headers: { "content-type": "text/html" } })));
  const result = await extract(db, "github", "https://github.com/owner/repo", "");
  assert.equal(result.blocks[0]?.type, "heading"); // article extraction, not github's own "repo" block
  assert.equal(result.title, "Repo mirror");
  assert.equal(result.meta.extractionFailed, undefined);
});

test("extract() skips the article fallback for pdf and reaches metadata-only after exactly one Gemini call, even over a 2 MB pdf", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const counters = { gemini: 0, other: 0 };
  // Both fetches serve the same realistic, >2 MB pdf: a small placeholder body wouldn't show that
  // metadataOnly never tries to read a non-HTML response as HTML.
  const bigPdf = () => new Response(`%PDF-1.4\n${"A".repeat(2 * 1024 * 1024 + 1024)}`, { headers: { "content-type": "application/pdf" } });
  mockFetch(t, brokenGeminiHandler(counters, () => bigPdf()));
  const result = await extract(db, "pdf", `http://${TEST_IP}/paper.pdf`, "");
  assert.equal(counters.gemini, 1);
  assert.equal(counters.other, 2); // extractPdf's fetch + metadataOnly's — an article-fallback attempt would make it 3
  assert.equal(result.meta.extractionFailed, true);
  assert.deepEqual(result.blocks, []);
  assert.equal(result.title, "paper.pdf"); // metadataOnly never reads a non-HTML body; the URL's filename names it instead
});

test("extract() gives extractionFailed metadata with no blocks when everything fails but the page is reachable", async (t) => {
  mockDns(t);
  const tinyHtml = `<!doctype html><html><head><title>Thin page</title><meta property="og:description" content="A short description."></head><body><p>Too short.</p></body></html>`;
  mockFetch(t, async (url) => (url.includes("api.github.com") ? new Response("", { status: 500 }) : new Response(tinyHtml, { headers: { "content-type": "text/html" } })));
  const result = await extract(db, "github", "https://github.com/owner/repo", "");
  assert.equal(result.meta.extractionFailed, true);
  assert.deepEqual(result.blocks, []);
  assert.equal(result.title, "Thin page");
});

// A youtube Gemini failure is handled inside extractYoutube; extract() just surfaces the result.
test("extract() surfaces extractYoutube's own metadata-only result (video block + extractionFailed) when Gemini fails, without fetching the watch page", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const counter = { calls: 0 };
  mockFetch(t, oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }, counter));
  const result = await extract(db, "youtube", youtubeUrl, "");
  assert.equal(counter.calls, 2); // oEmbed + Gemini only — no third call for the (JS-rendered) watch page
  assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
  assert.equal(result.meta.extractionFailed, true);
});

test("extract() rethrows FetchError('youtube video not found') for kind='youtube' when oEmbed 400s (live: an invalid video id)", async (t) => {
  mockDns(t);
  mockFetch(t, async () => new Response("Bad Request", { status: 400 }));
  await assert.rejects(
    () => extract(db, "youtube", youtubeUrl, ""),
    (error: unknown) => error instanceof FetchError && error.message === "youtube video not found",
  );
});

// An oEmbed 200 whose body isn't a plain JSON object (non-JSON, JSON null, an array or a primitive)
// counts as no info.
test("extract() still calls Gemini and keeps the video block for youtube when oEmbed returns a JSON null body, never fetching the watch page", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const counters = { oembed: 0, gemini: 0, other: 0 };
  mockFetch(t, async (url) => {
    if (url.includes("/oembed")) {
      counters.oembed++;
      return new Response("null", { status: 200 });
    }
    if (url.includes("googleapis.com")) {
      counters.gemini++;
      return geminiResponse({ title: { hu: "C", en: "T" }, summary: { hu: "Ö", en: "S" }, keyPoints: { hu: [], en: [] }, tags: [], chapters: [] });
    }
    counters.other++; // the watch page, if it were ever fetched
    return new Response("", { status: 404 });
  });
  const result = await extract(db, "youtube", youtubeUrl, "");
  assert.equal(counters.oembed, 1);
  assert.equal(counters.gemini, 1);
  assert.equal(counters.other, 0);
  assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
  assert.equal(result.title, youtubeUrl); // no oEmbed title — falls back to the watch URL
});

// Every extractX failure is a FetchError, so extract() rethrows for x instead of falling through
// to a metadata post scraped from the x.com login shell, and only the oEmbed host is ever fetched.
const emptyXPost = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr"></p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/1">January 1, 2025</a></blockquote>`;
const xFailures: [string, () => Response, string?][] = [
  ["a deleted post (oEmbed 404)", () => new Response("", { status: 404 })],
  ["a network error", () => {
    throw new Error("network down");
  }],
  ["an empty post", () => new Response(JSON.stringify({ author_name: "Someone", html: emptyXPost })), "x post has no text"],
  ["an oEmbed 200 with a non-JSON body", () => new Response("not json", { status: 200 })],
  ["an oEmbed 200 with a JSON null body", () => new Response("null", { status: 200 })],
];

for (const [name, answer, message] of xFailures) {
  test(`extract() rethrows FetchError for x on ${name}, fetching only the oEmbed host`, async (t) => {
    mockDns(t);
    let calls = 0;
    mockFetch(t, async () => {
      calls++;
      return answer();
    });
    await assert.rejects(
      () => extract(db, "x", "https://x.com/someone/status/1", ""),
      (error: unknown) => error instanceof FetchError && (!message || error.message === message),
    );
    assert.equal(calls, 1);
  });
}

// The generic "everything unreachable" path: a kind with neither special case (github) still falls
// all the way through to metadataOnly, which itself throws when the page can't be reached at all.
test("extract() throws FetchError from metadataOnly when the page is unreachable after every extractor fails", async (t) => {
  mockDns(t);
  mockFetch(t, async () => new Response("", { status: 503 }));
  await assert.rejects(() => extract(db, "github", "https://github.com/owner/repo", ""), FetchError);
});

test("isHtml treats a missing content-type, case variation and whitespace before the charset all as HTML; a pdf as not", () => {
  assert.equal(isHtml("text/html; charset=UTF-8"), true);
  assert.equal(isHtml("TEXT/HTML"), true);
  assert.equal(isHtml("application/xhtml+xml"), true);
  assert.equal(isHtml(""), true); // missing entirely — the request itself asked for text/html
  assert.equal(isHtml("text/html ; charset=utf-8"), true); // whitespace before the ;
  assert.equal(isHtml("application/pdf"), false);
});

test("metadataOnly cancels the body of a non-HTML response instead of leaving it open", async (t) => {
  mockDns(t);
  const { body, cancelled } = endlessBody();
  mockFetch(t, async () => new Response(body, { headers: { "content-type": "application/pdf" } }));
  await metadataOnly(`http://${TEST_IP}/paper.pdf`);
  assert.equal(cancelled(), true);
});

test("metadataOnly builds a title from the URL's filename for a non-HTML response, without reading the body", async (t) => {
  mockDns(t);
  mockFetch(t, async () => new Response("A".repeat(3_000_000), { headers: { "content-type": "image/png" } }));
  const result = await metadataOnly(`http://${TEST_IP}/reports/annual%20report.png`);
  assert.equal(result.title, "annual report.png");
  assert.equal(result.siteName, TEST_IP);
  assert.equal(result.meta.extractionFailed, true);
  assert.deepEqual(result.blocks, []);
});

// Under the 2 MB cap too, a PDF must never be parsed as (garbage) HTML, which would leave the URL as the title.
test("metadataOnly names a small non-HTML response by its filename too, not by parsing it as HTML", async (t) => {
  mockDns(t);
  mockFetch(t, async () => new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }));
  const result = await metadataOnly(`http://${TEST_IP}/paper.pdf`);
  assert.equal(result.title, "paper.pdf"); // not the URL
});

test("metadataOnly falls back to the URL itself when a non-HTML response has no path segment to name it by", async (t) => {
  mockDns(t);
  mockFetch(t, async () => new Response("binary", { headers: { "content-type": "application/octet-stream" } }));
  const result = await metadataOnly(`http://${TEST_IP}/`);
  assert.equal(result.title, `http://${TEST_IP}/`);
});

test("metadataOnly reads a bounded HTML prefix instead of throwing when the page is over 2 MB, and its text includes the og:description", async (t) => {
  mockDns(t);
  const head = `<head><title>Big page</title><meta property="og:description" content="Still readable."></head>`;
  const html = `<!doctype html><html>${head}<body>${"x".repeat(3_000_000)}</body></html>`;
  mockFetch(t, async () => new Response(html, { headers: { "content-type": "text/html" } }));
  const result = await metadataOnly(`http://${TEST_IP}/big-page`);
  assert.equal(result.title, "Big page");
  assert.ok(result.text.includes("Still readable."));
});
