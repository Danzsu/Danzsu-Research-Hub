import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft, type ImageBlock } from "./blocks.ts";
import {
  editPayload,
  isBlockVisible,
  isValidPlaceholder,
  isValidVimeoId,
  mediaSources,
  primaryVideoId,
  videoEmbedSrc,
  withQuery,
  type PostQuery,
} from "./post-view.ts";
import { isValidYoutubeId } from "./pipeline/util.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });

test("isValidYoutubeId and isValidVimeoId reject anything that isn't the expected id shape", () => {
  assert.equal(isValidYoutubeId("dQw4w9WgXcQ"), true);
  for (const bad of ["short", "toolongvideoid123", "has space12", "javascript:alert(1)//"]) {
    assert.equal(isValidYoutubeId(bad), false, bad);
  }
  assert.equal(isValidVimeoId("123456789"), true);
  for (const bad of ["", "12a", "1.2", "-1", "1e9"]) {
    assert.equal(isValidVimeoId(bad), false, bad);
  }
});

test("isValidPlaceholder accepts only a base64 data: image URL, not svg or script injection", () => {
  assert.equal(isValidPlaceholder("data:image/avif;base64,AAAA"), true);
  assert.equal(isValidPlaceholder("data:image/webp;base64,AAAA=="), true);
  for (const bad of [
    "data:image/svg+xml;base64,AAAA", // svg is never stored — see lib/media.ts
    "javascript:alert(1)",
    "data:text/html;base64,AAAA",
    "data:image/png;base64,AAA A", // whitespace can't sneak in
    'data:image/png;base64,AAA");background:url(evil',
    "",
  ]) {
    assert.equal(isValidPlaceholder(bad), false, bad);
  }
});

test("videoEmbedSrc rejects an invalid id instead of building an iframe src from it", () => {
  assert.equal(videoEmbedSrc({ id: "b1", type: "video", provider: "youtube", videoId: "not-11-chars" }), null);
  assert.equal(videoEmbedSrc({ id: "b1", type: "video", provider: "vimeo", videoId: "not-numeric" }), null);
});

