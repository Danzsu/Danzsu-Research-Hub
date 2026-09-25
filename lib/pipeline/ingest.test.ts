import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import sharp from "sharp";
import type { Block } from "../blocks.ts";
import { IMAGE_BUDGET_MS } from "./images.ts";
import {
  failureUpdate,
  imageBudgetFor,
  processSource,
  removeUnusedMedia,
  retryPendingSources,
  START_GATE_RESERVE_MS,
  SUMMARY_RESERVE_MS,
} from "./ingest.ts";
import { fakeDb } from "./fake-db.ts";
import { geminiPrompt, geminiResponse, geminiText, mockDns, mockFetch, TEST_HOST, withGeminiKey, youtubeUrl } from "./mock-fetch.ts";

test("failureUpdate keeps a published post when re-extraction fails", () => {
  assert.deepEqual(failureUpdate(true, "fetch 404"), { error: "fetch 404" });
  assert.deepEqual(failureUpdate(false, "fetch 404"), { status: "failed", error: "fetch 404" });
  assert.equal(failureUpdate(false, "x".repeat(900)).error.length, 500);
});

test("imageBudgetFor(): shrinks toward the deadline, floors at 0, and is capped at IMAGE_BUDGET_MS", () => {
  const now = 1_000_000;
  assert.equal(imageBudgetFor(undefined, now), undefined);
  assert.equal(imageBudgetFor(now + 10 * 60_000, now), IMAGE_BUDGET_MS); // 10 minutes out: capped, not the full remainder
  assert.equal(imageBudgetFor(now + SUMMARY_RESERVE_MS + 5_000, now), 5_000); // close to the deadline: shrinks below the cap
  assert.equal(imageBudgetFor(now + 1_000, now), 0); // inside the reserve: floored at 0, never negative
});

// --- processSource()/retryPendingSources() wiring: real extract/cleanup/images/summary modules,
// against a fake `sources`/`posts`/storage db and a mocked global fetch (page + Gemini). ---

const okSummary = { title: { hu: "Cím", en: "Title" }, summary: { hu: "Összegzés", en: "Summary" }, keyPoints: { hu: [], en: [] }, tags: [] };

/** A never-attempted submission served from TEST_HOST. */
const newSource = (id: number, kind = "article", path = "post") => ({ id, url: `${TEST_HOST}/${path}`, kind, note: null, attempts: 0 });

const paragraph = (n: number) =>
  `<p>${`Paragraph ${n} carries enough unique sentence content to survive readability parsing and any noise filtering intact. `.repeat(4)}</p>`;
const ARTICLE_HTML = `<!doctype html><html><head><title>A Title</title></head><body><article><h1>A Title</h1>${[1, 2, 3, 4].map(paragraph).join("")}</article></body></html>`;

/** Article HTML (the same 4 paragraphs) plus one `<img>`, for tests that mirror exactly one image. */
const oneImageHtml = (imgUrl: string) =>
  `<!doctype html><html><head><title>Img</title></head><body><article><h1>Img</h1>${[1, 2, 3, 4].map(paragraph).join("")}<img src="${imgUrl}" alt="pic"></article></body></html>`;

/** Article HTML with `n` `<img>` tags at `${TEST_HOST}/<i>.png`, for tests over mirrorImages' own concurrency of 4 (so a real second wave exists). */
const manyImagesHtml = (n: number) => {
  const imgTags = Array.from({ length: n }, (_, i) => `<img src="${TEST_HOST}/${i}.png" alt="${i}">`).join("");
  return `<!doctype html><html><head><title>Img</title></head><body><article><h1>Img</h1>${[1, 2].map(paragraph).join("")}${imgTags}</article></body></html>`;
};

const testPng = () => sharp({ create: { width: 300, height: 200, channels: 3, background: "#f15f22" } }).png().toBuffer();

/** A source whose extraction failed always gets these two meta flags, whatever the kind. */
function assertExtractionFailedNotMirrored(post: Record<string, unknown>) {
  assert.equal((post.meta as { extractionFailed?: boolean }).extractionFailed, true);
  assert.equal((post.meta as { mirrored: boolean }).mirrored, false);
}

