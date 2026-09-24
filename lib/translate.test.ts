import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import { fakeDb, geminiPrompt, geminiResponse, geminiText, mockFetch, withGeminiKey, type FakeIngestTables } from "./pipeline/mock-fetch.ts";
import { applyTranslation, chunkTranslatable, translatable, translatePost, type TranslationItem } from "./translate.ts";

const EXTRACTED_AT = "2026-01-01T00:00:00Z";

const blocks = assignIds([
  { type: "heading", level: 2, text: "Results" },
  { type: "paragraph", content: [{ text: "Read the " }, { text: "paper", href: "https://a.test/" }, { text: " now." }] },
  { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
  { type: "code", code: "x = 1" },
  { type: "image", originalUrl: "https://a.test/i.png", alt: "chart", caption: "Speed", path: "1/abc", placeholder: "data:image/webp;base64,AAA" },
] satisfies BlockDraft[]);

/** The correct translated answer for `blocks`' 4 translatable items (blocks[0,1,2,4] — code has none). */
const translatedAnswer = {
  blocks: [
    { id: blocks[0].id, text: "Eredmények" },
    { id: blocks[1].id, spans: ["Olvasd el a ", "cikket", " most."] },
    { id: blocks[2].id, items: [["egy"], ["kettő"]] },
    { id: blocks[4].id, alt: "grafikon", caption: "Sebesség" },
  ],
};

/** `translatedAnswer.blocks` with the entry for `overrideId` replaced by `{ id: overrideId, ...fields }`
 *  (or dropped, when `fields` is omitted) — every probe below is "everything valid except this one
 *  block's answer", without repeating the other 3 valid entries each time. */
function answerWith(overrideId: string, fields?: Omit<TranslationItem, "id">): TranslationItem[] {
  const rest = translatedAnswer.blocks.filter((item) => item.id !== overrideId);
  return fields ? [...rest, { id: overrideId, ...fields }] : rest;
}

test("translatable sends text only: no code, no image data", () => {
  const view = translatable(blocks);
  assert.equal(view.length, 4);
  assert.deepEqual(view[1], { id: blocks[1].id, spans: ["Read the ", "paper", " now."] });
  assert.equal(JSON.stringify(view).includes("base64"), false);
});

test("applyTranslation keeps structure, links and image data", () => {
  const result = applyTranslation(blocks, translatedAnswer.blocks);
  assert.ok(result);
  assert.equal(result[1].type === "paragraph" && result[1].content[1].href, "https://a.test/");
  assert.equal(result[1].type === "paragraph" && result[1].content[1].text, "cikket");
  assert.equal(result[3].type === "code" && result[3].code, "x = 1");
  assert.equal(result[4].type === "image" && result[4].placeholder, "data:image/webp;base64,AAA");
  assert.deepEqual(result.map((b) => b.id), blocks.map((b) => b.id));
});

test("applyTranslation span mismatch: that block falls back to plain text", () => {
  const result = applyTranslation(blocks, answerWith(blocks[1].id, { spans: ["Olvasd el most a cikket."] }));
  assert.ok(result);
  assert.deepEqual(result[1].type === "paragraph" && result[1].content, [{ text: "Olvasd el most a cikket." }]);
});

test("applyTranslation rejects a missing block", () => {
  assert.equal(applyTranslation(blocks, [{ id: blocks[0].id, text: "Eredmények" }]), null);
});

// Important #1: an answer that returns only ids (every other field missing) used to silently keep
// the original English text and report "ok" — permanently, since a filled blocks_hu hides the
// Translate button. Each probe below must reject to null instead.
test("applyTranslation rejects an answer that translates nothing (ids only, every field missing)", () => {
  const onlyIds = translatable(blocks).map((item) => ({ id: item.id }));
  assert.equal(applyTranslation(blocks, onlyIds), null);
});

test("applyTranslation rejects a list whose items array is shorter than the original (2 items, 1 translated)", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[2].id, { items: [["egy"]] })), null);
});

