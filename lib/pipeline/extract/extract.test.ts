import assert from "node:assert/strict";
import { test } from "node:test";
import { articleFromHtml } from "./article.ts";
import { isArxivHtml, parseArxivAtom } from "./arxiv.ts";
import { resolveGithubImage } from "./github.ts";
import { fromLlmBlock } from "./pdf.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import type { BlockDraft } from "../../blocks.ts";

const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
// Each paragraph is numbered, not identical, so the html-to-blocks noise filter's adjacent-duplicate
// dedupe (added after this brief was written) doesn't collapse all 12 into one and starve the fixture
// below articleFromHtml's 200-char floor.
const paragraphs = Array.from({ length: 12 }, (_, i) => `<p>Sentence ${i} about local models and inference speed. </p>`).join("");
const article = `<nav>Menu</nav><article><h1>Big news</h1>${paragraphs}
  <figure><img src="/a.png" alt="Chart" width="800" height="400"><figcaption>Speed</figcaption></figure></article>
  <footer>© Site</footer>`;

test("articleFromHtml reads blocks and page metadata", () => {
  const result = articleFromHtml(
    page(`<title>Big news</title><meta property="og:site_name" content="Test Blog"><meta property="article:published_time" content="2026-09-20T10:00:00Z">`, article),
    "https://blog.test/post",
  );
  assert.equal(result.siteName, "Test Blog");
  assert.equal(result.publishedAt, "2026-09-20");
  assert.equal(result.meta.noarchive, undefined);
  assert.ok(result.blocks.some((b) => b.type === "image"));
  assert.ok(result.blocks.every((b) => b.type !== "paragraph" || !b.content.some((s) => s.text.includes("Menu"))));
  assert.ok(result.text.includes("local models"));
});

test("articleFromHtml honours noarchive from meta or header", () => {
  const meta = articleFromHtml(page(`<meta name="robots" content="index, noarchive">`, article), "https://blog.test/p");
  assert.equal(meta.meta.noarchive, true);
  const header = articleFromHtml(page("", article), "https://blog.test/p", "noarchive");
  assert.equal(header.meta.noarchive, true);
});

test("articleFromHtml rejects pages with no readable content", () => {
  assert.throws(() => articleFromHtml(page("", "<div>tiny</div>"), "https://blog.test/p"));
});

test("fromLlmBlock maps the flat model schema and drops malformed blocks", () => {
  assert.deepEqual(fromLlmBlock({ type: "heading", text: "Intro", level: 5 }), { type: "heading", level: 4, text: "Intro" });
  assert.deepEqual(fromLlmBlock({ type: "paragraph", text: "Body" }), { type: "paragraph", content: [{ text: "Body" }] });
  assert.deepEqual(fromLlmBlock({ type: "list", ordered: true, items: ["a", "b"] }), { type: "list", ordered: true, items: [[{ text: "a" }], [{ text: "b" }]] });
  assert.deepEqual(fromLlmBlock({ type: "code", code: "x = 1", language: "py" }), { type: "code", code: "x = 1", language: "py" });
  assert.equal(fromLlmBlock({ type: "list", items: [] }), null);
  assert.equal(fromLlmBlock({ type: "paragraph", text: "  " }), null);
});

test("arXiv helpers", () => {
  assert.equal(isArxivHtml('<div class="ltx_page_main">'), true);
  assert.equal(isArxivHtml("<p>No HTML for this paper</p>"), false);
  const meta = parseArxivAtom(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Attention Is All
      You Need</title><summary>We propose the Transformer.</summary><published>2017-06-12T17:57:34Z</published>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>`);
  assert.deepEqual(meta, { title: "Attention Is All You Need", summary: "We propose the Transformer.", published: "2017-06-12", authors: ["Ashish Vaswani", "Noam Shazeer"] });
});

// Fixture built from the real API-rendered README of facebookresearch/detectron2 (fetched live via
// `GET https://api.github.com/repos/facebookresearch/detectron2/readme`, Accept: application/vnd.github.html+json):
// the plain-relative top image and the absolute camo-proxied badge (here a real snippet from
// tensorflow/tensorflow's rendered README, same shape) are verbatim, except the first image's real filename
// (".github/Detectron2-Logo-Horz.svg") is renamed below to ".github/Detectron2-Horz.svg" — the real name
// contains "logo", which is Task 4's unrelated icon/logo noise filter, not this task's resolution logic, and
// filterNoise runs as part of htmlToDrafts so it would otherwise drop the block before the assertion. GitHub's
// own HTML rendering never rewrites a relative src — it only proxies *absolute* external image URLs through
// camo, leaving same-repo relative paths untouched, which is what actually breaks image resolution here.
// The root-relative ("/docs/banner.png") and API-rendered-absolute-path ("/<owner>/<repo>/raw/<branch>/...")
// shapes are synthetic: neither appeared in a live sample of ~40 major repos' rendered READMEs, but the
// controller's deferred Task 4 finding names both as failure modes to guard against, so they're pinned here too.
const readmeFixture = `
  <img src=".github/Detectron2-Horz.svg" width="300" style="max-width: 100%;">
  <img src="/docs/banner.png" alt="banner">
  <img src="/facebookresearch/detectron2/raw/main/docs/x.png" alt="x">
  <img src="https://camo.githubusercontent.com/4b99b5f67e5e01f9ba4d88092d59b81a473b8f8fba65b8d3b5dd638fafdcee58/68747470733a2f2f7777772e74656e736f72666c6f772e6f72672f696d616765732f74665f6c6f676f5f686f72697a6f6e74616c2e706e67"
       data-canonical-src="https://www.tensorflow.org/images/tf_logo_horizontal.png" style="max-width: 100%;">
`;

test("resolveGithubImage resolves root-relative and API-rendered paths, leaves plain-relative and absolute camo URLs to normal resolution", () => {
  const fullName = "facebookresearch/detectron2";
  const branch = "main";
  const blocks = htmlToDrafts(readmeFixture, {
    baseUrl: `https://github.com/${fullName}/blob/${branch}/`,
    imageBaseUrl: `https://raw.githubusercontent.com/${fullName}/${branch}/`,
    resolveImage: resolveGithubImage(fullName, branch),
  });
  const urls = blocks.map((b) => (b as Extract<BlockDraft, { type: "image" }>).originalUrl);
  assert.deepEqual(urls, [
    "https://raw.githubusercontent.com/facebookresearch/detectron2/main/.github/Detectron2-Horz.svg", // plain relative
    "https://raw.githubusercontent.com/facebookresearch/detectron2/main/docs/banner.png", // root-relative
    "https://github.com/facebookresearch/detectron2/raw/main/docs/x.png", // API-rendered absolute path
    "https://camo.githubusercontent.com/4b99b5f67e5e01f9ba4d88092d59b81a473b8f8fba65b8d3b5dd638fafdcee58/68747470733a2f2f7777772e74656e736f72666c6f772e6f72672f696d616765732f74665f6c6f676f5f686f72697a6f6e74616c2e706e67", // absolute camo, untouched
  ]);
});