/** Serves `html` at TEST_HOST and routes every Gemini call to `cleanupOut` or `summaryOut` by which prompt it is. */
function articleGeminiHandler(html: string, cleanupOut: unknown, summaryOut: unknown = okSummary) {
  return async (url: string, init?: RequestInit) => {
    if (url.startsWith(TEST_HOST)) return new Response(html, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    return geminiResponse(prompt.includes("NOT part of the article") ? cleanupOut : summaryOut);
  };
}

/** Serves a fake PDF at TEST_HOST and routes Gemini by whether the call carries `inline_data` (the pdf transcription vs. the later summarize()). */
function pdfGeminiHandler(pdfOut: unknown, summaryOut: unknown = okSummary) {
  return async (url: string, init?: RequestInit) => {
    if (url.startsWith(TEST_HOST)) return new Response("%PDF-1.4 fake", { headers: { "content-type": "application/pdf" } });
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { inline_data?: unknown }[] }[] };
    const isPdfCall = body.contents[0].parts.some((part) => "inline_data" in part);
    return geminiResponse(isPdfCall ? pdfOut : summaryOut);
  };
}

/** Runs processSource on a fresh article source against ARTICLE_HTML, with a cleanup that removes nothing. */
async function processArticle(t: TestContext, id: number) {
  mockDns(t);
  withGeminiKey(t);
  const db = fakeDb(undefined, { source: newSource(id), post: null });
  mockFetch(t, articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  await processSource(db, id);
  return db;
}

// A noarchive page that also carries an `<img>`, so the noarchive tests can pin that nothing is
// mirrored — not just that the resulting blocks have no image type, but that the image is never
// even downloaded (the handler counts any attempt, so no real request can go out).
const NOARCHIVE_IMG_URL = `${TEST_HOST}/gated.png`;
const NOARCHIVE_HTML = `<!doctype html><html><head><title>Gated</title><meta name="robots" content="noarchive"></head><body><article><h1>Gated</h1><p>${"Body text that would normally be mirrored but must not be, since this page opted out. ".repeat(6)}</p><img src="${NOARCHIVE_IMG_URL}" alt="gated"></article></body></html>`;

function noarchiveGeminiHandler(sectionsOut: unknown, onImageFetch: () => void, summaryOut: unknown = okSummary) {
  return async (url: string, init?: RequestInit) => {
    if (url === NOARCHIVE_IMG_URL) {
      onImageFetch();
      return new Response(await testPng(), { headers: { "content-type": "image/png" } });
    }
    if (url.startsWith(TEST_HOST)) return new Response(NOARCHIVE_HTML, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    return geminiResponse(prompt.includes("study notes") ? sectionsOut : summaryOut);
  };
}

test("processSource() success: upserts blocks with mirrored meta and the generated summary, having bumped attempts before the post is written", async (t) => {
  const db = await processArticle(t, 1);

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
});

test("processSource(): the post upsert uses onConflict: source_id and writes exactly these keys, and the existing post is looked up by source_id", async (t) => {
  const db = await processArticle(t, 2);
  assert.deepEqual(db.postUpsertOptions[0], { onConflict: "source_id" });
  assert.deepEqual(
    Object.keys(db.postUpserts[0]).sort(),
    [
      "author",
      "blocks",
      "blocks_hu",
      "extracted_at",
      "key_points",
      "kind",
      "meta",
      "published_at",
      "source_id",
      "source_site",
      "summary",
      "tags",
      "title",
      "url",
    ],
  );
  assert.ok(db.eqCalls.some((c) => c.table === "posts" && c.column === "source_id"));
});

test("processSource(): attempts is bumped before any extraction fetch", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const source = newSource(3);
  const db = fakeDb(undefined, { source, post: null });
  const handler = articleGeminiHandler(ARTICLE_HTML, { remove: [] });
  mockFetch(t, (url, init) => {
    db.writes.push("fetch");
    return handler(url, init);
  });
  await processSource(db, source.id);
  assert.ok(db.writes.indexOf("sources.update") < db.writes.indexOf("fetch"));
});

test("processSource(): removeUnusedMedia runs after the post upsert, never before", async (t) => {
  const db = await processArticle(t, 4);
  assert.ok(db.writes.indexOf("posts.upsert") < db.writes.indexOf("storage.list"));
});

test("processSource(): on success, storage.remove takes only unreferenced media — referenced paths stay", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const html = oneImageHtml(`${TEST_HOST}/pic.png`);
  const source = newSource(5);
  // A stale object from an earlier version of this source's media, no longer referenced by anything.
  const db = fakeDb(undefined, { source, post: null, media: ["stale0123456789ab-640.avif"] });
  const png = await testPng();
  mockFetch(t, async (url, init) =>
    url.endsWith(".png") ? new Response(png, { headers: { "content-type": "image/png" } }) : articleGeminiHandler(html, { remove: [] })(url, init),
  );
  await processSource(db, source.id);
  assert.deepEqual(db.removedMedia, ["5/stale0123456789ab-640.avif"]); // only the stale one
  const image = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).find((b) => b.type === "image");
  assert.ok(image?.path); // the newly mirrored image was never removed
});

