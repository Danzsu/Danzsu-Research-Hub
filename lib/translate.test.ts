import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type Block, type BlockDraft } from "./blocks.ts";
import { fakeDb, type FakeIngestTables } from "./pipeline/fake-db.ts";
import { geminiPrompt, geminiResponse, geminiText, mockFetch, withGeminiKey } from "./pipeline/mock-fetch.ts";
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

// block.caption is optional; a model that invents one for a block that
// never had one must not have that invention saved.
test("applyTranslation applies a translated caption only when the original block had one", () => {
  const noCaptionBlocks = assignIds([
    { type: "image", originalUrl: "https://a.test/j.png", alt: "chart", path: "1/def", placeholder: "data:image/webp;base64,BBB" },
  ] satisfies BlockDraft[]);
  const result = applyTranslation(noCaptionBlocks, [{ id: noCaptionBlocks[0].id, alt: "grafikon", caption: "kitalált alcím" }]);
  assert.ok(result);
  assert.equal(result[0].type === "image" && result[0].caption, undefined);
});

// alt must not be required when the original alt was already empty: otherwise an image with alt: ""
// plus a caption fails every retry once the model drops the empty alt.
test("applyTranslation accepts a missing alt when the original alt was empty", () => {
  const emptyAltBlocks = assignIds([
    { type: "image", originalUrl: "https://a.test/k.png", alt: "", caption: "A caption", path: "1/ghi", placeholder: "data:image/webp;base64,CCC" },
  ] satisfies BlockDraft[]);
  const result = applyTranslation(emptyAltBlocks, [{ id: emptyAltBlocks[0].id, caption: "Egy alcím" }]); // alt omitted
  assert.ok(result);
  assert.equal(result[0].type === "image" && result[0].caption, "Egy alcím");
});

// An empty original alt means a decorative image — the model's alt must be
// ignored outright (not just optional), or a made-up (or 100k-character) alt turns it into an
// announced image and saves an uncapped string.
test("applyTranslation ignores the model's alt entirely when the original alt was empty (decorative image)", () => {
  const decorativeBlocks = assignIds([
    { type: "image", originalUrl: "https://a.test/l.png", alt: "", caption: "A caption", path: "1/jkl", placeholder: "data:image/webp;base64,DDD" },
  ] satisfies BlockDraft[]);
  const result = applyTranslation(decorativeBlocks, [{ id: decorativeBlocks[0].id, alt: "x".repeat(100_000), caption: "Egy alcím" }]);
  assert.ok(result);
  assert.equal(result[0].type === "image" && result[0].alt, "");
  assert.equal(result[0].type === "image" && result[0].caption, "Egy alcím");
});

// A chapters fixture, kept separate from the shared 5-block fixture above so its item
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

const longOriginal = "A fairly long heading that is definitely not a short string to translate";
const longBlocks = assignIds([{ type: "heading", level: 2, text: longOriginal }] satisfies BlockDraft[]);
const singleSpanBlocks = assignIds([{ type: "paragraph", content: [{ text: "Hello there" }] }] satisfies BlockDraft[]);

