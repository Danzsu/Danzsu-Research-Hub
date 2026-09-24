import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToBlocks, htmlToDrafts } from "./html-to-blocks.ts";
import type { BlockDraft } from "../blocks.ts";

const base = { baseUrl: "https://blog.test/posts/one" };
const types = (blocks: BlockDraft[]) => blocks.map((b) => b.type);

test("converts headings, paragraphs with inline marks, lists, quotes and code", () => {
  const blocks = htmlToDrafts(
    `<h1>Title</h1><p>Plain <strong>bold</strong> <em>it</em> <code>x()</code> <a href="/doc">doc</a>.</p>
     <ul><li>one</li><li>two <a href="https://ext.test/">ext</a></li></ul>
     <blockquote><p>Quoted</p></blockquote>
     <pre><code class="language-ts">const a = 1;\nconst b = 2;</code></pre><hr><h4>Small</h4>`,
    base,
  );
  assert.deepEqual(types(blocks), ["heading", "paragraph", "list", "quote", "code", "divider", "heading"]);
  const paragraph = blocks[1] as Extract<BlockDraft, { type: "paragraph" }>;
  assert.deepEqual(paragraph.content, [
    { text: "Plain " }, { text: "bold", bold: true }, { text: " " }, { text: "it", italic: true }, { text: " " },
    { text: "x()", code: true }, { text: " " }, { text: "doc", href: "https://blog.test/doc" }, { text: "." },
  ]);
  const code = blocks[4] as Extract<BlockDraft, { type: "code" }>;
  assert.equal(code.language, "ts");
  assert.equal(code.code, "const a = 1;\nconst b = 2;");
  assert.equal((blocks[6] as Extract<BlockDraft, { type: "heading" }>).level, 4);
});

test("figures become images with captions; images inside paragraphs are hoisted", () => {
  const blocks = htmlToDrafts(
    `<figure><img src="/img/a.png" alt="Chart" width="800" height="400"><figcaption>Figure 1</figcaption></figure>
     <p>Before <img src="https://cdn.test/b.jpg" alt=""> after</p>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "paragraph", "image"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/img/a.png");
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).caption, "Figure 1");
});

test("lazy images: data-src, srcset and picture", () => {
  const blocks = htmlToDrafts(
    `<img src="data:image/gif;base64,R0lGOD" data-src="/lazy.png" alt="a">
     <img srcset="/s-480.jpg 480w, /s-1200.jpg 1200w" alt="b">
     <picture><source srcset="/p.avif"><img src="/p.jpg" alt="c"></picture>`,
    base,
  );
  assert.deepEqual(
    blocks.map((b) => (b as Extract<BlockDraft, { type: "image" }>).originalUrl),
    ["https://blog.test/lazy.png", "https://blog.test/s-1200.jpg", "https://blog.test/p.jpg"],
  );
});

test("resolves relative image URLs against imageBaseUrl", () => {
  const blocks = htmlToDrafts(`<p><img src="docs/shot.png" alt=""></p><img src="//cdn.test/x.png" alt="">`, {
    baseUrl: "https://github.com/a/b/blob/main/",
    imageBaseUrl: "https://raw.githubusercontent.com/a/b/main/",
  });
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://raw.githubusercontent.com/a/b/main/docs/shot.png");
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://cdn.test/x.png");
});

test("layer 1 removes chrome and noise containers but never the article", () => {
  const blocks = htmlToDrafts(
    `<nav>Menu</nav><div class="ad-slot">Buy now</div><div id="newsletter-box"><p>Join 10k readers</p></div>
     <div data-ad-unit="x"><p>Promo</p></div><aside>Side</aside><footer>Foot</footer>
     <div class="social-share"><a href="https://twitter.com/intent/tweet">Tweet</a></div>
     <iframe src="https://ads.test/frame"></iframe>
     <div class="post-share-enabled"><p>${"Real article text. ".repeat(100)}</p></div>`,
    base,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
});

test("layer 2 drops icons, tracking pixels, share links, boilerplate and duplicates", () => {
  const blocks = htmlToDrafts(
    `<p>Keep this sentence about models.</p><p>Keep this sentence about models.</p>
     <img src="/static/logo.svg" alt=""><img src="/x.png" width="1" height="1" alt="">
     <img src="https://img.shields.io/badge/build-passing-green" alt="">
     <p><a href="https://www.facebook.com/sharer/sharer.php?u=x">Share on Facebook</a></p>
     <p>Subscribe to our newsletter</p><h2>Related articles</h2>
     <p><a href="/next">Next post</a></p><p><a href="https://arxiv.org/abs/1">Read the paper</a></p>
     <p><a href="javascript:alert(1)">bad</a> link text here stays</p>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "paragraph", "paragraph"]);
  const last = blocks[2] as Extract<BlockDraft, { type: "paragraph" }>;
  assert.equal(last.content.some((s) => s.href), false);
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "paragraph" }>).content[0].href, "https://arxiv.org/abs/1");
});

test("math keeps its alttext, youtube iframes become video blocks, tables become lists", () => {
  const blocks = htmlToDrafts(
    `<p>Energy <math alttext="E=mc^2"><mi>E</mi></math> holds.</p>
     <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
     <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "video", "list"]);
  assert.deepEqual((blocks[0] as Extract<BlockDraft, { type: "paragraph" }>).content[1], { text: "E=mc^2", code: true });
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "video" }>).videoId, "dQw4w9WgXcQ");
  assert.equal((blocks[2] as Extract<BlockDraft, { type: "list" }>).items.length, 2);
});

test("htmlToBlocks assigns ids", () => {
  const blocks = htmlToBlocks("<p>a</p><p>b</p>", base);
  assert.ok(blocks.every((b) => typeof b.id === "string" && b.id.length > 0));
});