test("processSource(): a previously mirrored image is reused by originalUrl instead of re-downloaded", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const imgUrl = `${TEST_HOST}/pic.png`;
  const html = oneImageHtml(imgUrl);
  const source = newSource(6);
  const previousBlocks = [
    { id: "img1", type: "image", originalUrl: imgUrl, alt: "pic", path: "6/cafef00dcafef00d", format: "avif", widths: [640, 1280] },
  ];
  const db = fakeDb(undefined, { source, post: { id: 1, blocks: previousBlocks }, media: ["cafef00dcafef00d-640.avif", "cafef00dcafef00d-1280.avif"] });
  let imageFetches = 0;
  mockFetch(t, async (url, init) => {
    if (url === imgUrl) {
      imageFetches++;
      return new Response(await testPng(), { headers: { "content-type": "image/png" } });
    }
    return articleGeminiHandler(html, { remove: [] })(url, init);
  });
  await processSource(db, source.id);
  assert.equal(imageFetches, 0); // reused by originalUrl, never re-downloaded
  const image = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).find((b) => b.type === "image");
  assert.equal(image?.path, "6/cafef00dcafef00d");
});

test("processSource() failure: re-extraction that fails writes only { error } when a post already exists, and { status: 'failed', error } when none does", async (t) => {
  mockDns(t);
  const source = newSource(7, "article", "gone");
  mockFetch(t, async () => new Response("", { status: 404 }));
  const dbWithPost = fakeDb(undefined, { source, post: { id: 9, blocks: [] } });
  await processSource(dbWithPost, source.id);
  assert.equal(dbWithPost.postUpserts.length, 0);
  assert.deepEqual(dbWithPost.sourceUpdates.at(-1), { error: "fetch 404" });

  const dbNoPost = fakeDb(undefined, { source, post: null });
  await processSource(dbNoPost, source.id);
  assert.equal(dbNoPost.postUpserts.length, 0);
  assert.deepEqual(dbNoPost.sourceUpdates.at(-1), { status: "failed", error: "fetch 404" });
});

test("processSource(): a failure with an existing post leaves its mirrored images alone, removing only the true orphan", async (t) => {
  mockDns(t);
  const source = newSource(8, "article", "gone");
  const existingBlocks = [
    { id: "img1", type: "image", originalUrl: "https://old.test/pic.png", alt: "pic", path: "8/aaaaaaaaaaaaaaaa", format: "avif", widths: [640] },
  ];
  const db = fakeDb(undefined, {
    source,
    post: { id: 1, blocks: existingBlocks },
    media: ["aaaaaaaaaaaaaaaa-640.avif", "orphanbbbbbbbbbb-640.avif"],
  });
  mockFetch(t, async () => new Response("", { status: 404 }));
  await processSource(db, source.id);
  assert.deepEqual(db.removedMedia, ["8/orphanbbbbbbbbbb-640.avif"]); // the still-referenced image is left alone
  assert.deepEqual(db.sourceUpdates.at(-1), { error: "fetch 404" }); // an existing post -> only { error }, status untouched
});

test("processSource(): the failure-path media cleanup swallows its own errors, never masking the real failure message", async (t) => {
  mockDns(t);
  const source = newSource(9, "article", "gone");
  const db = fakeDb(undefined, { source, post: null, storageError: true });
  mockFetch(t, async () => new Response("", { status: 404 }));
  await processSource(db, source.id);
  assert.deepEqual(db.sourceUpdates.at(-1), { status: "failed", error: "fetch 404" });
});