// Each answer below is valid but for one flaw, and must be refused whole: a filled blocks_hu hides the
// Translate button for good, so a half-right translation would be the last one the post gets.
const refused: [string, Block[], TranslationItem[]][] = [
  ["a missing block", blocks, [{ id: blocks[0].id, text: "Eredmények" }]],
  ["an answer that translates nothing (ids only, every field missing)", blocks, translatable(blocks).map((item) => ({ id: item.id }))],
  ["a list whose items array is shorter than the original (2 items, 1 translated)", blocks, answerWith(blocks[2].id, { items: [["egy"]] })],
  ["a non-empty original coming back empty", blocks, answerWith(blocks[0].id, { text: "" })],
  ["an answer ~10x the original length (degenerate repetition loop)", longBlocks, [{ id: longBlocks[0].id, text: "x".repeat(longOriginal.length * 10) }]],
  // A span-count mismatch falls back to the joined text, which is validated like any other field.
  ["empty spans for a mismatched paragraph (spans: [])", blocks, answerWith(blocks[1].id, { spans: [] })],
  ['a whitespace-only span for a mismatched paragraph (["   "])', blocks, answerWith(blocks[1].id, { spans: ["   "] })],
  ["a mismatched paragraph whose joined spans total 100 001 characters", blocks, answerWith(blocks[1].id, { spans: ["x".repeat(50_000), "x".repeat(50_001)] })],
  ["a single-span paragraph answered with spans: []", singleSpanBlocks, [{ id: singleSpanBlocks[0].id, spans: [] }]],
  ["an empty list item ([])", blocks, answerWith(blocks[2].id, { items: [[], ["kettő"]] })],
  ["a 50 000-character list item", blocks, answerWith(blocks[2].id, { items: [["a", "x".repeat(50_000)], ["kettő"]] })],
  // Each type's own presence check, alone: the entry is there, its field is not.
  ["a missing heading text alone", blocks, answerWith(blocks[0].id, {})],
  ["a missing paragraph spans field alone", blocks, answerWith(blocks[1].id, {})],
  ["a missing image alt alone, when the original alt was non-empty", blocks, answerWith(blocks[4].id, { caption: "Sebesség" })],
  ["a missing caption when the original block had one", blocks, answerWith(blocks[4].id, { alt: "grafikon" })],
  // Blank text, per field.
  ["a whitespace-only span at a matching span count", blocks, answerWith(blocks[1].id, { spans: ["Olvasd el a ", "   ", " most."] })],
  ["a whitespace-only list-item span at a matching count", blocks, answerWith(blocks[2].id, { items: [["  "], ["kettő"]] })],
  ["a whitespace-only caption when the original had one", blocks, answerWith(blocks[4].id, { alt: "grafikon", caption: "   " })],
  ["a whitespace-only heading answer", blocks, answerWith(blocks[0].id, { text: "   " })],
  ["a chapters answer whose array is shorter than the original", chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető"] }]],
  ["a whitespace-only chapter title", chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető", "   "] }]],
];

for (const [name, original, answer] of refused) {
  test(`applyTranslation rejects ${name}`, () => {
    assert.equal(applyTranslation(original, answer), null);
  });
}

test("chunkTranslatable splits by size and keeps order", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: "x".repeat(4000) }));
  const chunks = chunkTranslatable(items, 10_000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((item) => item.id), items.map((item) => item.id));
});

// The first item alone can already exceed maxChars — it must still get its own chunk,
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

// A real select failure (RLS glitch, network blip) is not the same as "no such post" —
// it must not be reported as 404-shaped.
test("translatePost: a select error is failed, not not_found", async () => {
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT }, postError: new Error("db down") });
  assert.equal(await translatePost(db, 7), "failed");
});

// A real posts row also requires source_id/kind/url/title (NOT NULL); an upsert's proposed insert
// row is checked against those constraints before conflict resolution even runs, so it 400s on a
// real translation even though this offline fake can't see that. An update, keyed by id and
// carrying only blocks_hu, is the only write shape that's safe against the real schema.
test("translatePost: a successful translation writes blocks_hu via posts.update keyed by id and extracted_at, never an upsert", async (t) => {
  withGeminiKey(t);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  mockFetch(t, () => geminiResponse(translatedAnswer));
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
});

// Real PostgREST sends `eq.null` for `.eq(col, null)`, which Postgres rejects for a timestamp
// column — the null case must use `.is(...)`, not `.eq(...)`. The fake records which one was
// called, so this is a real assertion, not just a value check.
test("translatePost: writes successfully when extracted_at is null, guarded with .is(...) not .eq(...)", async (t) => {
  withGeminiKey(t);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: null } });
  mockFetch(t, () => geminiResponse(translatedAnswer));
  const result = await translatePost(db, 7);
  assert.equal(result, "ok");
  assert.deepEqual(db.postUpdateFilters.at(-1), [
    { column: "id", value: 7, op: "eq" },
    { column: "extracted_at", value: null, op: "is" },
  ]);
});

// processSource can re-extract (upsert fresh blocks, blocks_hu: null) while the model
// call below is still running (up to 300s) — the write must not land on top of that newer row.
test("translatePost: a re-extraction mid-run makes the write stale, overwriting nothing", async (t) => {
  withGeminiKey(t);
  const tables: FakeIngestTables = { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } };
  const db = fakeDb({ provider: "gemini", model: "m" }, tables);
  mockFetch(t, () => {
    // Simulates a concurrent processSource() run landing its own upsert while our model call is
    // in flight — a new object, not a mutation, so the post already captured by translatePost keeps
    // its own (now stale) extracted_at reading.
    tables.post = { id: 7, blocks, blocks_hu: null, extracted_at: "2026-02-02T00:00:00Z" };
    return geminiResponse(translatedAnswer);
  });
  const result = await translatePost(db, 7);
  assert.equal(result, "stale");
  assert.equal(db.postUpdates.length, 1); // the write was attempted...
  assert.equal(tables.post?.blocks_hu, null); // ...but never applied — the concurrent row survives untouched
  assert.equal(tables.post?.extracted_at, "2026-02-02T00:00:00Z");
});

