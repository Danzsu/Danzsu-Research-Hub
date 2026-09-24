import assert from "node:assert/strict";
import { test } from "node:test";
import { FetchError } from "../fetch.ts";
import { fakeDb, geminiResponse, geminiText, mockDns, mockFetch, oembedThenBrokenGemini, withGeminiKey, youtubeUrl } from "../mock-fetch.ts";
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

// (I7) article's own extractor never gets a second, redundant attempt as its own "fallback".
test("extract() never re-runs extractArticle as its own fallback for kind='article' (I7)", async (t) => {
  mockDns(t);
  let calls = 0;
  const tinyHtml = `<!doctype html><html><head><title>Thin</title></head><body><p>too short</p></body></html>`;
  const restore = mockFetch(async () => {
    calls++;
    return new Response(tinyHtml, { headers: { "content-type": "text/html" } });
  });
  try {
    const result = await extract(db, "article", "http://93.184.216.34/post", "");
    assert.equal(calls, 2); // extractArticle's own attempt + metadataOnly — never a second extractArticle attempt
    assert.equal(result.meta.extractionFailed, true);
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

// (c) pdf: skips the article fallback, and metadata-only must not choke on a realistic, oversized PDF.
test("extract() skips the article fallback for pdf and reaches metadata-only after exactly one Gemini call, even over a 2 MB pdf (fix round 1, item 1)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const counters = { gemini: 0, other: 0 };
  // Both fetches serve the same realistic, >2 MB pdf — a lying/small placeholder body wouldn't
  // exercise the bug (metadataOnly used to try to read the whole thing as HTML and throw).
  const bigPdf = () => new Response(`%PDF-1.4\n${"A".repeat(2 * 1024 * 1024 + 1024)}`, { headers: { "content-type": "application/pdf" } });
  const restore = mockFetch(brokenGeminiHandler(counters, () => bigPdf()));
  try {
    const result = await extract(db, "pdf", "http://93.184.216.34/paper.pdf", "");
    assert.equal(counters.gemini, 1);
    assert.equal(counters.other, 2); // extractPdf's fetch + metadataOnly's — an article-fallback attempt would make it 3
    assert.equal(result.meta.extractionFailed, true);
    assert.deepEqual(result.blocks, []);
    assert.equal(result.title, "paper.pdf"); // metadataOnly never reads a non-HTML body; the URL's filename names it instead
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

// (e) youtube: a Gemini failure is handled by extractYoutube itself now — extract() just surfaces it.
test("extract() surfaces extractYoutube's own metadata-only result (video block + extractionFailed) when Gemini fails, without fetching the watch page", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const counter = { calls: 0 };
  const restore = mockFetch(oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }, counter));
  try {
    const result = await extract(db, "youtube", youtubeUrl, "");
    assert.equal(counter.calls, 2); // oEmbed + Gemini only — no third call for the (JS-rendered) watch page
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
    assert.equal(result.meta.extractionFailed, true);
  } finally {
    restore();
    restoreKey();
  }
});

test("extract() rethrows FetchError('youtube video not found') for kind='youtube' when oEmbed 400s (live: an invalid video id)", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("Bad Request", { status: 400 }));
  try {
    await assert.rejects(
      () => extract(db, "youtube", youtubeUrl, ""),
      (error: unknown) => error instanceof FetchError && error.message === "youtube video not found",
    );
  } finally {
    restore();
  }
});

// fix round 3, item 1: an oEmbed 200 whose body isn't a plain JSON object (non-JSON, JSON null, or a
// JSON array/primitive) is the rest of round-2 item 2 — closed here for youtube's null case below too.
test("extract() still calls Gemini and keeps the video block for youtube when oEmbed returns a JSON null body, never fetching the watch page", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const counters = { oembed: 0, gemini: 0, other: 0 };
  const restore = mockFetch(async (url) => {
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
  try {
    const result = await extract(db, "youtube", youtubeUrl, "");
    assert.equal(counters.oembed, 1);
    assert.equal(counters.gemini, 1);
    assert.equal(counters.other, 0);
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
    assert.equal(result.title, youtubeUrl); // no oEmbed title — falls back to the watch URL
  } finally {
    restore();
    restoreKey();
  }
});

// (f) a deleted/nonexistent X post: FetchError from extract(), fetching only the oEmbed host.
test("extract() rethrows FetchError for a deleted X post (oEmbed 404), fetching only the oEmbed host", async (t) => {
  mockDns(t);
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    return new Response("", { status: 404 });
  });
  try {
    await assert.rejects(() => extract(db, "x", "https://x.com/someone/status/1", ""), FetchError);
    assert.equal(calls, 1); // only the oEmbed request — x has no article fallback and never reaches metadataOnly
  } finally {
    restore();
  }
});

