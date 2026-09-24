import assert from "node:assert/strict";
import { test } from "node:test";
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
import { fakeDb, geminiPrompt, geminiResponse, geminiText, mockDns, mockFetch, TEST_HOST, withGeminiKey, youtubeUrl } from "./mock-fetch.ts";

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

// Shared by (c) and M21: a noarchive page that also carries an `<img>`, so both tests can pin that
// noarchive mirrors nothing — not just that the resulting blocks happen to have no image type, but
// that the image is never even downloaded (a reverted fix would try, and this always-installed
// mockFetch would catch it instead of a real request going out).
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

test("processSource() success: upserts blocks with mirrored meta and the generated summary, having bumped attempts before the post is written (a)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 1, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
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

test("processSource(): the post upsert uses onConflict: source_id and writes exactly these keys (M1/M2b), and the existing post is looked up by source_id (M34)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 2, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    await processSource(db, source.id);
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
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): attempts is bumped before any extraction fetch (M13)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 3, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const handler = articleGeminiHandler(ARTICLE_HTML, { remove: [] });
  const restore = mockFetch((url, init) => {
    db.writes.push("fetch");
    return handler(url, init);
  });
  try {
    await processSource(db, source.id);
    assert.ok(db.writes.indexOf("sources.update") < db.writes.indexOf("fetch"));
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): removeUnusedMedia runs after the post upsert, never before (M5)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 4, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    await processSource(db, source.id);
    assert.ok(db.writes.indexOf("posts.upsert") < db.writes.indexOf("storage.list"));
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): on success, storage.remove takes only unreferenced media — referenced paths stay (M6/M18)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const html = oneImageHtml(`${TEST_HOST}/pic.png`);
  const source = { id: 5, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  // A stale object from an earlier version of this source's media, no longer referenced by anything.
  const db = fakeDb(undefined, { source, post: null, media: ["stale0123456789ab-640.avif"] });
  const png = await testPng();
  const restore = mockFetch(async (url, init) =>
    url.endsWith(".png") ? new Response(png, { headers: { "content-type": "image/png" } }) : articleGeminiHandler(html, { remove: [] })(url, init),
  );
  try {
    await processSource(db, source.id);
    assert.deepEqual(db.removedMedia, ["5/stale0123456789ab-640.avif"]); // only the stale one
    const image = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).find((b) => b.type === "image");
    assert.ok(image?.path); // the newly mirrored image was never removed
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): a previously mirrored image is reused by originalUrl instead of re-downloaded (M22)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const imgUrl = `${TEST_HOST}/pic.png`;
  const html = oneImageHtml(imgUrl);
  const source = { id: 6, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const previousBlocks = [
    { id: "img1", type: "image", originalUrl: imgUrl, alt: "pic", path: "6/cafef00dcafef00d", format: "avif", widths: [640, 1280] },
  ];
  const db = fakeDb(undefined, { source, post: { id: 1, blocks: previousBlocks }, media: ["cafef00dcafef00d-640.avif", "cafef00dcafef00d-1280.avif"] });
  let imageFetches = 0;
  const restore = mockFetch(async (url, init) => {
    if (url === imgUrl) {
      imageFetches++;
      return new Response(await testPng(), { headers: { "content-type": "image/png" } });
    }
    return articleGeminiHandler(html, { remove: [] })(url, init);
  });
  try {
    await processSource(db, source.id);
    assert.equal(imageFetches, 0); // reused by originalUrl, never re-downloaded
    const image = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).find((b) => b.type === "image");
    assert.equal(image?.path, "6/cafef00dcafef00d");
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource() failure: re-extraction that fails writes only { error } when a post already exists, and { status: 'failed', error } when none does (b)", async (t) => {
  mockDns(t);
  const source = { id: 7, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    const dbWithPost = fakeDb(undefined, { source, post: { id: 9, blocks: [] } });
    await processSource(dbWithPost, source.id);
    assert.equal(dbWithPost.postUpserts.length, 0);
    assert.deepEqual(dbWithPost.sourceUpdates.at(-1), { error: "fetch 404" });

    const dbNoPost = fakeDb(undefined, { source, post: null });
    await processSource(dbNoPost, source.id);
    assert.equal(dbNoPost.postUpserts.length, 0);
    assert.deepEqual(dbNoPost.sourceUpdates.at(-1), { status: "failed", error: "fetch 404" });
  } finally {
    restore();
  }
});

