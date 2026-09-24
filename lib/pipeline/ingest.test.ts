import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "../blocks.ts";
import { failureUpdate, processSource, removeUnusedMedia, retryPendingSources } from "./ingest.ts";
import { fakeModelDb, geminiResponse, geminiText, mockDns, mockFetch, withGeminiKey, youtubeUrl } from "./mock-fetch.ts";

test("failureUpdate keeps a published post when re-extraction fails", () => {
  assert.deepEqual(failureUpdate(true, "fetch 404"), { error: "fetch 404" });
  assert.deepEqual(failureUpdate(false, "fetch 404"), { status: "failed", error: "fetch 404" });
  assert.equal(failureUpdate(false, "x".repeat(900)).error.length, 500);
});

// --- processSource()/retryPendingSources() wiring: real extract/cleanup/images/summary modules,
// against a fake `sources`/`posts`/storage db and a mocked global fetch (page + Gemini). ---

const HOST = "http://93.184.216.34";
const okSummary = { title: { hu: "Cím", en: "Title" }, summary: { hu: "Összegzés", en: "Summary" }, keyPoints: { hu: [], en: [] }, tags: [] };

const paragraph = (n: number) =>
  `<p>${`Paragraph ${n} carries enough unique sentence content to survive readability parsing and any noise filtering intact. `.repeat(4)}</p>`;
const ARTICLE_HTML = `<!doctype html><html><head><title>A Title</title></head><body><article><h1>A Title</h1>${[1, 2, 3, 4].map(paragraph).join("")}</article></body></html>`;

/** Serves `html` at `HOST` and routes every Gemini call to `cleanupOut` or `summaryOut` by which prompt it is. */
function articleGeminiHandler(html: string, cleanupOut: unknown, summaryOut: unknown = okSummary) {
  return async (url: string, init?: RequestInit) => {
    if (url.startsWith(HOST)) return new Response(html, { headers: { "content-type": "text/html" } });
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
    const prompt = body.contents[0].parts.find((part) => part.text)?.text ?? "";
    return geminiResponse(prompt.includes("NOT part of the article") ? cleanupOut : summaryOut);
  };
}

/** Serves a fake PDF at `HOST` and routes Gemini by whether the call carries `inline_data` (the pdf transcription vs. the later summarize()). */
function pdfGeminiHandler(pdfOut: unknown, summaryOut: unknown = okSummary) {
  return async (url: string, init?: RequestInit) => {
    if (url.startsWith(HOST)) return new Response("%PDF-1.4 fake", { headers: { "content-type": "application/pdf" } });
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { inline_data?: unknown }[] }[] };
    const isPdfCall = body.contents[0].parts.some((part) => "inline_data" in part);
    return geminiResponse(isPdfCall ? pdfOut : summaryOut);
  };
}

test("processSource() success: upserts blocks with mirrored meta and the generated summary, having bumped attempts before the post is written (a)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 1, url: `${HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    await processSource(db, source.id);

    assert.equal(db.postUpserts.length, 1);
    const post = db.postUpserts[0];
    assert.ok(Array.isArray(post.blocks) && (post.blocks as unknown[]).length > 0);
    assert.equal((post.meta as { mirrored: boolean }).mirrored, true);
    assert.equal(post.blocks_hu, null);
    assert.equal(typeof post.extracted_at, "string");
    assert.deepEqual(post.title, okSummary.title);
    assert.deepEqual(post.summary, okSummary.summary);

    assert.ok(db.sourceUpdates.some((u) => u.status === "done" && u.error === null));
    // attempts is bumped before the post is upserted, not after
    assert.ok(db.writes.indexOf("sources.update") < db.writes.indexOf("posts.upsert"));
    assert.deepEqual(db.sourceUpdates[0], { attempts: 1 });
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource() failure: re-extraction that fails writes only { error } when a post already exists, and { status: 'failed', error } when none does (b)", async (t) => {
  mockDns(t);
  const source = { id: 2, url: `${HOST}/gone`, kind: "article", note: null, attempts: 0 };
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    const dbWithPost = fakeModelDb(undefined, { source, post: { id: 9, blocks: [] } });
    await processSource(dbWithPost, source.id);
    assert.equal(dbWithPost.postUpserts.length, 0);
    assert.deepEqual(dbWithPost.sourceUpdates.at(-1), { error: "fetch 404" });

    const dbNoPost = fakeModelDb(undefined, { source, post: null });
    await processSource(dbNoPost, source.id);
    assert.equal(dbNoPost.postUpserts.length, 0);
    assert.deepEqual(dbNoPost.sourceUpdates.at(-1), { status: "failed", error: "fetch 404" });
  } finally {
    restore();
  }
});