test("applyTranslation rejects a non-empty original coming back empty", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[0].id, { text: "" })), null);
});

test("applyTranslation rejects an answer ~10x the original length (degenerate repetition loop)", () => {
  const original = "A fairly long heading that is definitely not a short string to translate";
  const longBlocks = assignIds([{ type: "heading", level: 2, text: original }] satisfies BlockDraft[]);
  const result = applyTranslation(longBlocks, [{ id: longBlocks[0].id, text: "x".repeat(original.length * 10) }]);
  assert.equal(result, null);
});

// Important #1 (fix round 2): a span-count mismatch (paragraph/quote, or one list item) skipped
// validating the *joined* fallback text entirely — any garbage passed, as long as the count didn't
// match. Each input below is exactly the kind the review flagged.
test("applyTranslation rejects empty spans for a mismatched paragraph (spans: [])", () => {
  // 0 vs 3 original spans — joined translated text is ""
  assert.equal(applyTranslation(blocks, answerWith(blocks[1].id, { spans: [] })), null);
});

test('applyTranslation rejects a whitespace-only span for a mismatched paragraph (["   "])', () => {
  // 1 vs 3 original spans — joined translated text is whitespace
  assert.equal(applyTranslation(blocks, answerWith(blocks[1].id, { spans: ["   "] })), null);
});

test("applyTranslation rejects a mismatched paragraph whose joined spans total 100 001 characters", () => {
  // 2 vs 3 original spans
  const spans = ["x".repeat(50_000), "x".repeat(50_001)];
  assert.equal(applyTranslation(blocks, answerWith(blocks[1].id, { spans })), null);
});

test("applyTranslation rejects a single-span paragraph answered with spans: []", () => {
  const singleSpanBlocks = assignIds([{ type: "paragraph", content: [{ text: "Hello there" }] }] satisfies BlockDraft[]);
  const result = applyTranslation(singleSpanBlocks, [{ id: singleSpanBlocks[0].id, spans: [] }]);
  assert.equal(result, null);
});

test("applyTranslation rejects an empty list item ([])", () => {
  // first item: 0 vs 1 original span — joined text ""
  assert.equal(applyTranslation(blocks, answerWith(blocks[2].id, { items: [[], ["kettő"]] })), null);
});

test("applyTranslation rejects a 50 000-character list item", () => {
  // first item: 2 vs 1 original span
  const items = [["a", "x".repeat(50_000)], ["kettő"]];
  assert.equal(applyTranslation(blocks, answerWith(blocks[2].id, { items })), null);
});

// Minor #3 (S2, S7, S8): the "ids only" test above fails through every type at once, so it can't
// tell whether any one type's own presence check actually works. One isolated probe each.
test("applyTranslation rejects a missing heading text alone (S2)", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[0].id)), null); // text omitted, everything else valid
});

test("applyTranslation rejects a missing paragraph spans field alone (S7)", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[1].id)), null); // spans omitted, everything else valid
});

test("applyTranslation rejects a missing image alt alone, when the original alt was non-empty (S8)", () => {
  // alt omitted, everything else valid — blocks[4].alt is "chart"
  assert.equal(applyTranslation(blocks, answerWith(blocks[4].id, { caption: "Sebesség" })), null);
});

// Minor #4 (S9, S10, S13, S14): validText rejecting empty/whitespace text, pinned per field — not
// just via the "10x length" or "ids only" tests above, which exercise different fields.
test("applyTranslation rejects a whitespace-only span at a matching span count (S9)", () => {
  // 3 spans (matches), middle is blank
  assert.equal(applyTranslation(blocks, answerWith(blocks[1].id, { spans: ["Olvasd el a ", "   ", " most."] })), null);
});

test("applyTranslation rejects a whitespace-only list-item span at a matching count (S10)", () => {
  // 1 span (matches), blank
  assert.equal(applyTranslation(blocks, answerWith(blocks[2].id, { items: [["  "], ["kettő"]] })), null);
});

test("applyTranslation rejects a whitespace-only caption when the original had one (S13)", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[4].id, { alt: "grafikon", caption: "   " })), null);
});