test("processSource(): a failure with an existing post leaves its mirrored images alone, removing only the true orphan (N2)", async (t) => {
  mockDns(t);
  const source = { id: 8, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  const existingBlocks = [
    { id: "img1", type: "image", originalUrl: "https://old.test/pic.png", alt: "pic", path: "8/aaaaaaaaaaaaaaaa", format: "avif", widths: [640] },
  ];
  const db = fakeDb(undefined, {
    source,
    post: { id: 1, blocks: existingBlocks },
    media: ["aaaaaaaaaaaaaaaa-640.avif", "orphanbbbbbbbbbb-640.avif"],
  });
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    await processSource(db, source.id);
    assert.deepEqual(db.removedMedia, ["8/orphanbbbbbbbbbb-640.avif"]); // the still-referenced image is left alone
    assert.deepEqual(db.sourceUpdates.at(-1), { error: "fetch 404" }); // an existing post -> only { error }, status untouched
  } finally {
    restore();
  }
});

test("processSource(): the failure-path media cleanup swallows its own errors, never masking the real failure message", async (t) => {
  mockDns(t);
  const source = { id: 9, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null, storageError: true });
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    await processSource(db, source.id);
    assert.deepEqual(db.sourceUpdates.at(-1), { status: "failed", error: "fetch 404" });
  } finally {
    restore();
  }
});

test("processSource(): a failure after an image upload removes the orphaned upload without masking the original error (orphaned uploads)", async () => {
  const restoreKey = withGeminiKey();
  const html = oneImageHtml(`${TEST_HOST}/pic.png`);
  const source = { id: 10, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const png = await testPng();
  const restore = mockFetch(async (url, init) =>
    url.endsWith(".png")
      ? new Response(png, { headers: { "content-type": "image/png" } })
      : articleGeminiHandler(html, { remove: [] }, "not a valid summary")(url, init),
  );
  try {
    await processSource(db, source.id);
    assert.equal(db.postUpserts.length, 0); // the post itself was never saved — summarize() failed
    assert.ok(db.removedMedia.length > 0); // but the image it uploaded along the way did not stay orphaned
    const failureWrite = db.sourceUpdates.at(-1);
    assert.equal(failureWrite?.status, "failed");
    assert.ok(typeof failureWrite?.error === "string" && failureWrite.error.length > 0);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): the failure-path media cleanup never re-runs once the post upsert has succeeded (probe A1)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  // No <img>, so buildPost never touches storage — the post upsert succeeds cleanly, and the
  // *success*-path removeUnusedMedia call right after it is the storage fake's very first call.
  const source = { id: 11, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null, storageError: true });
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    await processSource(db, source.id);
    assert.equal(db.postUpserts.length, 1); // the upsert itself succeeded
    assert.equal(db.writes.filter((w) => w === "storage.list").length, 1); // only the success-path attempt — no repeat from the catch
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): the failure-path cleanup re-reads the current post right before running, not the start-of-run snapshot (concurrency window)", async () => {
  const restoreKey = withGeminiKey();
  const oldBlocks = [
    { id: "old1", type: "image", originalUrl: `${TEST_HOST}/old.png`, alt: "old", path: "12/aaaaaaaaaaaaaaaa", format: "avif", widths: [640] },
  ];
  const newBlocks = [
    { id: "new1", type: "image", originalUrl: `${TEST_HOST}/new.png`, alt: "new", path: "12/bbbbbbbbbbbbbbbb", format: "avif", widths: [640] },
  ];
  const source = { id: 12, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const postRow: { id: number; blocks: unknown } = { id: 1, blocks: oldBlocks };
  const db = fakeDb(undefined, { source, post: postRow, media: ["aaaaaaaaaaaaaaaa-640.avif", "bbbbbbbbbbbbbbbb-640.avif"] });
  const restore = mockFetch(async (url, init) => {
    if (url.startsWith(TEST_HOST)) return new Response(ARTICLE_HTML, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    if (prompt.includes("NOT part of the article")) return geminiResponse({ remove: [] }); // cleanup: keep going
    postRow.blocks = newBlocks; // simulate a concurrent run publishing new media right as summarize() runs
    return geminiText("not a valid summary"); // summarize: fail this attempt
  });
  try {
    await processSource(db, source.id);
    // The re-read at failure time sees newBlocks, not the start-of-run oldBlocks: the old image
    // (no longer referenced by the fresher read) is removed, the new one (concurrently published) stays.
    assert.deepEqual(db.removedMedia, ["12/aaaaaaaaaaaaaaaa-640.avif"]);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): a posts-lookup error propagates instead of marking the source failed, without ever fetching (lookup errors)", async () => {
  const source = { id: 13, url: `${TEST_HOST}/x`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, postError: new Error("db down") });
  // Reverting the fix would fall through into buildPost/extract(); this fails the test instead of a
  // real request going out, since the lookup error should propagate well before any fetch happens.
  const restore = mockFetch(() => {
    throw new Error("must not fetch: the posts-lookup error should propagate before extraction starts");
  });
  try {
    await assert.rejects(() => processSource(db, source.id), /db down/);
    assert.equal(db.sourceUpdates.some((u) => "status" in u), false); // no status write at all — the source keeps its prior status
  } finally {
    restore();
  }
});