test("processSource(): a failure after an image upload removes the orphaned upload without masking the original error (orphaned uploads)", async (t) => {
  withGeminiKey(t);
  const html = oneImageHtml(`${TEST_HOST}/pic.png`);
  const source = newSource(10);
  const db = fakeDb(undefined, { source, post: null });
  const png = await testPng();
  mockFetch(t, async (url, init) =>
    url.endsWith(".png")
      ? new Response(png, { headers: { "content-type": "image/png" } })
      : articleGeminiHandler(html, { remove: [] }, "not a valid summary")(url, init),
  );
  await processSource(db, source.id);
  assert.equal(db.postUpserts.length, 0); // the post itself was never saved — summarize() failed
  assert.ok(db.removedMedia.length > 0); // but the image it uploaded along the way did not stay orphaned
  const failureWrite = db.sourceUpdates.at(-1);
  assert.equal(failureWrite?.status, "failed");
  assert.ok(typeof failureWrite?.error === "string" && failureWrite.error.length > 0);
});

test("processSource(): the failure-path media cleanup never re-runs once the post upsert has succeeded, and the saved post keeps its status", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  // No <img>, so buildPost never touches storage — the post upsert succeeds cleanly, and the
  // *success*-path removeUnusedMedia call right after it is the storage fake's very first call.
  // No existing post either, so the only reason `{ error }` (not `{ status: "failed", error }`)
  // could come out is `saved` itself — Boolean(existing) alone would be false here.
  const source = newSource(11);
  const db = fakeDb(undefined, { source, post: null, storageError: true });
  mockFetch(t, articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  await processSource(db, source.id);
  assert.equal(db.postUpserts.length, 1); // the upsert itself succeeded
  assert.equal(db.writes.filter((w) => w === "storage.list").length, 1); // only the success-path attempt — no repeat from the catch
  assert.deepEqual(db.sourceUpdates.at(-1), { error: "storage down" }); // saved: status is left alone, only the error is recorded
});

test("processSource(): a failure-time re-read that itself errors skips cleanup, removing nothing", async (t) => {
  // No withGeminiKey(): the 404 below fails extraction immediately (article rethrows FetchError),
  // so no Gemini call is ever reached.
  const existingBlocks = [
    { id: "img1", type: "image", originalUrl: "https://old.test/pic.png", alt: "pic", path: "70/aaaaaaaaaaaaaaaa", format: "avif", widths: [640] },
  ];
  const source = newSource(70, "article", "gone");
  // Call 1 (the start-of-run existing-post lookup) succeeds; call 2 (the failure-path re-read) is
  // the one that errors. If the first lookup failed instead, processSource would stop before the
  // failure path, and "re-read failed → treat as no post → wipe everything" would go untested.
  const db = fakeDb(undefined, {
    source,
    post: { id: 1, blocks: existingBlocks },
    media: ["aaaaaaaaaaaaaaaa-640.avif"],
    postErrorOnCall: 2,
    postError: new Error("re-read down"),
  });
  mockFetch(t, async () => new Response("", { status: 404 }));
  await processSource(db, source.id);
  assert.deepEqual(db.removedMedia, []); // the re-read failed: cleanup is skipped entirely, nothing removed
  assert.deepEqual(db.sourceUpdates.at(-1), { error: "fetch 404" }); // the real failure is still recorded
});