test("videoEmbedSrc: youtube uses block.start by default, autoplay only when explicitly asked", () => {
  const block = { id: "b1", type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ", start: 30 } as const;
  assert.equal(videoEmbedSrc(block), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30");
  assert.equal(videoEmbedSrc(block, { autoplay: true }), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30&autoplay=1");
  // An explicit ?t= overrides the block's own default start.
  assert.equal(videoEmbedSrc(block, { start: 90, autoplay: true }), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&autoplay=1");
});

test("videoEmbedSrc: vimeo always sends dnt=1 and appends the start as a #t= hash", () => {
  const block = { id: "b1", type: "video", provider: "vimeo", videoId: "76979871" } as const;
  assert.equal(videoEmbedSrc(block), "https://player.vimeo.com/video/76979871?dnt=1");
  assert.equal(videoEmbedSrc(block, { start: 45 }), "https://player.vimeo.com/video/76979871?dnt=1#t=45s");
});

test("withQuery merges updates over the current query, keeping every other param", () => {
  assert.equal(withQuery({ text: "hu", hidden: "show" }, { t: "125" }), "?text=hu&hidden=show&t=125");
  assert.equal(withQuery({ hidden: "old" }, { hidden: "show" }), "?hidden=show");
  assert.equal(withQuery({}, {}), "");
});

test("withQuery keeps the edit key — the post editor depends on it surviving every link, including a chapter jump", () => {
  assert.equal(withQuery({ edit: "1" }, { t: "10" }), "?t=10&edit=1");
  assert.equal(withQuery({}, { edit: "1" }), "?edit=1");
});

test("withQuery drops keys outside its allowlist and drops empty values", () => {
  // A key not in PostQuery must never reach the URL, and "" must be treated as absent, not as a real value.
  const dirty = { text: "hu", hidden: "", evil: "1" } as unknown as PostQuery;
  assert.equal(withQuery({}, dirty), "?text=hu");
});

test("withQuery clears a key when the caller explicitly sets it to undefined", () => {
  assert.equal(withQuery({ hidden: "show", t: "45" }, { hidden: "show", t: undefined }), "?hidden=show");
});

const imageBlock = (overrides: Partial<ImageBlock>): ImageBlock => ({
  id: "b1",
  type: "image",
  originalUrl: "https://x.test/a.png",
  alt: "",
  path: "7/abcdef0123456789",
  format: "avif",
  widths: [640, 1280],
  width: 640,
  height: 400,
  ...overrides,
});

test("mediaSources builds src/srcSet only from a real /media key", () => {
  const result = mediaSources(imageBlock({}));
  assert.equal(result?.src, "/media/7/abcdef0123456789-1280.avif");
  assert.equal(result?.srcSet, "/media/7/abcdef0123456789-640.avif 640w, /media/7/abcdef0123456789-1280.avif 1280w");
});

test("mediaSources returns null when path/format/widths are missing", () => {
  assert.equal(mediaSources(imageBlock({ path: null })), null);
  assert.equal(mediaSources(imageBlock({ format: undefined })), null);
  assert.equal(mediaSources(imageBlock({ widths: [] })), null);
});

test("mediaSources returns null for a path that isn't a well-formed media key (off-origin smuggling guard)", () => {
  assert.equal(mediaSources(imageBlock({ path: "evil.com/x" })), null);
  assert.equal(mediaSources(imageBlock({ path: "7/tooshort" })), null);
  assert.equal(mediaSources(imageBlock({ path: "7/abcdef0123456789/../../secret" })), null);
});

test("primaryVideoId picks the first block whose embed actually validates, skipping an invalid one before it", () => {
  const blocks = assignIds([
    { type: "video", provider: "youtube", videoId: "not-11-chars" }, // invalid — must not claim the anchor
    { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
    { type: "video", provider: "vimeo", videoId: "76979871" },
  ]);
  assert.equal(primaryVideoId(blocks), blocks[1].id);
});

test("primaryVideoId is null with no video blocks, or none that validate", () => {
  assert.equal(primaryVideoId(assignIds([p("just text")])), null);
  assert.equal(primaryVideoId(assignIds([{ type: "video", provider: "vimeo", videoId: "not-numeric" }])), null);
});

test("isBlockVisible: a hidden block only renders with showHidden or controls mode, a plain one always does", () => {
  const hidden = new Set(["h1"]);
  assert.equal(isBlockVisible("h1", hidden, false, false), false);
  assert.equal(isBlockVisible("h1", hidden, true, false), true);
  assert.equal(isBlockVisible("h1", hidden, false, true), true);
  assert.equal(isBlockVisible("h1", hidden, true, true), true);
  assert.equal(isBlockVisible("other", hidden, false, false), true);
});

const generated = { generatedTitle: { hu: "gépi cím", en: "model title" }, generatedSummary: { hu: "gépi összefoglaló", en: "model summary" } };

test("editPayload: hide-only (title/summary unchanged from the model) sends only hidden", () => {
  const draft = { title: generated.generatedTitle, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, ["b1"]), { hidden: ["b1"] });
});

test("editPayload: an unchanged title is omitted, a changed summary is sent", () => {
  const draft = { title: generated.generatedTitle, summary: { hu: "új összefoglaló", en: generated.generatedSummary.en } };
  const payload = editPayload(generated, draft, []);
  assert.equal("title" in payload, false);
  assert.deepEqual(payload.summary, draft.summary);
});

test("editPayload: a changed HU title only sends the title, not the unchanged summary", () => {
  const draft = { title: { hu: "új cím", en: generated.generatedTitle.en }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, []), { title: draft.title, hidden: [] });
});

test("editPayload: a changed EN-only title also sends the title, not only a changed HU one", () => {
  const draft = { title: { hu: generated.generatedTitle.hu, en: "a new EN title" }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, draft, []), { title: draft.title, hidden: [] });
});

test("editPayload: trailing/leading whitespace alone doesn't count as a change, since the server trims on save", () => {
  const draft = {
    title: { hu: `${generated.generatedTitle.hu} `, en: generated.generatedTitle.en },
    summary: { hu: generated.generatedSummary.hu, en: `  ${generated.generatedSummary.en}` },
  };
  assert.deepEqual(editPayload(generated, draft, ["b1"]), { hidden: ["b1"] });
});

test("editPayload: a field reset back to the model text is omitted, clearing any existing override", () => {
  const edited = { title: { hu: "ideiglenes cím", en: generated.generatedTitle.en }, summary: generated.generatedSummary };
  assert.deepEqual(editPayload(generated, edited, []).title, edited.title);
  const reset = { title: generated.generatedTitle, summary: generated.generatedSummary }; // "Original" clicked
  assert.equal("title" in editPayload(generated, reset, []), false);
});