// fix round 2, item 2: every extractX failure is a FetchError, so extract() rethrows for x instead
// of falling through to a metadata post scraped from the x.com login shell.
test("extract() rethrows FetchError for an x network error (oEmbed fetch itself fails), fetching only the oEmbed host", async (t) => {
  mockDns(t);
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    throw new Error("network down");
  });
  try {
    await assert.rejects(() => extract(db, "x", "https://x.com/someone/status/1", ""), FetchError);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("extract() rethrows FetchError('x post has no text') for an empty x post, fetching only the oEmbed host", async (t) => {
  mockDns(t);
  let calls = 0;
  const emptyPost = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr"></p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/1">January 1, 2025</a></blockquote>`;
  const restore = mockFetch(async () => {
    calls++;
    return new Response(JSON.stringify({ author_name: "Someone", html: emptyPost }));
  });
  try {
    await assert.rejects(
      () => extract(db, "x", "https://x.com/someone/status/1", ""),
      (error: unknown) => error instanceof FetchError && error.message === "x post has no text",
    );
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("extract() rethrows FetchError for an x oEmbed 200 with a non-JSON body, fetching only the oEmbed host", async (t) => {
  mockDns(t);
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    return new Response("not json", { status: 200 });
  });
  try {
    await assert.rejects(() => extract(db, "x", "https://x.com/someone/status/1", ""), FetchError);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("extract() rethrows FetchError for an x oEmbed 200 with a JSON null body, fetching only the oEmbed host", async (t) => {
  mockDns(t);
  let calls = 0;
  const restore = mockFetch(async () => {
    calls++;
    return new Response("null", { status: 200 });
  });
  try {
    await assert.rejects(() => extract(db, "x", "https://x.com/someone/status/1", ""), FetchError);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

// The generic "everything unreachable" path: a kind with neither special case (github) still falls
// all the way through to metadataOnly, which itself throws when the page can't be reached at all.
test("extract() throws FetchError from metadataOnly when the page is unreachable after every extractor fails", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("", { status: 503 }));
  try {
    await assert.rejects(() => extract(db, "github", "https://github.com/owner/repo", ""), FetchError);
  } finally {
    restore();
  }
});

// fix round 2, item 3.
test("isHtml treats a missing content-type, case variation and whitespace before the charset all as HTML; a pdf as not", () => {
  assert.equal(isHtml("text/html; charset=UTF-8"), true);
  assert.equal(isHtml("TEXT/HTML"), true);
  assert.equal(isHtml("application/xhtml+xml"), true);
  assert.equal(isHtml(""), true); // missing entirely — the request itself asked for text/html
  assert.equal(isHtml("text/html ; charset=utf-8"), true); // whitespace before the ;
  assert.equal(isHtml("application/pdf"), false);
});

// fix round 2, item 4: cancelBody was called in metadataOnly's non-HTML branch, but nothing
// verified the cancel actually fired — only that the right (filename) title came out.
test("metadataOnly cancels the body of a non-HTML response instead of leaving it open", async (t) => {
  mockDns(t);
  let cancelled = false;
  const body = new ReadableStream({ cancel: () => { cancelled = true; } });
  const restore = mockFetch(async () => new Response(body, { headers: { "content-type": "application/pdf" } }));
  try {
    await metadataOnly("http://93.184.216.34/paper.pdf");
    assert.equal(cancelled, true);
  } finally {
    restore();
  }
});

// metadataOnly, tested directly (fix round 1, item 1).
test("metadataOnly builds a title from the URL's filename for a non-HTML response, without reading the body", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("A".repeat(3_000_000), { headers: { "content-type": "image/png" } }));
  try {
    const result = await metadataOnly("http://93.184.216.34/reports/annual%20report.png");
    assert.equal(result.title, "annual report.png");
    assert.equal(result.siteName, "93.184.216.34");
    assert.equal(result.meta.extractionFailed, true);
    assert.deepEqual(result.blocks, []);
  } finally {
    restore();
  }
});

// P1's second symptom: under the 2 MB cap, the old code had no content-type check at all, so the PDF
// bytes were parsed as (garbage) HTML and the title silently fell back to the URL.
test("metadataOnly names a small non-HTML response by its filename too, not by parsing it as HTML", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }));
  try {
    const result = await metadataOnly("http://93.184.216.34/paper.pdf");
    assert.equal(result.title, "paper.pdf"); // not the URL — the old bug's symptom
  } finally {
    restore();
  }
});

test("metadataOnly falls back to the URL itself when a non-HTML response has no path segment to name it by", async (t) => {
  mockDns(t);
  const restore = mockFetch(async () => new Response("binary", { headers: { "content-type": "application/octet-stream" } }));
  try {
    const result = await metadataOnly("http://93.184.216.34/");
    assert.equal(result.title, "http://93.184.216.34/");
  } finally {
    restore();
  }
});

test("metadataOnly reads a bounded HTML prefix instead of throwing when the page is over 2 MB, and its text includes the og:description (I10)", async (t) => {
  mockDns(t);
  const head = `<head><title>Big page</title><meta property="og:description" content="Still readable."></head>`;
  const html = `<!doctype html><html>${head}<body>${"x".repeat(3_000_000)}</body></html>`;
  const restore = mockFetch(async () => new Response(html, { headers: { "content-type": "text/html" } }));
  try {
    const result = await metadataOnly("http://93.184.216.34/big-page");
    assert.equal(result.title, "Big page");
    assert.ok(result.text.includes("Still readable."));
  } finally {
    restore();
  }
});