test("processSource(): the failure-path cleanup re-reads the current post right before running, not the start-of-run snapshot (concurrency window)", async (t) => {
  withGeminiKey(t);
  const oldBlocks = [
    { id: "old1", type: "image", originalUrl: `${TEST_HOST}/old.png`, alt: "old", path: "12/aaaaaaaaaaaaaaaa", format: "avif", widths: [640] },
  ];
  const newBlocks = [
    { id: "new1", type: "image", originalUrl: `${TEST_HOST}/new.png`, alt: "new", path: "12/bbbbbbbbbbbbbbbb", format: "avif", widths: [640] },
  ];
  const source = newSource(12);
  const db = fakeDb(undefined, { source, post: { id: 1, blocks: oldBlocks }, media: ["aaaaaaaaaaaaaaaa-640.avif", "bbbbbbbbbbbbbbbb-640.avif"] });
  mockFetch(t, async (url, init) => {
    if (url.startsWith(TEST_HOST)) return new Response(ARTICLE_HTML, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    if (prompt.includes("NOT part of the article")) return geminiResponse({ remove: [] }); // cleanup: keep going
    // Simulate a concurrent run publishing new media via its own real (write-through) upsert,
    // right as our own summarize() call is about to fail this attempt.
    await db.from("posts").upsert({ source_id: source.id, blocks: newBlocks }, { onConflict: "source_id" });
    return geminiText("not a valid summary"); // summarize: fail this attempt
  });
  await processSource(db, source.id);
  // The re-read at failure time sees newBlocks, not the start-of-run oldBlocks: the old image
  // (no longer referenced by the fresher read) is removed, the new one (concurrently published) stays.
  assert.deepEqual(db.removedMedia, ["12/aaaaaaaaaaaaaaaa-640.avif"]);
});

test("processSource(): a posts-lookup error propagates instead of marking the source failed, without ever fetching", async (t) => {
  const source = newSource(13, "article", "x");
  const db = fakeDb(undefined, { source, postError: new Error("db down") });
  // Without the early propagation, processSource would fall through into buildPost/extract(); this
  // handler fails the test instead of letting a real request go out.
  mockFetch(t, () => {
    throw new Error("must not fetch: the posts-lookup error should propagate before extraction starts");
  });
  await assert.rejects(() => processSource(db, source.id), /db down/);
  assert.equal(db.sourceUpdates.some((u) => "status" in u), false); // no status write at all — the source keeps its prior status
});

test("processSource() noarchive: stores writeNotes' blocks with meta.mirrored false, never the page's own text or images", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const source = newSource(14, "article", "private");
  const db = fakeDb(undefined, { source, post: null });
  let imageFetches = 0;
  mockFetch(t,
    noarchiveGeminiHandler({ sections: [{ heading: "Findings", points: ["Point one", "Point two"] }] }, () => imageFetches++),
  );
  await processSource(db, source.id);
  const post = db.postUpserts[0];
  assert.equal((post.meta as { mirrored: boolean }).mirrored, false);
  const blocks = post.blocks as { type: string; text?: string }[];
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "list"]);
  assert.equal(blocks[0].text, "Findings");
  assert.ok(!JSON.stringify(blocks).includes("would normally be mirrored"));
  assert.equal(blocks.some((b) => b.type === "image"), false);
  assert.equal(imageFetches, 0); // noarchive must never download the page's own images
});

test("processSource(): noarchive removes previously mirrored media and downloads no new images", async (t) => {
  withGeminiKey(t);
  const source = newSource(15, "article", "private");
  const previousBlocks = [
    { id: "img1", type: "image", originalUrl: "https://old.test/pic.png", alt: "pic", path: "15/deadbeefdeadbeef", format: "avif", widths: [640] },
  ];
  const db = fakeDb(undefined, { source, post: { id: 1, blocks: previousBlocks }, media: ["deadbeefdeadbeef-640.avif"] });
  let imageFetches = 0;
  mockFetch(t, noarchiveGeminiHandler({ sections: [{ heading: "Findings", points: ["Point one"] }] }, () => imageFetches++));
  await processSource(db, source.id);
  assert.deepEqual(db.removedMedia, ["15/deadbeefdeadbeef-640.avif"]);
  const blocks = db.postUpserts[0].blocks as { type: string }[];
  assert.equal(blocks.some((b) => b.type === "image"), false);
  assert.equal(imageFetches, 0); // the page's own <img> must never be downloaded either
});

