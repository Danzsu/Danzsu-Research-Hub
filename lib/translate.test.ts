import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import { fakeDb, geminiPrompt, geminiResponse, geminiText, mockFetch, withGeminiKey } from "./pipeline/mock-fetch.ts";
import { applyTranslation, chunkTranslatable, translatable, translatePost } from "./translate.ts";

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
  const result = applyTranslation(blocks, [
    { id: blocks[0].id, text: "Eredmények" },
    { id: blocks[1].id, spans: ["Olvasd el most a cikket."] },
    { id: blocks[2].id, items: [["egy"], ["kettő"]] },
    { id: blocks[4].id, alt: "grafikon", caption: "Sebesség" },
  ]);
  assert.ok(result);
  assert.deepEqual(result[1].type === "paragraph" && result[1].content, [{ text: "Olvasd el most a cikket." }]);
});

test("applyTranslation rejects a missing block", () => {
  assert.equal(applyTranslation(blocks, [{ id: blocks[0].id, text: "Eredmények" }]), null);
});

test("chunkTranslatable splits by size and keeps order", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: "x".repeat(4000) }));
  const chunks = chunkTranslatable(items, 10_000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((item) => item.id), items.map((item) => item.id));
});

test("translatePost: not_found for a missing post", async () => {
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: null });
  assert.equal(await translatePost(db, 404), "not_found");
});

test("translatePost: a successful translation writes blocks_hu", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null } });
  const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.equal(db.postUpserts.length, 1);
    assert.equal(db.postUpserts[0].id, 7);
    const saved = db.postUpserts[0].blocks_hu as Array<Record<string, unknown>>;
    assert.equal(saved.length, blocks.length);
    assert.equal(saved[0].text, "Eredmények");
    assert.equal(saved[3].code, "x = 1"); // untouched — nothing to translate in a code block
    assert.equal(saved[4].placeholder, "data:image/webp;base64,AAA"); // image data copied, not sent to the model
  } finally {
    restoreFetch();
    restoreKey();
  }
});

test("translatePost: an existing valid blocks_hu makes no model call", async () => {
  const validHu = assignIds([{ type: "paragraph", content: [{ text: "már van fordítás" }] }] satisfies BlockDraft[]);
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: validHu } });
  const restoreFetch = mockFetch(() => {
    throw new Error("must not call the model when blocks_hu is already translated");
  });
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "ok");
    assert.equal(db.tasks.length, 0); // model_settings never even queried
    assert.equal(db.postUpserts.length, 0);
  } finally {
    restoreFetch();
  }
});

test("translatePost: an existing [] or garbage blocks_hu is re-translated (same rule as the read path)", async () => {
  const restoreKey = withGeminiKey();
  try {
    for (const badHu of [[], "garbage", [{ id: "x", type: "nope" }]]) {
      const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: badHu } });
      const restoreFetch = mockFetch(() => geminiResponse(translatedAnswer));
      try {
        const result = await translatePost(db, 7);
        assert.equal(result, "ok", `blocks_hu = ${JSON.stringify(badHu)}`);
        assert.equal(db.postUpserts.length, 1, `expected a write for blocks_hu = ${JSON.stringify(badHu)}`);
      } finally {
        restoreFetch();
      }
    }
  } finally {
    restoreKey();
  }
});

test("translatePost: a shape mismatch (model drops a block) writes nothing", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null } });
  const restoreFetch = mockFetch(() =>
    geminiResponse({ blocks: translatedAnswer.blocks.filter((item) => item.id !== blocks[1].id) }),
  );
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "shape");
    assert.equal(db.postUpserts.length, 0);
  } finally {
    restoreFetch();
    restoreKey();
  }
});

test("translatePost: a model failure writes nothing", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks, blocks_hu: null } });
  const restoreFetch = mockFetch(() => geminiText("not valid json"));
  try {
    const result = await translatePost(db, 7);
    assert.equal(result, "failed");
    assert.equal(db.postUpserts.length, 0);
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
  const db = fakeDb({ provider: "gemini", model: "m" }, { post: { id: 7, blocks: headingBlocks, blocks_hu: null } });
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
    assert.equal(db.postUpserts.length, 1);
  } finally {
    restoreFetch();
    restoreKey();
  }
});