test("processSource() noarchive: stores writeNotes' blocks with meta.mirrored false, never the page's own text or images (c)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 14, url: `${TEST_HOST}/private`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  let imageFetches = 0;
  const restore = mockFetch(
    noarchiveGeminiHandler({ sections: [{ heading: "Findings", points: ["Point one", "Point two"] }] }, () => imageFetches++),
  );
  try {
    await processSource(db, source.id);
    const post = db.postUpserts[0];
    assert.equal((post.meta as { mirrored: boolean }).mirrored, false);
    const blocks = post.blocks as { type: string; text?: string }[];
    assert.deepEqual(blocks.map((b) => b.type), ["heading", "list"]);
    assert.equal(blocks[0].text, "Findings");
    assert.ok(!JSON.stringify(blocks).includes("would normally be mirrored"));
    assert.equal(blocks.some((b) => b.type === "image"), false);
    assert.equal(imageFetches, 0); // (M21) noarchive must never download the page's own images
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): noarchive removes previously mirrored media and downloads no new images (M21)", async () => {
  const restoreKey = withGeminiKey();
  const source = { id: 15, url: `${TEST_HOST}/private`, kind: "article", note: null, attempts: 0 };
  const previousBlocks = [
    { id: "img1", type: "image", originalUrl: "https://old.test/pic.png", alt: "pic", path: "15/deadbeefdeadbeef", format: "avif", widths: [640] },
  ];
  const db = fakeDb(undefined, { source, post: { id: 1, blocks: previousBlocks }, media: ["deadbeefdeadbeef-640.avif"] });
  let imageFetches = 0;
  const restore = mockFetch(noarchiveGeminiHandler({ sections: [{ heading: "Findings", points: ["Point one"] }] }, () => imageFetches++));
  try {
    await processSource(db, source.id);
    assert.deepEqual(db.removedMedia, ["15/deadbeefdeadbeef-640.avif"]);
    const blocks = db.postUpserts[0].blocks as { type: string }[];
    assert.equal(blocks.some((b) => b.type === "image"), false);
    assert.equal(imageFetches, 0); // the page's own <img> must never be downloaded either
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource() youtube: an extractor-generated summary means summarize() is never called, and a video is embedded, never mirrored (d)", async () => {
  const restoreKey = withGeminiKey();
  const source = { id: 16, url: youtubeUrl, kind: "youtube", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
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
    assert.equal((db.postUpserts[0].meta as { mirrored: boolean }).mirrored, false); // (M9) a video is embedded, not mirrored
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): youtube's videoOnly fallback (Gemini fails) still gives meta.mirrored: false (M9)", async () => {
  const restoreKey = withGeminiKey();
  const source = { id: 17, url: youtubeUrl, kind: "youtube", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  let geminiCalls = 0;
  const restore = mockFetch(async (url) => {
    if (url.includes("/oembed")) return new Response(JSON.stringify({ title: "A video", author_name: "A Channel" }));
    geminiCalls++;
    // extractYoutube's own call fails (triggering the videoOnly fallback); the later summarize() call succeeds.
    return geminiCalls === 1 ? geminiResponse("not an object") : geminiResponse(okSummary);
  });
  try {
    await processSource(db, source.id);
    const post = db.postUpserts[0];
    assert.deepEqual((post.blocks as { type: string }[]).map((b) => b.type), ["video"]);
    assertExtractionFailedNotMirrored(post);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): aiCleanup runs only for html-derived kinds — skipped for pdf and x, called once for article (e)", async () => {
  const restoreKey = withGeminiKey();

  // At least 4 blocks each: below aiCleanup's own minimum, a removed AI_CLEANUP_KINDS gate would
  // still hide behind that internal guard and this test would pass for the wrong reason.
  const pdfSource = { id: 18, url: `${TEST_HOST}/paper.pdf`, kind: "pdf", note: null, attempts: 0 };
  const pdfDb = fakeDb(undefined, { source: pdfSource, post: null });
  const restorePdf = mockFetch(
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
  try {
    await processSource(pdfDb, pdfSource.id);
    assert.deepEqual(pdfDb.tasks, ["ingest_pdf", "ingest_article"]);
  } finally {
    restorePdf();
  }

  const xSource = { id: 19, url: "https://x.com/someone/status/1", kind: "x", note: null, attempts: 0 };
  const xDb = fakeDb(undefined, { source: xSource, post: null });
  const tweetHtml = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First line with enough text to count.<br><br>Second line with enough text to count.<br><br>Third line with enough text to count.<br><br>Fourth line with enough text to count.</p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/1">January 1, 2025</a></blockquote>`;
  const restoreX = mockFetch(async (url) =>
    url.includes("publish.twitter.com") ? new Response(JSON.stringify({ author_name: "Someone", html: tweetHtml })) : geminiResponse(okSummary),
  );
  try {
    await processSource(xDb, xSource.id);
    assert.deepEqual(xDb.tasks, ["ingest_article"]);
    assert.equal((xDb.postUpserts[0].meta as { mirrored: boolean }).mirrored, true); // unlike youtube, x stays mirrored on success
  } finally {
    restoreX();
  }

  const articleSource = { id: 20, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const articleDb = fakeDb(undefined, { source: articleSource, post: null });
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
  const source = { id: 21, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  // Reuses articleGeminiHandler: a cleanupOut that doesn't match cleanupSchema fails the same way
  // invalid JSON would (generate() throws, aiCleanup catches it and returns the blocks unchanged).
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, "not a valid cleanup response"));
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

test("processSource(): clips before cleaning, so the ingest_cleanup listing sent to the model stays bounded (listing size)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const tinyParagraphs = Array.from(
    { length: 405 },
    (_, i) => `<p>Item number ${i} has just enough unique words to count as its own block for this test to work as intended.</p>`,
  ).join("");
  const hugeHtml = `<!doctype html><html><head><title>Huge</title></head><body><article><h1>Huge</h1>${tinyParagraphs}</article></body></html>`;
  const source = { id: 22, url: `${TEST_HOST}/huge`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  let cleanupListingLines = 0;
  const restore = mockFetch(async (url, init) => {
    if (url.startsWith(TEST_HOST)) return new Response(hugeHtml, { headers: { "content-type": "text/html" } });
    const prompt = geminiPrompt(init);
    if (prompt.includes("NOT part of the article")) {
      cleanupListingLines = prompt.split("\n").filter((line) => /^[a-z0-9-]+ \[/.test(line)).length;
      return geminiResponse({ remove: [] });
    }
    return geminiResponse(okSummary);
  });
  try {
    await processSource(db, source.id);
    assert.ok(cleanupListingLines > 0);
    assert.ok(cleanupListingLines <= 400); // the listing itself never exceeds the clip cap
    assert.equal((db.postUpserts[0].meta as { clipped?: boolean }).clipped, true);
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
  const db = fakeDb(undefined, { media: ["abcdef0123456789-640.avif", "abcdef0123456789-1280.avif", "deadbeefdeadbeef-640.avif"] });
  await removeUnusedMedia(db, 10, blocks);
  assert.deepEqual(db.removedMedia, ["10/deadbeefdeadbeef-640.avif"]);
});

test("processSource(): extractionFailed keeps meta.mirrored false (h)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 23, url: `${TEST_HOST}/thin`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  const tinyHtml = `<!doctype html><html><head><title>Thin</title></head><body><p>too short</p></body></html>`;
  const restore = mockFetch(async (url) => (url.includes("googleapis.com") ? geminiResponse(okSummary) : new Response(tinyHtml, { headers: { "content-type": "text/html" } })));
  try {
    await processSource(db, source.id);
    assertExtractionFailedNotMirrored(db.postUpserts[0]);
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): a source over the block/char limits gets meta.clipped (i)", async (t) => {
  mockDns(t);
  const restoreKey = withGeminiKey();
  const source = { id: 24, url: `${TEST_HOST}/paper.pdf`, kind: "pdf", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
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
    assert.equal((post.meta as { mirrored: boolean }).mirrored, true); // unlike youtube, pdf stays mirrored on success
  } finally {
    restore();
    restoreKey();
  }
});

test("processSource(): the image budget is computed after extraction, reflecting the real time it took (N7)", async () => {
  const restoreKey = withGeminiKey();
  const html = manyImagesHtml(6);
  const source = { id: 25, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null });
  // "Computed at buildPost's start" would give a ~200ms budget, comfortably covering both waves
  // below. Computed after extraction (correct), the 150ms the page fetch takes eats into it first.
  const deadline = Date.now() + SUMMARY_RESERVE_MS + 200;
  const restore = mockFetch(async (url, init) => {
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
  try {
    await processSource(db, source.id, { deadline });
    const images = (db.postUpserts[0].blocks as { type: string; path?: string | null }[]).filter((b) => b.type === "image");
    assert.ok(images.some((b) => !b.path)); // the second wave (past concurrency 4) misses the already-shrunk budget
  } finally {
    restore();
    restoreKey();
  }
});

test("retryPendingSources(): forwards its deadline into processSource, so a tight one shrinks the image budget mirrorImages actually receives (M4b′)", async (t) => {
  const restoreKey = withGeminiKey();
  const html = manyImagesHtml(6);

  async function run(id: number, deadline: number | undefined, offsetAfterExtraction: number) {
    const source = { id, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
    const db = fakeDb(undefined, { source, post: null, pending: [{ id }] });
    let extractionDone = false;
    if (offsetAfterExtraction) {
      const realNow = Date.now;
      t.mock.method(Date, "now", () => (extractionDone ? realNow() + offsetAfterExtraction : realNow()));
    }
    const restore = mockFetch(async (url, init) => {
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
    try {
      const processed = await retryPendingSources(db, deadline);
      assert.equal(processed, 1); // the deadline cleared retryPendingSources' own start gate
      return (db.postUpserts[0]?.blocks as { type: string; path?: string | null }[] | undefined)?.filter((b) => b.type === "image") ?? [];
    } finally {
      restore();
    }
  }

  const generous = await run(30, Date.now() + 10 * 60_000, 0);
  assert.ok(generous.every((b) => b.path));

  // Clears retryPendingSources' own start gate (with a safety margin), but — simulating a slow
  // extraction that ate into the budget — computes down to a tight image budget once buildPost
  // actually reaches mirrorImages. If retryPendingSources dropped `deadline` instead of forwarding
  // it, this would behave exactly like the generous run above (mirrorImages' own 90s default).
  const tight = await run(31, Date.now() + START_GATE_RESERVE_MS + 2_000, 91_900);
  assert.ok(tight.some((b) => !b.path));

  restoreKey();
});

test("retryPendingSources(): with plenty of time left, every pending source is processed (M3/M4/M4b)", async () => {
  const restoreKey = withGeminiKey();
  const source = { id: 1, url: `${TEST_HOST}/post`, kind: "article", note: null, attempts: 0 };
  const db = fakeDb(undefined, { source, post: null, pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const restore = mockFetch(articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  try {
    const processed = await retryPendingSources(db, Date.now() + 10 * 60_000);
    assert.equal(processed, 3);
    assert.equal(db.postUpserts.length, 3);
  } finally {
    restore();
    restoreKey();
  }
});

test("retryPendingSources() stops starting new sources once the deadline is too close, without touching any of them (j)", async () => {
  const db = fakeDb(undefined, { pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const processed = await retryPendingSources(db, Date.now() - 1);
  assert.equal(processed, 0);
  assert.deepEqual(db.sourceUpdates, []); // no source was ever started
});