test("processSource() youtube: an extractor-generated summary means summarize() is never called, and a video is embedded, never mirrored", async (t) => {
  withGeminiKey(t);
  const source = { id: 16, url: youtubeUrl, kind: "youtube", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  mockFetch(t, async (url) =>
    url.includes("/oembed")
      ? new Response(JSON.stringify({ title: "A Video", author_name: "A Channel" }))
      : geminiResponse({ ...okSummary, chapters: [] }),
  );
  await processSource(db, source.id);
  assert.deepEqual(db.tasks, ["ingest_video"]); // no separate "ingest_article" summarize() call
  assert.equal(db.postUpserts.length, 1);
  assert.deepEqual(db.postUpserts[0].title, okSummary.title);
  assert.equal((db.postUpserts[0].meta as { mirrored: boolean }).mirrored, false); // a video is embedded, not mirrored
});

test("processSource(): youtube's videoOnly fallback (Gemini fails) still gives meta.mirrored: false", async (t) => {
  withGeminiKey(t);
  const source = { id: 17, url: youtubeUrl, kind: "youtube", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  let geminiCalls = 0;
  mockFetch(t, async (url) => {
    if (url.includes("/oembed")) return new Response(JSON.stringify({ title: "A video", author_name: "A Channel" }));
    geminiCalls++;
    // extractYoutube's own call fails (triggering the videoOnly fallback); the later summarize() call succeeds.
    return geminiCalls === 1 ? geminiResponse("not an object") : geminiResponse(okSummary);
  });
  await processSource(db, source.id);
  const post = db.postUpserts[0];
  assert.deepEqual((post.blocks as { type: string }[]).map((b) => b.type), ["video"]);
  assertExtractionFailedNotMirrored(post);
});

// Every source below has at least 4 blocks: under aiCleanup's own minimum, a removed
// AI_CLEANUP_KINDS gate would hide behind that guard and these tests would pass for the wrong reason.

test("processSource(): a pdf skips aiCleanup", async (t) => {
  withGeminiKey(t);
  const source = newSource(18, "pdf", "paper.pdf");
  const db = fakeDb(undefined, { source, post: null });
  mockFetch(t,
    pdfGeminiHandler({
      title: "Paper",
      blocks: [
        { type: "paragraph", text: "Paragraph one has enough text to be a real block." },
        { type: "paragraph", text: "Paragraph two has enough text to be a real block." },
        { type: "paragraph", text: "Paragraph three has enough text to be a real block." },
        { type: "paragraph", text: "Paragraph four has enough text to be a real block." },
      ],
    }),
  );
  await processSource(db, source.id);
  assert.deepEqual(db.tasks, ["ingest_pdf", "ingest_article"]);
});

test("processSource(): an x post skips aiCleanup and stays mirrored", async (t) => {
  withGeminiKey(t);
  const source = { id: 19, url: "https://x.com/someone/status/1", kind: "x", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const tweetHtml = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First line with enough text to count.<br><br>Second line with enough text to count.<br><br>Third line with enough text to count.<br><br>Fourth line with enough text to count.</p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/1">January 1, 2025</a></blockquote>`;
  mockFetch(t, async (url) =>
    url.includes("publish.twitter.com") ? new Response(JSON.stringify({ author_name: "Someone", html: tweetHtml })) : geminiResponse(okSummary),
  );
  await processSource(db, source.id);
  assert.deepEqual(db.tasks, ["ingest_article"]);
  assert.equal((db.postUpserts[0].meta as { mirrored: boolean }).mirrored, true); // unlike youtube, x stays mirrored on success
});

test("processSource(): an article runs aiCleanup exactly once, before the summary", async (t) => {
  const db = await processArticle(t, 20);
  assert.deepEqual(db.tasks, ["ingest_cleanup", "ingest_article"]);
});

test("processSource(): a failing ingest_cleanup call leaves the article's blocks unchanged instead of failing the whole post", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const source = newSource(21);
  const db = fakeDb(undefined, { source, post: null });
  // Reuses articleGeminiHandler: a cleanupOut that doesn't match cleanupSchema fails the same way
  // invalid JSON would (generate() throws, aiCleanup catches it and returns the blocks unchanged).
  mockFetch(t, articleGeminiHandler(ARTICLE_HTML, "not a valid cleanup response"));
  await processSource(db, source.id);
  assert.ok(db.sourceUpdates.some((u) => u.status === "done"));
  assert.equal(db.sourceUpdates.some((u) => u.status === "failed"), false);
  assert.ok((db.postUpserts[0].blocks as unknown[]).length > 0);
});

test("processSource(): clips before cleaning, so the ingest_cleanup listing sent to the model stays bounded (listing size)", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const tinyParagraphs = Array.from(
    { length: 405 },
    (_, i) => `<p>Item number ${i} has just enough unique words to count as its own block for this test to work as intended.</p>`,
  ).join("");
  const hugeHtml = `<!doctype html><html><head><title>Huge</title></head><body><article><h1>Huge</h1>${tinyParagraphs}</article></body></html>`;
  const source = newSource(22, "article", "huge");
  const db = fakeDb(undefined, { source, post: null });
  let cleanupListingLines = 0;
  mockFetch(t, async (url, init) => {
    if (url.startsWith(TEST_HOST)) return new Response(hugeHtml, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    if (prompt.includes("NOT part of the article")) {
      cleanupListingLines = prompt.split("\n").filter((line) => /^[a-z0-9-]+ \[/.test(line)).length;
      return geminiResponse({ remove: [] });
    }
    return geminiResponse(okSummary);
  });
  await processSource(db, source.id);
  assert.ok(cleanupListingLines > 0);
  assert.ok(cleanupListingLines <= 400); // the listing itself never exceeds the clip cap
  assert.equal((db.postUpserts[0].meta as { clipped?: boolean }).clipped, true);
});

test("removeUnusedMedia() removes only storage paths no longer referenced by the blocks", async () => {
  const key = "10/abcdef0123456789";
  const blocks: Block[] = [
    { id: "i1", type: "image", originalUrl: "https://x.test/a.png", alt: "", path: key, format: "avif", widths: [640, 1280] },
  ];
  const db = fakeDb(undefined, { media: ["abcdef0123456789-640.avif", "abcdef0123456789-1280.avif", "deadbeefdeadbeef-640.avif"] });
  await removeUnusedMedia(db, 10, blocks);
  assert.deepEqual(db.removedMedia, ["10/deadbeefdeadbeef-640.avif"]);
});

test("processSource(): extractionFailed keeps meta.mirrored false", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const source = newSource(23, "article", "thin");
  const db = fakeDb(undefined, { source, post: null });
  const tinyHtml = `<!doctype html><html><head><title>Thin</title></head><body><p>too short</p></body></html>`;
  mockFetch(t, async (url) => (url.includes("googleapis.com") ? geminiResponse(okSummary) : new Response(tinyHtml, { headers: { "content-type": "text/html" } })));
  await processSource(db, source.id);
  assertExtractionFailedNotMirrored(db.postUpserts[0]);
});

test("processSource(): a source over the block/char limits gets meta.clipped (i)", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const source = newSource(24, "pdf", "paper.pdf");
  const db = fakeDb(undefined, { source, post: null });
  mockFetch(t,
    pdfGeminiHandler({
      title: "Huge",
      blocks: [{ type: "paragraph", text: "A".repeat(210_000) }, { type: "paragraph", text: "tail" }],
    }),
  );
  await processSource(db, source.id);
  const post = db.postUpserts[0];
  assert.equal((post.meta as { clipped?: boolean }).clipped, true);
  assert.equal((post.blocks as unknown[]).length, 1); // only the first (huge) block survives the clip
  assert.equal((post.meta as { mirrored: boolean }).mirrored, true); // unlike youtube, pdf stays mirrored on success
});

test("processSource(): the image budget is computed after extraction, reflecting the real time it took", async (t) => {
  withGeminiKey(t);
  const html = manyImagesHtml(6);
  const source = newSource(25);
  const db = fakeDb(undefined, { source, post: null });
  // "Computed at buildPost's start" would give a ~200ms budget, comfortably covering both waves
  // below. Computed after extraction (correct), the 150ms the page fetch takes eats into it first.
  const deadline = Date.now() + SUMMARY_RESERVE_MS + 200;
  mockFetch(t, async (url, init) => {
    if (url.endsWith(".png")) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return new Response(await testPng(), { headers: { "content-type": "image/png" } });
    }
    if (url.startsWith(TEST_HOST)) {
      await new Promise((resolve) => setTimeout(resolve, 150)); // the extraction fetch itself takes real time
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
    return articleGeminiHandler(html, { remove: [] })(url, init);
  });
  await processSource(db, source.id, { deadline });
  const images = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).filter((b) => b.type === "image");
  assert.ok(images.some((b) => !b.path)); // the second wave (past concurrency 4) misses the already-shrunk budget
});