test("processSource() noarchive: stores writeNotes' blocks with meta.mirrored false, never the page's own text (c)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 3, url: `${HOST}/private`, kind: "article", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const noarchiveHtml = `<!doctype html><html><head><title>Gated</title><meta name="robots" content="noarchive"></head><body><article><h1>Gated</h1><p>${"Body text that would normally be mirrored but must not be, since this page opted out. ".repeat(6)}</p></article></body></html>`;
  // buildPost() always calls summarize() for title/summary/tags too, even on the noarchive path
  // (only the blocks themselves come from writeNotes) — both Gemini calls need an answer.
  const restore = mockFetch(async (url, init) => {
    if (url.startsWith(HOST)) return new Response(noarchiveHtml, { headers: { "content-type": "text/html" } });
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
    const prompt = body.contents[0].parts.find((part) => part.text)?.text ?? "";
    return geminiResponse(prompt.includes("study notes") ? { sections: [{ heading: "Findings", points: ["Point one", "Point two"] }] } : okSummary);
  });
  try {
    await processSource(db, source.id);
    const post = db.postUpserts[0];
    assert.equal((post.meta as { mirrored: boolean }).mirrored, false);
    const blocks = post.blocks as { type: string; text?: string }[];
    assert.deepEqual(blocks.map((b) => b.type), ["heading", "list"]);
    assert.equal(blocks[0].text, "Findings");
    assert.ok(!JSON.stringify(blocks).includes("would normally be mirrored"));
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource() youtube: an extractor-generated summary means summarize() is never called (d)", async () => {
  const restoreKey = withGeminiKey();
  const source = { id: 4, url: youtubeUrl, kind: "youtube", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const restore = mockFetch(async (url) =>
    url.includes("/oembed")
      ? new Response(JSON.stringify({ title: "A Video", author_name: "A Channel" }))
      : geminiResponse({ ...okSummary, chapters: [] }),
  );
  try {
    await processSource(db, source.id);
    assert.deepEqual(db.tasks, ["ingest_video"]); // no separate "ingest_article" summarize() call
    assert.equal(db.postUpserts.length, 1);
    assert.deepEqual(db.postUpserts[0].title, okSummary.title);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): aiCleanup runs only for html-derived kinds — skipped for pdf and x, called once for article (e)", async () => {
  const restoreKey = withGeminiKey();

  const pdfSource = { id: 5, url: `${HOST}/paper.pdf`, kind: "pdf", note: null, attempts: 0 };
  const pdfDb = fakeModelDb(undefined, { source: pdfSource, post: null });
  const restorePdf = mockFetch(pdfGeminiHandler({ title: "Paper", blocks: [] }));
  try {
    await processSource(pdfDb, pdfSource.id);
    assert.deepEqual(pdfDb.tasks, ["ingest_pdf", "ingest_article"]);
  } finally {
    restorePdf();
  }

  const xSource = { id: 6, url: "https://x.com/someone/status/1", kind: "x", note: null, attempts: 0 };
  const xDb = fakeModelDb(undefined, { source: xSource, post: null });
  const tweetHtml = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">A tweet with enough text to pass extraction.</p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/1">January 1, 2025</a></blockquote>`;
  const restoreX = mockFetch(async (url) =>
    url.includes("publish.twitter.com") ? new Response(JSON.stringify({ author_name: "Someone", html: tweetHtml })) : geminiResponse(okSummary),
  );
  try {
    await processSource(xDb, xSource.id);
    assert.deepEqual(xDb.tasks, ["ingest_article"]);
  } finally {
    restoreX();
  }

  const articleSource = { id: 7, url: `${HOST}/post`, kind: "article", note: null, attempts: 0 };
  const articleDb = fakeModelDb(undefined, { source: articleSource, post: null });
  const restoreArticle = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    await processSource(articleDb, articleSource.id);
    assert.deepEqual(articleDb.tasks, ["ingest_cleanup", "ingest_article"]);
  } finally {
    restoreArticle();
    restoreKey();
  }
});

test("processSource(): a failing ingest_cleanup call leaves the article's blocks unchanged instead of failing the whole post (f)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 8, url: `${HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const restore = mockFetch(async (url, init) => {
    if (url.startsWith(HOST)) return new Response(ARTICLE_HTML, { headers: { "content-type": "text/html" } });
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
    const prompt = body.contents[0].parts.find((part) => part.text)?.text ?? "";
    return prompt.includes("NOT part of the article") ? geminiText("not valid json") : geminiResponse(okSummary);
  });
  try {
    await processSource(db, source.id);
    assert.ok(db.sourceUpdates.some((u) => u.status === "done"));
    assert.equal(db.sourceUpdates.some((u) => u.status === "failed"), false);
    assert.ok((db.postUpserts[0].blocks as unknown[]).length > 0);
  } finally {
    restore();
    restoreKey();
  }
});

test("removeUnusedMedia() removes only storage paths no longer referenced by the blocks (g)", async () => {
  const key = "10/abcdef0123456789";
  const blocks: Block[] = [
    { id: "i1", type: "image", originalUrl: "https://x.test/a.png", alt: "", path: key, format: "avif", widths: [640, 1280] },
  ];
  const db = fakeModelDb(undefined, { media: ["abcdef0123456789-640.avif", "abcdef0123456789-1280.avif", "deadbeefdeadbeef-640.avif"] });
  await removeUnusedMedia(db, 10, blocks);
  assert.deepEqual(db.removedMedia, ["10/deadbeefdeadbeef-640.avif"]);
});

test("processSource(): extractionFailed keeps meta.mirrored false (h)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 11, url: `${HOST}/thin`, kind: "article", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const tinyHtml = `<!doctype html><html><head><title>Thin</title></head><body><p>too short</p></body></html>`;
  const restore = mockFetch(async (url) => (url.includes("googleapis.com") ? geminiResponse(okSummary) : new Response(tinyHtml, { headers: { "content-type": "text/html" } })));
  try {
    await processSource(db, source.id);
    const post = db.postUpserts[0];
    assert.equal((post.meta as { extractionFailed?: boolean }).extractionFailed, true);
    assert.equal((post.meta as { mirrored: boolean }).mirrored, false);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): a source over the block/char limits gets meta.clipped (i)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 12, url: `${HOST}/paper.pdf`, kind: "pdf", note: null, attempts: 0 };
  const db = fakeModelDb(undefined, { source, post: null });
  const restore = mockFetch(
    pdfGeminiHandler({
      title: "Huge",
      blocks: [{ type: "paragraph", text: "A".repeat(210_000) }, { type: "paragraph", text: "tail" }],
    }),
  );
  try {
    await processSource(db, source.id);
    const post = db.postUpserts[0];
    assert.equal((post.meta as { clipped?: boolean }).clipped, true);
    assert.equal((post.blocks as unknown[]).length, 1); // only the first (huge) block survives the clip
  } finally {
    restore();
    restoreKey();
  }
});

test("retryPendingSources() stops starting new sources once the deadline is too close, without touching any of them (j)", async () => {
  const db = fakeModelDb(undefined, { pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const processed = await retryPendingSources(db, Date.now() - 1);
  assert.equal(processed, 0);
  assert.deepEqual(db.sourceUpdates, []); // no source was ever started
});