test("translatePost: an existing valid blocks_hu makes no model call", async (t) => {
  const validHu = assignIds([{ type: "paragraph", content: [{ text: "már van fordítás" }] }] satisfies BlockDraft[]);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: validHu, extracted_at: EXTRACTED_AT } });
  mockFetch(t, () => {
    throw new Error("must not call the model when blocks_hu is already translated");
  });
  const result = await translatePost(db, 7);
  assert.equal(result, "ok");
  assert.equal(db.tasks.length, 0); // model_settings never even queried
  assert.equal(db.postUpdates.length, 0);
  assert.equal(db.postUpserts.length, 0);
});

test("translatePost: an existing [] or garbage blocks_hu is re-translated (same rule as the read path)", async (t) => {
  withGeminiKey(t);
  for (const badHu of [[], "garbage", [{ id: "x", type: "nope" }]]) {
    const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: badHu, extracted_at: EXTRACTED_AT } });
    mockFetch(t, () => geminiResponse(translatedAnswer));
    const result = await translatePost(db, 7);
    assert.equal(result, "ok", `blocks_hu = ${JSON.stringify(badHu)}`);
    assert.equal(db.postUpdates.length, 1, `expected a write for blocks_hu = ${JSON.stringify(badHu)}`);
  }
});

// Nothing to translate (a bare video post: only a video/repo/divider/code block) must not
// call the model and must not write — but it's still "ok", not an error the reader needs to retry.
test("translatePost: no translatable text means no model call and no write", async (t) => {
  const bareVideo = assignIds([{ type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" }] satisfies BlockDraft[]);
  assert.equal(translatable(bareVideo).length, 0, "test setup: this fixture must have nothing translatable");
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 9, blocks: bareVideo, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  mockFetch(t, () => {
    throw new Error("must not call the model when there is nothing translatable");
  });
  const result = await translatePost(db, 9);
  assert.equal(result, "ok");
  assert.equal(db.tasks.length, 0);
  assert.equal(db.postUpdates.length, 0);
});

test("translatePost: a shape mismatch (model drops a block) writes nothing", async (t) => {
  withGeminiKey(t);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  mockFetch(t, () =>
    geminiResponse({ blocks: translatedAnswer.blocks.filter((item) => item.id !== blocks[1].id) }),
  );
  const result = await translatePost(db, 7);
  assert.equal(result, "shape");
  assert.equal(db.postUpdates.length, 0);
  assert.equal(db.postUpserts.length, 0);
});

test("translatePost: a model failure writes nothing", async (t) => {
  withGeminiKey(t);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  mockFetch(t, () => geminiText("not valid json"));
  const result = await translatePost(db, 7);
  assert.equal(result, "failed");
  assert.equal(db.postUpdates.length, 0);
  assert.equal(db.postUpserts.length, 0);
});

// `if (error) throw error` right after the update — an update error must not be
// swallowed as a silent "ok".
test("translatePost: an update error is failed, not ok", async (t) => {
  withGeminiKey(t);
  const db = fakeDb(
    { provider: "gemini", model: "m" },
    { post: { id: 7, blocks, blocks_hu: null, extracted_at: EXTRACTED_AT }, postUpdateError: new Error("db down") },
  );
  mockFetch(t, () => geminiResponse(translatedAnswer));
  const result = await translatePost(db, 7);
  assert.equal(result, "failed");
});

test("translatePost: chunk calls run with at most 3 in flight", async (t) => {
  withGeminiKey(t);
  const headingBlocks = assignIds(
    Array.from({ length: 15 }, (_, i) => ({ type: "heading", level: 2 as const, text: `h${i} ${"x".repeat(5000)}` })) satisfies BlockDraft[],
  );
  const chunks = chunkTranslatable(translatable(headingBlocks));
  assert.ok(chunks.length > 3, `test setup needs more chunks than the concurrency cap, got ${chunks.length}`);

  let inFlight = 0;
  let maxInFlight = 0;
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks: headingBlocks, blocks_hu: null, extracted_at: EXTRACTED_AT } });
  mockFetch(t, async (_url, init) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 15)); // makes real overlap observable
    inFlight--;
    const chunk = JSON.parse(geminiPrompt(init).split("\n\n")[1]) as { id: string }[];
    return geminiResponse({ blocks: chunk.map((item) => ({ id: item.id, text: `hu-${item.id}` })) });
  });
  const result = await translatePost(db, 7);
  assert.equal(result, "ok");
  assert.equal(maxInFlight, 3);
  assert.equal(db.postUpdates.length, 1);
});