test("applyTranslation rejects a whitespace-only heading answer (S14)", () => {
  assert.equal(applyTranslation(blocks, answerWith(blocks[0].id, { text: "   " })), null);
});

// Minor #7 (fix round 1): block.caption is optional; a model that invents one for a block that
// never had one must not have that invention saved.
test("applyTranslation applies a translated caption only when the original block had one", () => {
  const noCaptionBlocks = assignIds([
    { type: "image", originalUrl: "https://a.test/j.png", alt: "chart", path: "1/def", placeholder: "data:image/webp;base64,BBB" },
  ] satisfies BlockDraft[]);
  const result = applyTranslation(noCaptionBlocks, [{ id: noCaptionBlocks[0].id, alt: "grafikon", caption: "kitalált alcím" }]);
  assert.ok(result);
  assert.equal(result[0].type === "image" && result[0].caption, undefined);
});

// Minor #2 (fix round 2): the mirror-image bugs — a caption the original had must not be silently
// droppable, and alt must not be required when the original alt was already empty (an image with
// alt: "" plus a caption used to fail every retry if the model dropped the empty alt).
test("applyTranslation rejects a missing caption when the original block had one", () => {
  // caption omitted — blocks[4].caption is "Speed"
  assert.equal(applyTranslation(blocks, answerWith(blocks[4].id, { alt: "grafikon" })), null);
});

test("applyTranslation accepts a missing alt when the original alt was empty", () => {
  const emptyAltBlocks = assignIds([
    { type: "image", originalUrl: "https://a.test/k.png", alt: "", caption: "A caption", path: "1/ghi", placeholder: "data:image/webp;base64,CCC" },
  ] satisfies BlockDraft[]);
  const result = applyTranslation(emptyAltBlocks, [{ id: emptyAltBlocks[0].id, caption: "Egy alcím" }]); // alt omitted
  assert.ok(result);
  assert.equal(result[0].type === "image" && result[0].caption, "Egy alcím");
});

// Minor #8-F: a chapters fixture, kept separate from the shared 5-block fixture above so its item
// count doesn't shift `translatable sends text only`'s assertion of 4 items.
const chaptersBlocks = assignIds([
  { type: "chapters", items: [{ seconds: 0, title: "Intro" }, { seconds: 30, title: "Details" }] },
] satisfies BlockDraft[]);

test("applyTranslation translates chapter titles, keeping their seconds untouched", () => {
  const result = applyTranslation(chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető", "Részletek"] }]);
  assert.ok(result);
  assert.equal(result[0].type === "chapters" && result[0].items[0].title, "Bevezető");
  assert.equal(result[0].type === "chapters" && result[0].items[1].title, "Részletek");
  assert.equal(result[0].type === "chapters" && result[0].items[0].seconds, 0); // only titles go to the model
});

test("applyTranslation rejects a chapters answer whose array is shorter than the original", () => {
  assert.equal(applyTranslation(chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető"] }]), null);
});

test("applyTranslation rejects a whitespace-only chapter title (S11)", () => {
  assert.equal(applyTranslation(chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető", "   "] }]), null);
});

test("chunkTranslatable splits by size and keeps order", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: "x".repeat(4000) }));
  const chunks = chunkTranslatable(items, 10_000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((item) => item.id), items.map((item) => item.id));
});

// Minor #8-H: the first item alone can already exceed maxChars — it must still get its own chunk,
// never dropped and never silently merged past the limit.
test("chunkTranslatable gives an oversized first item its own chunk", () => {
  const items = [{ id: "big", text: "x".repeat(20_000) }, { id: "a", text: "small" }, { id: "b", text: "small" }];
  const chunks = chunkTranslatable(items, 10_000);
  assert.deepEqual(chunks[0].map((item) => item.id), ["big"]);
  assert.deepEqual(chunks.flat().map((item) => item.id), ["big", "a", "b"]);
});

test("translatePost: not_found for a missing post", async () => {
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: null });
  assert.equal(await translatePost(db, 404), "not_found");
});