test("retryPendingSources(): forwards its deadline into processSource, so a tight one shrinks the image budget mirrorImages actually receives", async (t) => {
  withGeminiKey(t);
  const html = manyImagesHtml(6);

  // The "tight" run's deadline clears retryPendingSources' own start gate by GATE_MARGIN_MS, then
  // (via the Date.now() offset below) simulates extraction eating into the budget until only
  // TARGET_TIGHT_BUDGET_MS is left. Deriving the offset from the real constants — instead of a
  // hand-picked literal — means changing any one of them can't silently break this test when
  // there's no real bug: offset = (deadline's margin over the start gate) − (the summarize()
  // reserve) − (the tiny budget buildPost should end up with), which algebraically needs only
  // START_GATE_RESERVE_MS and SUMMARY_RESERVE_MS; IMAGE_BUDGET_MS just keeps the target budget
  // safely tiny relative to whatever the cap currently is, so it stays "tight" even if that cap changes.
  const GATE_MARGIN_MS = 2_000;
  const TARGET_TIGHT_BUDGET_MS = Math.min(100, IMAGE_BUDGET_MS / 100);
  const offsetAfterExtraction = START_GATE_RESERVE_MS + GATE_MARGIN_MS - SUMMARY_RESERVE_MS - TARGET_TIGHT_BUDGET_MS;

  async function run(id: number, deadline: number | undefined, offsetAfterExtraction: number) {
    const source = { id, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
    const db = fakeDb(undefined, { source, post: null, pending: [{ id }] });
    let extractionDone = false;
    if (offsetAfterExtraction) {
      const realNow = Date.now;
      t.mock.method(Date, "now", () => (extractionDone ? realNow() + offsetAfterExtraction : realNow()));
    }
    mockFetch(t, async (url, init) => {
      if (url.endsWith(".png")) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return new Response(await testPng(), { headers: { "content-type": "image/png" } });
      }
      if (url.startsWith(TEST_HOST)) {
        extractionDone = true; // simulates the extraction (plus cleanup) step having taken real time
        return new Response(html, { headers: { "content-type": "text/html" } });
      }
      return articleGeminiHandler(html, { remove: [] })(url, init);
    });
    const processed = await retryPendingSources(db, deadline);
    assert.equal(processed, 1); // the deadline cleared retryPendingSources' own start gate
    return (db.postUpserts[0]?.blocks as { type: string; path?: string | null }[] | undefined)?.filter((b) => b.type === "image") ?? [];
  }

  const generous = await run(30, Date.now() + 10 * 60_000, 0);
  assert.ok(generous.every((b) => b.path));

  // Clears retryPendingSources' own start gate (with a safety margin), but — simulating a slow
  // extraction that ate into the budget — computes down to a tight image budget once buildPost
  // actually reaches mirrorImages. If retryPendingSources dropped `deadline` instead of forwarding
  // it, this would behave exactly like the generous run above (mirrorImages' own 90s default).
  const tight = await run(31, Date.now() + START_GATE_RESERVE_MS + GATE_MARGIN_MS, offsetAfterExtraction);
  assert.ok(tight.some((b) => !b.path));
});

