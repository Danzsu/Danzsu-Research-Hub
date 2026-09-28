import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import { parseTranslatedBlocks, readMinutes, toPost } from "./post-row.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

test("readMinutes is null for youtube regardless of block content", () => {
  const blocks = assignIds([p(words(1000))]);
  assert.equal(readMinutes(blocks, "youtube"), null);
});

test("readMinutes is null for empty or near-empty extractions, not '1 min'", () => {
  assert.equal(readMinutes([], "article"), null); // extractionFailed / 0 blocks
  assert.equal(readMinutes(assignIds([p("")]), "article"), null); // "".split(/\s+/) is [""], one empty "word"
  assert.equal(readMinutes(assignIds([p("only three words")]), "article"), null);
});

test("readMinutes floors at 1 and rounds by word count for real text", () => {
  assert.equal(readMinutes(assignIds([p(words(20))]), "article"), 1);
  assert.equal(readMinutes(assignIds([p(words(440))]), "article"), 2);
});

test("readMinutes boundary: 9 words is too few, 10 is enough", () => {
  assert.equal(readMinutes(assignIds([p(words(9))]), "article"), null);
  assert.equal(readMinutes(assignIds([p(words(10))]), "article"), 1);
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

const postRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 7,
  source_id: 3,
  kind: "article",
  url: "https://blog.test/a",
  author: null,
  source_site: "Blog",
  published_at: "2026-09-22",
  title: { hu: "Gépi cím", en: "Model title" },
  summary: { hu: "Gépi összefoglaló", en: "Model summary" },
  key_points: { hu: [], en: [] },
  tags: ["llm"],
  meta: { mirrored: true },
  overrides: {},
  hidden_blocks: [],
  extracted_at: null,
  created_at: "2026-09-22T10:00:00Z",
  ...overrides,
});

test("toPost lets the submitter's title and summary win, keeping the model's text as the reset target", () => {
  const post = toPost(postRow({ overrides: { title: { hu: "Saját cím", en: "Own title" } } }));
  assert.deepEqual(post.title, { hu: "Saját cím", en: "Own title" });
  assert.deepEqual(post.generatedTitle, { hu: "Gépi cím", en: "Model title" });
  assert.deepEqual(post.summary, { hu: "Gépi összefoglaló", en: "Model summary" }); // no summary override
  assert.deepEqual(post.generatedSummary, post.summary);
});

test("toPost ignores a malformed override field instead of showing it", () => {
  const post = toPost(postRow({ overrides: { title: { hu: "", en: "x" }, summary: { hu: "Saját", en: "Own" } } }));
  assert.deepEqual(post.title, { hu: "Gépi cím", en: "Model title" });
  assert.deepEqual(post.summary, { hu: "Saját", en: "Own" });
});

test("toPost reads the submitter from the sources embed and defaults the optional columns", () => {
  const listed = toPost(postRow({ meta: null, hidden_blocks: "garbage" })); // the list query has no embed
  assert.equal(listed.submittedBy, null);
  assert.deepEqual(listed.meta, {});
  assert.deepEqual(listed.hiddenBlocks, []);
  assert.deepEqual(listed.blocks, []);
  assert.equal(listed.blocksHu, null);
  const full = toPost(postRow({ sources: { submitted_by: "user-1" }, hidden_blocks: ["b1", 5] }));
  assert.equal(full.submittedBy, "user-1");
  assert.deepEqual(full.hiddenBlocks, ["b1"]);
});

test("toPost carries the source's last extraction error, and null when there is none", () => {
  assert.equal(toPost(postRow({ sources: { submitted_by: "user-1", error: "fetch 404" } })).lastError, "fetch 404");
  assert.equal(toPost(postRow({ sources: { submitted_by: "user-1", error: null } })).lastError, null);
  assert.equal(toPost(postRow()).lastError, null); // the list query has no embed
});