// Minor #9: a real select failure (RLS glitch, network blip) is not the same as "no such post" —
// it must not be reported as 404-shaped.
test("translatePost: a select error is failed, not not_found", async () => {
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT }, postError: new Error("db down") });
  assert.equal(await translatePost(db, 7), "failed");
});

// A real posts row also requires source_id/kind/url/title (NOT NULL); an upsert's proposed insert
// row is checked against those constraints before conflict resolution even runs, so it 400s on a
// real translation even though this offline fake can't see that. An update, keyed by id and
// carrying only blocks_hu, is the only write shape that's safe against the real schema.
test("translatePost: a successful translation writes blocks_hu via posts.update keyed by id and extracted_at, never an upsert", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.equal(db.postUpserts.length, 0, "must not upsert — an upsert's insert branch fails NOT NULL on a real posts row");
    assert.equal(db.postUpdates.length, 1);
    assert.deepEqual(Object.keys(db.postUpdates[0]), ["blocks_hu"]);
    assert.deepEqual(db.postUpdateFilters.at(-1), [
      { column: "id", value: 7, op: "eq" },
      { column: "extracted_at", value: EXTRACTED_AT, op: "eq" },
    ]);
    const saved = db.postUpdates[0].blocks_hu as Array<Record<string, unknown>>;
    assert.equal(saved.length, blocks.length);
    assert.equal(saved[0].text, "Eredmények"); // heading
    assert.deepEqual(saved[2].items, [[{ text: "egy" }], [{ text: "kettő" }]]); // list — D
    assert.equal(saved[3].code, "x = 1"); // untouched — nothing to translate in a code block
    assert.equal(saved[4].alt, "grafikon"); // image alt — E
    assert.equal(saved[4].caption, "Sebesség"); // image caption — E
    assert.equal(saved[4].placeholder, "data:image/webp;base64,AAA"); // image data copied, not sent to the model
  } finally {
    restoreFetch();
    restoreKey();
  }
});

// Minor #5 (G4): real PostgREST sends `eq.null` for `.eq(col, null)`, which Postgres rejects for a
// timestamp column — the null case must use `.is(...)`, not `.eq(...)`, and the fake now records
// which one was actually called so this is a real assertion, not just a value check.
test("translatePost: writes successfully when extracted_at is null, guarded with .is(...) not .eq(...)", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: null } });
  const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.deepEqual(db.postUpdateFilters.at(-1), [
      { column: "id", value: 7, op: "eq" },
      { column: "extracted_at", value: null, op: "is" },
    ]);
  } finally {
    restoreFetch();
    restoreKey();
  }
});

// Important #2: processSource can re-extract (upsert fresh blocks, blocks_hu: null) while the model
// call below is still running (up to 300s) — the write must not land on top of that newer row.
test("translatePost: a re-extraction mid-run makes the write stale, overwriting nothing", async () => {
  const restoreKey = withGeminiKey();
  const tables: FakeIngestTables = { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } };
  const db = fakeDb({ provider: "gemini", model: "m" }, tables);
  const restoreFetch = mockFetch(() => {
    // Simulates a concurrent processSource() run landing its own upsert while our model call is
    // in flight — a new object, not a mutation, so the post already captured by translatePost keeps
    // its own (now stale) extracted_at reading.
    tables.post = { id: 7, blocks, blocks_hu: null, extracted_at: "2026-02-02T00:00:00Z" };
    return geminiResponse(translatedAnswer);
  });
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "stale");
    assert.equal(db.postUpdates.length, 1); // the write was attempted...
    assert.equal(tables.post?.blocks_hu, null); // ...but never applied — the concurrent row survives untouched
    assert.equal(tables.post?.extracted_at, "2026-02-02T00:00:00Z");
  } finally {
    restoreFetch();
    restoreKey();
  }
});