test("retryPendingSources(): with plenty of time left, every pending source is processed", async (t) => {
  withGeminiKey(t);
  const sources = [newSource(1), newSource(2), newSource(3)];
  const db = fakeDb(undefined, { sources, post: null, pending: sources });
  mockFetch(t, articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  const processed = await retryPendingSources(db, Date.now() + 10 * 60_000);
  assert.equal(processed, 3);
  assert.equal(db.postUpserts.length, 3);
});

test("retryPendingSources() stops starting new sources once the deadline is too close, without touching any of them (j)", async () => {
  const db = fakeDb(undefined, { pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const processed = await retryPendingSources(db, Date.now() - 1);
  assert.equal(processed, 0);
  assert.deepEqual(db.sourceUpdates, []); // no source was ever started
});

// I8, I9: a finished source, or one that failed MAX_ATTEMPTS (3) times, is never retried: a poison
// link would otherwise cost a model run every day.
test("retryPendingSources() retries only unfinished sources under the 3-attempt cap", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, async (url) => {
    fetched.push(url);
    return new Response("", { status: 404 });
  });
  const sources = [
    { ...newSource(1, "article", "done"), status: "done", attempts: 1 },
    { ...newSource(2, "article", "spent"), status: "failed", attempts: 3 },
    { ...newSource(3, "article", "new"), status: "pending", attempts: 0 },
    { ...newSource(4, "article", "again"), status: "failed", attempts: 2 },
  ];
  const db = fakeDb(undefined, { sources, post: null, pending: sources });
  assert.equal(await retryPendingSources(db), 2);
  assert.deepEqual(fetched, [`${TEST_HOST}/new`, `${TEST_HOST}/again`]);
});
