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

// ── Fix round 1: content-loss findings, each pinned by a focused test ───────

test("srcset parses per spec: commas inside CDN URLs don't break candidate splitting", () => {
  const substack = (w: number) =>
    `https://substackcdn.com/image/fetch/w_${w},c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fexample.com%2Fabc.png`;
  const blocks = htmlToDrafts(
    `<img src="${substack(424)}" srcset="${substack(424)} 424w, ${substack(848)} 848w, ${substack(1456)} 1456w" alt="s">`,
    base,
  );
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, substack(1456));
});

test("lazy-loaded images: data-lazy-src is a fallback candidate", () => {
  const blocks = htmlToDrafts(
    `<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" data-lazy-src="https://blog.test/fig.png" alt="fig"><noscript><img src="https://blog.test/fig.png" alt="fig"></noscript>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/fig.png");
});

test("figure with only a noscript image fallback keeps the real image, not the data: placeholder", () => {
  const blocks = htmlToDrafts(
    `<figure><img src="data:image/gif;base64,R0lGOD" alt=""><noscript><img src="https://cdn.test/real.png" alt="real"></noscript><figcaption>Cap</figcaption></figure>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://cdn.test/real.png");
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).caption, "Cap");
});

test("empty srcset attribute falls through to data-srcset (|| not ??)", () => {
  const blocks = htmlToDrafts(`<img src="data:image/gif;base64,R0" srcset="" data-srcset="/big.jpg 1200w" alt="x">`, base);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/big.jpg");
});

test("layer 1 does not strip code comment spans styled like noise (token comment, hljs-comment)", () => {
  const prism = htmlToDrafts(
    `<pre class="language-py"><code class="language-py"><span class="token comment"># load the model</span>\nmodel = load()</code></pre>`,
    base,
  );
  assert.ok((prism[0] as Extract<BlockDraft, { type: "code" }>).code.includes("# load the model"));

  const hljs = htmlToDrafts(
    `<pre><code class="hljs language-js"><span class="hljs-comment">// step 1: init</span>\nconst a = 1;</code></pre>`,
    base,
  );
  assert.ok((hljs[0] as Extract<BlockDraft, { type: "code" }>).code.includes("// step 1: init"));
});

test("layer 1 name-matching false positives: heading/section ids, tag-/category- classes, narrow share/modal/related, narrow data-ad", () => {
  const blocks = htmlToDrafts(
    `<h2 id="related-work">Related Work</h2><p>Prior work on transformers is extensive enough to fill a whole section here easily.</p>
     <section id="multi-modal-models"><h3 id="ad-hoc-evaluation">Ad hoc evaluation</h3><p>We evaluate ad hoc baselines against our shared-weights model in this section of the paper.</p></section>
     <article class="post tag-social-media"><p>OpenAI released a new model today. It is faster than before and widely used.</p></article>
     <div class="shared-component"><p>Important claim living in a shared component that must not be dropped from the article.</p></div>
     <div class="social-proof"><p>Used by three major research labs according to this social proof note in the article.</p></div>
     <div data-adaptive-image="1"><p>Adaptive image note that must survive because data-adaptive is not an ad attribute.</p></div>
     <div class="social-share"><a href="https://twitter.com/intent/tweet">Tweet</a></div>`,
    base,
  );
  assert.deepEqual(types(blocks), ["heading", "paragraph", "heading", "paragraph", "paragraph", "paragraph", "paragraph", "paragraph"]);
});

test("ICON_PATH keeps real figure filenames and still drops genuine icons/badges", () => {
  const kept = htmlToDrafts(
    `<img src="/img/object-tracking-results.png" alt="a"><img src="/img/silicon-photonics.jpg" alt="b">
     <img src="/img/1x1-convolution.png" alt="c"><img src="/img/pixelcnn-arch.png" alt="d">
     <img src="/img/avatar-generation-demo.png" alt="e"><img src="/uploads/lexicon-size.png" alt="f">`,
    base,
  );
  assert.equal(kept.length, 6);

  const dropped = htmlToDrafts(
    `<img src="/static/logo.svg" alt=""><img src="https://img.shields.io/badge/build-passing-green" alt=""><img src="/favicon-icon.png" alt="">`,
    base,
  );
  assert.equal(dropped.length, 0);
});

test("iframe inside a paragraph or list item becomes a video block instead of vanishing", () => {
  const inP = htmlToDrafts(`<p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></p>`, base);
  assert.deepEqual(types(inP), ["video"]);
  assert.equal((inP[0] as Extract<BlockDraft, { type: "video" }>).videoId, "dQw4w9WgXcQ");

  const inLi = htmlToDrafts(`<ul><li>Watch: <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></li></ul>`, base);
  assert.deepEqual(types(inLi), ["list", "video"]);
});