test("translatePost: an existing valid blocks_hu makes no model call", async () => {
  const validHu = assignIds([{ type: "paragraph", content: [{ text: "már van fordítás" }] }] satisfies BlockDraft[]);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: validHu, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(() => {
    throw new Error("must not call the model when blocks_hu is already translated");
  });
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.equal(db.tasks.length, 0); // model_settings never even queried
    assert.equal(db.postUpdates.length, 0);
    assert.equal(db.postUpserts.length, 0);
  } finally {
    restoreFetch();
  }
});

test("translatePost: an existing [] or garbage blocks_hu is re-translated (same rule as the read path)", async () => {
  const restoreKey = withGeminiKey();
  try {
    for (const badHu of [[], "garbage", [{ id: "x", type: "nope" }]]) {
      const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: badHu, extracted_at: EXTRACTED_AT } });
      const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
      try {
        const result = await translatePost(db, 7);
        assert.equal(result, "ok", `blocks_hu = ${JSON.stringify(badHu)}`);
        assert.equal(db.postUpdates.length, 1, `expected a write for blocks_hu = ${JSON.stringify(badHu)}`);
      } finally {
        restoreFetch();
      }
    }
  } finally {
    restoreKey();
  }
});

// Minor #6: nothing to translate (a bare video post: only a video/repo/divider/code block) must not
// call the model and must not write — but it's still "ok", not an error the reader needs to retry.
test("translatePost: no translatable text means no model call and no write", async () => {
  const bareVideo = assignIds([{ type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" }] satisfies BlockDraft[]);
  assert.equal(translatable(bareVideo).length, 0, "test setup: this fixture must have nothing translatable");
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 9, blocks: bareVideo, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(() => {
    throw new Error("must not call the model when there is nothing translatable");
  });
  try {
    const result = await translatePost(db, 9);
    assert.equal(result, "ok");
    assert.equal(db.tasks.length, 0);
    assert.equal(db.postUpdates.length, 0);
  } finally {
    restoreFetch();
  }
});

test("translatePost: a shape mismatch (model drops a block) writes nothing", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(() =>
    geminiResponse({ blocks: translatedAnswer.blocks.filter((item) => item.id !== blocks[1].id) }),
  );
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "shape");
    assert.equal(db.postUpdates.length, 0);
    assert.equal(db.postUpserts.length, 0);
  } finally {
    restoreFetch();
    restoreKey();
  }
});

test("translatePost: a model failure writes nothing", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(() => geminiText("not valid json"));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "failed");
    assert.equal(db.postUpdates.length, 0);
    assert.equal(db.postUpserts.length, 0);
  } finally {
    restoreFetch();
    restoreKey();
  }
});

// Minor #8-P: `if (error) throw error` right after the update — an update error must not be
// swallowed as a silent "ok".
test("translatePost: an update error is failed, not ok", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb(
    { provider: "gemini", model: "m" },
    { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT }, postUpdateError: new Error("db down") },
  );
  const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "failed");
  } finally {
    restoreFetch();
    restoreKey();
  }
});

test("translatePost: chunk calls run with at most 3 in flight", async () => {
  const restoreKey = withGeminiKey();
  const headingBlocks = assignIds(
    Array.from({ length: 15 }, (_, i) => ({ type: "heading", level: 2 as const, text: `h${i} ${"x".repeat(5000)}` })) satisfies BlockDraft[],
  );
  const chunks = chunkTranslatable(translatable(headingBlocks));
  assert.ok(chunks.length > 3, `test setup needs more chunks than the concurrency cap, got ${chunks.length}`);

  let inFlight = 0;
  let maxInFlight = 0;
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks: headingBlocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  const restoreFetch = mockFetch(async (_url, init) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 15)); // makes real overlap observable
    inFlight--;
    const chunk = JSON.parse(geminiPrompt(init).split("\n\n")[1]) as { id: string }[];
    return geminiResponse({ blocks: chunk.map((item) => ({ id: item.id, text: `hu-${item.id}` })) });
  });
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.equal(maxInFlight, 3);
    assert.equal(db.postUpdates.length, 1);
  } finally {
    restoreFetch();
    restoreKey();
  }
});
