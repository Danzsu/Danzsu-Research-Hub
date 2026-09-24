import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import {
  isValidPlaceholder,
  isValidVimeoId,
  isValidYoutubeId,
  parseTranslatedBlocks,
  readMinutes,
  videoEmbedSrc,
  withQuery,
} from "./post-view.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

test("readMinutes is null for youtube regardless of block content", () => {
  const blocks = assignIds([p(words(1000))]);
  assert.equal(readMinutes(blocks, "youtube"), null);
});

test("readMinutes is null for empty or near-empty extractions, not '1 min'", () => {
  assert.equal(readMinutes([], "article"), null); // extractionFailed / 0 blocks
  assert.equal(readMinutes(assignIds([p("")]), "article"), null); // the "".split bug case
  assert.equal(readMinutes(assignIds([p("only three words")]), "article"), null);
});

test("readMinutes floors at 1 and rounds by word count for real text", () => {
  assert.equal(readMinutes(assignIds([p(words(20))]), "article"), 1);
  assert.equal(readMinutes(assignIds([p(words(440))]), "article"), 2);
});

test("parseTranslatedBlocks treats [] and unparseable jsonb as no translation", () => {
  assert.equal(parseTranslatedBlocks([]), null);
  assert.equal(parseTranslatedBlocks(null), null);
  assert.equal(parseTranslatedBlocks("garbage"), null);
  assert.equal(parseTranslatedBlocks([{ id: "x", type: "nope" }]), null);
});

test("parseTranslatedBlocks keeps a real translated body", () => {
  const valid = assignIds([p("fordítás")]);
  assert.deepEqual(parseTranslatedBlocks(valid), valid);
});

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