test("layer 2 dedupe compares block identity, not just text: distinct images sharing alt text all survive", () => {
  const blocks = htmlToDrafts(`<img src="/fig1.png" alt="Figure"><img src="/fig2.png" alt="Figure"><img src="/fig3.png" alt="Figure">`, base);
  assert.deepEqual(
    blocks.map((b) => (b as Extract<BlockDraft, { type: "image" }>).originalUrl),
    ["https://blog.test/fig1.png", "https://blog.test/fig2.png", "https://blog.test/fig3.png"],
  );
});

test("protocol-relative youtube embeds are kept; playlist embeds are not videos", () => {
  const relative = htmlToDrafts(`<iframe src="//www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`, base);
  assert.deepEqual(types(relative), ["video"]);
  assert.equal((relative[0] as Extract<BlockDraft, { type: "video" }>).videoId, "dQw4w9WgXcQ");

  const playlist = htmlToDrafts(`<iframe src="https://www.youtube.com/embed/videoseries?list=PL123"></iframe>`, base);
  assert.deepEqual(types(playlist), []);
});

test("pre and table inside a list item become their own blocks, keeping formatting", () => {
  const blocks = htmlToDrafts(`<ol><li><p>Install:</p><pre><code>npm i\nnpm run build</code></pre></li></ol>`, base);
  assert.deepEqual(types(blocks), ["list", "code"]);
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "code" }>).code, "npm i\nnpm run build");
});

test("an INLINE-tagged wrapper holding block content is visited as a block, not flattened into one paragraph", () => {
  const blocks = htmlToDrafts(`<span class="content"><h2>T</h2><p>P</p></span>`, base);
  assert.deepEqual(types(blocks), ["heading", "paragraph"]);
});

test("figure with multiple images emits one image block per image, no caption when there are several", () => {
  const blocks = htmlToDrafts(
    `<figure class="wp-block-gallery"><figure><img src="/g1.jpg" alt="1"></figure><figure><img src="/g2.jpg" alt="2"></figure><figure><img src="/g3.jpg" alt="3"></figure></figure>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "image", "image"]);
  assert.ok(blocks.every((b) => !(b as Extract<BlockDraft, { type: "image" }>).caption));
});

test("a table of README images becomes image blocks", () => {
  const blocks = htmlToDrafts(`<table><tr><td><img src="demo1.gif" alt="d1"></td><td><img src="demo2.gif" alt="d2"></td></tr></table>`, base);
  assert.deepEqual(types(blocks), ["image", "image"]);
});

test("a LaTeXML ltx_equation table becomes a paragraph with the math as a code span", () => {
  const blocks = htmlToDrafts(
    `<table class="ltx_equation ltx_eqn_table" id="S2.E1"><tbody><tr class="ltx_equation ltx_eqn_row"><td class="ltx_eqn_cell"><math alttext="L=\\sum_i x_i" display="block"><semantics><mrow><mi>L</mi></mrow></semantics></math></td><td class="ltx_eqn_cell"><span class="ltx_tag">(1)</span></td></tr></tbody></table>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph"]);
  assert.deepEqual((blocks[0] as Extract<BlockDraft, { type: "paragraph" }>).content, [{ text: "L=\\sum_i x_i", code: true }]);
});

test("BOILERPLATE only matches call-to-action phrasing, not real sentences that share a keyword", () => {
  const blocks = htmlToDrafts(
    `<p>The model was sponsored by DARPA and NSF.</p><p>We subscribe to the view that scale is not enough.</p>
     <h3>Sponsored research</h3><p>Sign up for the API waitlist below.</p>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "paragraph", "heading", "paragraph"]);
});

test("same-site link-only paragraph check is www-insensitive", () => {
  const blocks = htmlToDrafts(`<p><a href="https://example.com/next">Next post</a></p>`, { baseUrl: "https://www.example.com/p/1" });
  assert.deepEqual(blocks, []);
});

test("pre strips exactly one leading newline and converts br to newline", () => {
  const leading = htmlToDrafts("<pre>\nline1\nline2\n</pre>", base);
  assert.equal((leading[0] as Extract<BlockDraft, { type: "code" }>).code, "line1\nline2");

  const withBr = htmlToDrafts("<pre><code>a = 1<br>b = 2</code></pre>", base);
  assert.equal((withBr[0] as Extract<BlockDraft, { type: "code" }>).code, "a = 1\nb = 2");
});
