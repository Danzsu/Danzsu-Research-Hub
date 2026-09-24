import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToBlocks, htmlToDrafts } from "./html-to-blocks.ts";
import { parseSrcset } from "./html-images.ts";
import { inlineText, type BlockDraft } from "../blocks.ts";

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

test("figure with multiple images: nested figures keep their own caption, a shared gallery caption becomes a trailing paragraph", () => {
  const blocks = htmlToDrafts(
    `<figure class="wp-block-gallery"><figure class="wp-block-image"><img src="/g1.jpg" alt="1"><figcaption>First</figcaption></figure><figure class="wp-block-image"><img src="/g2.jpg" alt="2"><figcaption>Second</figcaption></figure><figcaption class="blocks-gallery-caption">Gallery caption</figcaption></figure>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "image", "paragraph"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).caption, "First");
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "image" }>).caption, "Second");
  assert.deepEqual((blocks[2] as Extract<BlockDraft, { type: "paragraph" }>).content, [{ text: "Gallery caption" }]);
});

test("a multi-panel figure with no nested <figure> keeps its caption as a trailing paragraph", () => {
  const blocks = htmlToDrafts(
    `<figure class="ltx_figure" id="S4.F3"><div class="ltx_flex_figure"><div class="ltx_flex_cell"><img src="/x1.png" alt="Refer to caption" width="300" height="200"></div><div class="ltx_flex_cell"><img src="/x2.png" alt="Refer to caption" width="300" height="200"></div></div><figcaption class="ltx_caption">Figure 3: Accuracy vs. model size on MMLU (left) and GSM8K (right).</figcaption></figure>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "image", "paragraph"]);
  assert.deepEqual((blocks[2] as Extract<BlockDraft, { type: "paragraph" }>).content, [
    { text: "Figure 3: Accuracy vs. model size on MMLU (left) and GSM8K (right)." },
  ]);
});

test("a figure holding both an image and a table emits both", () => {
  const blocks = htmlToDrafts(`<figure><img src="/chart.png" alt="c"><table><tr><td>a</td><td>b</td></tr></table></figure>`, base);
  assert.deepEqual(types(blocks), ["image", "list"]);
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

// ── Fix round 2: 5 open findings + 3 regressions from round 1 ───────────────

test("srcset per spec: a comma directly after a descriptor with no following space still splits candidates correctly", () => {
  const x = htmlToDrafts(`<img srcset="/a.jpg 1x,/b.jpg 2x" src="/a.jpg" alt="s">`, base);
  assert.equal((x[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/b.jpg");

  const w = htmlToDrafts(`<img srcset="/a-400.jpg 400w,/a-800.jpg 800w" src="/a-400.jpg" alt="s">`, base);
  assert.equal((w[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/a-800.jpg");
});

test("srcset: a javascript: candidate is skipped, falling through to the next candidate", () => {
  const blocks = htmlToDrafts(`<img srcset="javascript:alert(1) 2000w, /ok.jpg 100w" alt="x">`, base);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/ok.jpg");
});

test("data-lazy-src is used directly, with no noscript fallback present", () => {
  const blocks = htmlToDrafts(`<img src="data:image/gif;base64,R0" data-lazy-src="https://blog.test/direct.png" alt="x">`, base);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/direct.png");
});

test("data-lazy-srcset is used directly, with no noscript fallback present", () => {
  const blocks = htmlToDrafts(`<img src="data:image/gif;base64,R0" data-lazy-srcset="/s.jpg 300w, /l.jpg 900w" alt="x">`, base);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/l.jpg");
});

test("hoistNoscriptImages only replaces a missing/data: placeholder, never a real preceding image", () => {
  const blocks = htmlToDrafts(`<img src="/hero.png"><noscript><img width="1" height="1" src="https://px.test/fb"></noscript>`, base);
  assert.deepEqual(types(blocks), ["image"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/hero.png");
});

test("named-noise id matching is skipped for a div.section wrapping a heading (pandoc/R Markdown/bookdown)", () => {
  const evaluation = htmlToDrafts(
    `<div id="ad-hoc-evaluation" class="section level2"><h2>Ad hoc evaluation</h2><p>We run ad hoc evals here with real content that is long enough.</p></div>`,
    base,
  );
  assert.deepEqual(types(evaluation), ["heading", "paragraph"]);

  const promotion = htmlToDrafts(
    `<div id="promotion-of-cooperation" class="section level2"><h2>Promotion of cooperation</h2><p>Real content about the topic at hand.</p></div>`,
    base,
  );
  assert.deepEqual(types(promotion), ["heading", "paragraph"]);
});

test("an exact-id denylist removes well-known comment containers even though they contain a heading", () => {
  const commentsFiller = `<p>${"Filler text to keep the comments section under half the page total. ".repeat(20)}</p>`;
  const comments = htmlToDrafts(`${commentsFiller}<section id="comments"><h2>3 comments</h2><p>Nice post! thanks a lot</p></section>`, base);
  assert.equal(comments.some((b) => b.type === "heading" && (b as Extract<BlockDraft, { type: "heading" }>).text === "3 comments"), false);

  const discussionFiller = `<p>${"More filler content so the discussion div stays a small fraction of the page. ".repeat(20)}</p>`;
  const discussion = htmlToDrafts(`${discussionFiller}<div id="disqus_thread"><h3>Discussion</h3></div>`, base);
  assert.equal(discussion.some((b) => b.type === "heading" && (b as Extract<BlockDraft, { type: "heading" }>).text === "Discussion"), false);
});

test("tag- and category- class tokens are ignored by name matching, even alone on a non-content element (pinned)", () => {
  const filler = `<p>${"Padding text to dominate the page total so the small div below is not size-protected. ".repeat(30)}</p>`;
  const blocks = htmlToDrafts(`${filler}<div class="post tag-newsletter"><p>Short real note kept only via the tag- filter.</p></div>`, base);
  const texts = blocks.filter((b) => b.type === "paragraph").map((b) => (b as Extract<BlockDraft, { type: "paragraph" }>).content[0].text);
  assert.ok(texts.some((t) => t.startsWith("Short real note")));
});

test("content-container exemptions: article and article-body classes survive noise-name/ad-attribute matches", () => {
  const short = htmlToDrafts(`<article class="post has-comments"><h1>Short</h1><p>${"lorem ".repeat(60).trim()}</p></article>`, base);
  assert.deepEqual(types(short), ["heading", "paragraph"]);

  const body = htmlToDrafts(`<div class="article-body" data-ad-targeting="ml"><p>${"lorem ".repeat(80).trim()}</p></div>`, base);
  assert.deepEqual(types(body), ["paragraph"]);
});

test("content-container identity/role/itemprop/ancestor checks hold even when the container is a minority of the page (not size-protected)", () => {
  const words = (n: number, w = "lorem") => Array.from({ length: n }, (_, i) => w + i).join(" ");
  const filler = `<p>${words(400)}</p>`;
  const hasText = (blocks: BlockDraft[], needle: string) =>
    blocks.some((b) => b.type === "paragraph" && (b as Extract<BlockDraft, { type: "paragraph" }>).content[0].text.includes(needle));

  const article = htmlToDrafts(
    `${filler}<article class="post has-comments"><p>Short real article paragraph kept via the article tag.</p></article>`,
    base,
  );
  assert.equal(hasText(article, "kept via the article tag"), true);

  const main = htmlToDrafts(`${filler}<div role="main" class="ad-slot"><p>Short real content kept via role=main.</p></div>`, base);
  assert.equal(hasText(main, "kept via role=main"), true);

  const articleBody = htmlToDrafts(`${filler}<div itemprop="articleBody" class="ad-slot"><p>Short real content kept via itemprop.</p></div>`, base);
  assert.equal(hasText(articleBody, "kept via itemprop"), true);

  const wrapper = htmlToDrafts(
    `${filler}<div class="ad-wrapper"><article><p>Short real content protected as an ancestor of an article.</p></article></div>`,
    base,
  );
  assert.equal(hasText(wrapper, "protected as an ancestor"), true);
});

test("content-container exemptions replace the size-ratio guard: entry-content survives next to a large comment thread", () => {
  const words = (n: number, w = "lorem") => Array.from({ length: n }, (_, i) => w + i).join(" ");
  const comment = (i: number) => `<li class="comment"><div class="comment-body"><p>${words(20, "c" + i)}</p></div></li>`;
  const blocks = htmlToDrafts(
    `<div class="entry-content" data-ad-slot="x"><p>${words(400)}</p></div><div class="discussion"><ol>${Array.from({ length: 120 }, (_, i) => comment(i)).join("")}</ol></div>`,
    base,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
});

test("share/related/comment widget names are matched again as delimited tokens, not just whole tokens", () => {
  const blocks = htmlToDrafts(
    `<div class="post-share"><p>Post share box text here</p></div>
     <div class="social-sharing"><p>Social sharing box</p></div>
     <div class="yarpp-related"><h3>You may like</h3><p>Related widget text</p></div>
     <div class="jp-relatedposts"><p>Related stuff text</p></div>
     <div class="shared-component"><p>Important claim living in a shared component that must not be dropped.</p></div>
     <div class="social-proof"><p>Used by three major research labs according to this note.</p></div>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "paragraph"]);
});

test("Hungarian CTA sentences starting with the trigger phrase are dropped", () => {
  const blocks = htmlToDrafts(`<p>Iratkozz fel a hírlevelünkre!</p><p>Oszd meg ismerőseiddel!</p>`, base);
  assert.deepEqual(blocks, []);
});

test("ICON_PATH matches only the last path segment; badges/avatars are dropped by host or path, not directory names", () => {
  const kept = htmlToDrafts(
    `<img src="/assets/icons-and-diagrams/figure3.png" alt="a"><img src="/logos-study/chart.png" alt="b">
     <img src="https://raw.githubusercontent.com/u/logo-detection/main/assets/results.png" alt="c">
     <img src="/avatar-research/results.png" alt="d"><img src="avatar-generation-demo.png" alt="e">`,
    base,
  );
  assert.equal(kept.length, 5);

  const dropped = htmlToDrafts(
    `<img src="https://secure.gravatar.com/avatar/0bc83cb571cd1c50ba6f3e8a78ef1346?s=96" alt="">
     <img src="https://img.shields.io/badge/build-passing-green" alt=""><img src="/static/logo.svg" alt="">`,
    base,
  );
  assert.equal(dropped.length, 0);
});

test("consecutive duplicate code blocks are compared by exact code text, not normalised identity", () => {
  const blocks = htmlToDrafts(`<pre><code>if x:\n    y()</code></pre><pre><code>if x:\ny()</code></pre>`, base);
  assert.deepEqual(types(blocks), ["code", "code"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "code" }>).code, "if x:\n    y()");
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "code" }>).code, "if x:\ny()");
});

test("an inline wrapper holding blocks inside a <p> splits into a paragraph plus the block content", () => {
  const blocks = htmlToDrafts(`<p><span>Intro<div><ul><li>a</li><li>b</li></ul></div></span></p>`, base);
  assert.deepEqual(types(blocks), ["paragraph", "list"]);
  assert.deepEqual((blocks[0] as Extract<BlockDraft, { type: "paragraph" }>).content, [{ text: "Intro" }]);
  assert.deepEqual((blocks[1] as Extract<BlockDraft, { type: "list" }>).items, [[{ text: "a" }], [{ text: "b" }]]);
});

test("an inline wrapper holding blocks inside a <li> does not flatten into one merged string", () => {
  const blocks = htmlToDrafts(`<ul><li><span><p>one</p><ul><li>n1</li></ul></span></li></ul>`, base);
  const texts = blocks.flatMap((b) =>
    b.type === "list" ? (b as Extract<BlockDraft, { type: "list" }>).items.map((item) => item.map((s) => s.text).join("")) : [],
  );
  assert.equal(texts.includes("one n1"), false);
});

// ── Fix round 3: 4 open findings + 3 regressions + a perf drop ──────────────

const words = (n: number, w = "lorem") => Array.from({ length: n }, (_, i) => w + i).join(" ");

test("srcset: a bare URL followed by a comma has no descriptor, and the comma itself is stripped", () => {
  const single = htmlToDrafts(`<img srcset="/only.png," src="/fallback.png" alt="s">`, base);
  assert.equal((single[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/only.png");

  const multi = htmlToDrafts(`<img srcset="/a.png, /photo@2x.png 2x" alt="s">`, base);
  assert.equal((multi[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/photo@2x.png");
});

test("srcset whose only candidate is unsafe falls through to src", () => {
  const blocks = htmlToDrafts(`<img srcset="javascript:alert(1) 2x" src="/ok.jpg" alt="x">`, base);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/ok.jpg");
});

test("srcset: a comma inside parentheses in a descriptor does not split the candidate", () => {
  assert.deepEqual(parseSrcset("/a.jpg foo(1,2)x, /b.jpg 900w"), ["/b.jpg", "/a.jpg"]);
});

test("srcset: descriptor scanning only stops at a comma (honoring parens), not at whitespace too", () => {
  assert.deepEqual(parseSrcset("/a.jpg 400w extra, /b.jpg 900w"), ["/b.jpg", "/a.jpg"]);
});

test("the heading-descendant id exemption holds on a multi-section page where no section is ≥50% of the text", () => {
  const sec = (id: string, h: string) => `<div id="${id}" class="section level2"><h2>${h}</h2><p>${words(60, id.slice(0, 3))}</p></div>`;
  const blocks = htmlToDrafts(
    sec("introduction", "Introduction") +
      sec("ad-hoc-evaluation", "Ad hoc evaluation") +
      sec("promotion-of-cooperation", "Promotion") +
      sec("results", "Results"),
    base,
  );
  const headings = blocks.filter((b) => b.type === "heading").map((b) => (b as Extract<BlockDraft, { type: "heading" }>).text);
  assert.deepEqual(headings, ["Introduction", "Ad hoc evaluation", "Promotion", "Results"]);
});

test("a <section> with no heading is exempted from id matching (restored)", () => {
  const filler = `<p>${words(300)}</p>`;
  const blocks = htmlToDrafts(
    `${filler}<section id="promo-codes-analysis"><p>We analysed promo codes in this study at length here.</p></section>`,
    base,
  );
  assert.equal(
    blocks.some((b) => b.type === "paragraph" && (b as Extract<BlockDraft, { type: "paragraph" }>).content[0].text.startsWith("We analysed")),
    true,
  );
});

test("the noise-id denylist does not apply to a heading itself or a pandoc-style section", () => {
  const heading = htmlToDrafts(`<h2 id="comments">Comments</h2><p>Some real prose about the word comments in linguistics.</p>`, base);
  assert.deepEqual(heading[0], { type: "heading", level: 2, text: "Comments" });

  const pandoc = htmlToDrafts(`<div id="comments" class="section level2"><h2>Comments</h2><p>Real content in this section.</p></div>`, base);
  assert.deepEqual(types(pandoc), ["heading", "paragraph"]);
});

test("the noise-id denylist removes a comments section even when its content is >=50% of the page, case-insensitively", () => {
  const majority = htmlToDrafts(
    `<div class="entry-content"><p>${words(80)}</p></div><section id="comments"><h2>12 comments</h2><ol>${Array.from(
      { length: 12 },
      (_, i) => `<li><p>${words(25, "c" + i)}</p></li>`,
    ).join("")}</ol></section>`,
    base,
  );
  assert.equal(majority.some((b) => b.type === "heading"), false);

  const filler = `<p>${words(300)}</p>`;
  const withArticleChildren = htmlToDrafts(
    `${filler}<section id="comments"><h2>Comments</h2><article class="js-comment"><p>First commenter says hello there.</p></article></section>`,
    base,
  );
  assert.equal(withArticleChildren.some((b) => b.type === "heading"), false);

  const uppercase = htmlToDrafts(`${filler}<div id="Comments"><h3>Comments</h3><p>Nice.</p></div>`, base);
  assert.equal(uppercase.some((b) => b.type === "heading"), false);
});

test("SHARE_RELATED_COMMENT excludes a related-work class, via a negative lookahead", () => {
  const filler = `<p>${words(300)}</p>`;
  const blocks = htmlToDrafts(`${filler}<section class="related-work"><h2>Related Work</h2><p>${words(20, "r")}</p></section>`, base);
  assert.equal(blocks.some((b) => b.type === "heading" && (b as Extract<BlockDraft, { type: "heading" }>).text === "Related Work"), true);
});

test("a LaTeXML tabular figure route does not duplicate its cell images", () => {
  const blocks = htmlToDrafts(
    `<figure class="ltx_figure"><table class="ltx_tabular"><tr><td><img src="/p1.png" alt="Refer to caption" width="300" height="200"></td><td><img src="/p2.png" alt="Refer to caption" width="300" height="200"></td></tr></table><figcaption class="ltx_caption">Figure 2: Two panels laid out by a tabular.</figcaption></figure>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "image", "paragraph"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/p1.png");
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/p2.png");
  assert.deepEqual((blocks[2] as Extract<BlockDraft, { type: "paragraph" }>).content, [
    { text: "Figure 2: Two panels laid out by a tabular." },
  ]);
});

test("a figure with nested figures still keeps content outside them: a bare sibling image and a sibling table", () => {
  const withImage = htmlToDrafts(
    `<figure><img src="/bare.png" alt="b"><figure><img src="/panel.png" alt="p"><figcaption>a</figcaption></figure></figure>`,
    base,
  );
  assert.deepEqual(types(withImage), ["image", "image"]);
  assert.equal((withImage[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/bare.png");
  assert.equal((withImage[1] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/panel.png");
  assert.equal((withImage[1] as Extract<BlockDraft, { type: "image" }>).caption, "a");

  const withTable = htmlToDrafts(
    `<figure><table><tr><td>a</td><td>b</td></tr></table><figure><img src="/g1.jpg" alt="1"><figcaption>One</figcaption></figure></figure>`,
    base,
  );
  assert.deepEqual(types(withTable), ["list", "image"]);
});

test("non-code block dedupe still uses normalised identity, not exact JSON comparison", () => {
  const blocks = htmlToDrafts(`<p>Hello world</p><p>Hello   World</p>`, base);
  assert.equal(blocks.length, 1);
});

// Compact view of figure output: img(file|caption), p(text), otherwise the block type.
const shape = (blocks: BlockDraft[]) =>
  blocks.map((b) => {
    if (b.type === "image") return `img(${b.originalUrl.split("/").pop()}${b.caption ? "|" + b.caption : ""})`;
    return b.type === "paragraph" ? `p(${inlineText(b.content)})` : b.type;
  });

test("panel figures nested under wrapper elements keep their own captions", () => {
  const panel = (src: string, caption: string) => `<figure class="ltx_figure ltx_figure_panel"><img src="/${src}" alt="x"><figcaption>${caption}</figcaption></figure>`;
  const latexmlFlex = htmlToDrafts(
    `<figure class="ltx_figure"><div class="ltx_flex_figure"><div class="ltx_flex_cell">${panel("p1.png", "(a) left")}</div><div class="ltx_flex_cell">${panel("p2.png", "(b) right")}</div></div><figcaption>Figure 3: both</figcaption></figure>`,
    base,
  );
  assert.deepEqual(shape(latexmlFlex), ["img(p1.png|(a) left)", "img(p2.png|(b) right)", "p(Figure 3: both)"]);

  const wordpressListGallery = htmlToDrafts(
    `<figure class="wp-block-gallery"><ul class="blocks-gallery-grid"><li class="blocks-gallery-item"><figure><img src="/a.jpg" alt="a"><figcaption>Cap A</figcaption></figure></li><li class="blocks-gallery-item"><figure><img src="/b.jpg" alt="b"><figcaption>Cap B</figcaption></figure></li></ul><figcaption class="blocks-gallery-caption">Gallery</figcaption></figure>`,
    base,
  );
  assert.deepEqual(shape(wordpressListGallery), ["img(a.jpg|Cap A)", "img(b.jpg|Cap B)", "p(Gallery)"]);

  // A table that lays panel figures out is layout, not data: no "(a) · (b)" row, no duplicate images.
  const latexmlTabular = htmlToDrafts(
    `<figure class="ltx_figure"><table class="ltx_tabular"><tr><td>${panel("q1.png", "(a)")}</td><td>${panel("q2.png", "(b)")}</td></tr></table><figcaption>Figure 4: tab</figcaption></figure>`,
    base,
  );
  assert.deepEqual(shape(latexmlTabular), ["img(q1.png|(a))", "img(q2.png|(b))", "p(Figure 4: tab)"]);
});

test("a three-level nested figure visits each level once, not the innermost twice", () => {
  const blocks = htmlToDrafts(
    `<figure><figure><figure><img src="/deep.jpg" alt="d"><figcaption>deep</figcaption></figure><figcaption>mid</figcaption></figure></figure>`,
    base,
  );
  assert.deepEqual(shape(blocks), ["img(deep.jpg|deep)", "p(mid)"]);
});

test("a figure's own images and tables and its nested figures come out in document order, each once", () => {
  const imageAfterPanel = htmlToDrafts(`<figure><figure><img src="/a.png" alt="a"><figcaption>A</figcaption></figure><img src="/b.png" alt="b"></figure>`, base);
  assert.deepEqual(shape(imageAfterPanel), ["img(a.png|A)", "img(b.png)"]);

  const wrappedAndTabled = htmlToDrafts(
    `<figure><a href="/big.jpg"><img src="/thumb.jpg" alt="t"></a><figure><img src="/panel.png" alt="p"><figcaption>a</figcaption></figure><table><tr><td>row</td><td><img src="/c1.png" alt="c"></td><td><img src="/c2.png" alt="c"></td></tr></table></figure>`,
    base,
  );
  assert.deepEqual(shape(wrappedAndTabled), ["img(thumb.jpg)", "img(panel.png|a)", "list", "img(c1.png)", "img(c2.png)"]);

  // Two images, so a repeat would not sit next to the original, where layer-2 dedupe would hide it.
  const multiImagePanel = htmlToDrafts(
    `<figure><figure><img src="/m1.png" alt="m"><img src="/m2.png" alt="m"><figcaption>Panels</figcaption></figure><figcaption>Outer</figcaption></figure>`,
    base,
  );
  assert.deepEqual(shape(multiImagePanel), ["img(m1.png)", "img(m2.png)", "p(Panels)", "p(Outer)"]);
});

test("code spans named like noise survive even when the code block is a small part of a long page", () => {
  const blocks = htmlToDrafts(
    // The id="comments" span pins the guard on the denylist path too.
    `<p>${words(300)}</p><pre><code class="language-py"><span class="token comment"># load the model</span>\n<span id="comments">model = load()</span></code></pre>`,
    base,
  );
  assert.equal((blocks.find((b) => b.type === "code") as Extract<BlockDraft, { type: "code" }>).code, "# load the model\nmodel = load()");
});

test("the pandoc exception to the noise-id denylist needs both the section and a levelN class", () => {
  const withClass = (cls: string) =>
    htmlToDrafts(`<p>${words(40)}</p><div id="comments" class="${cls}"><h2>Comments</h2><p>Nice post!</p></div>`, base);
  assert.deepEqual(types(withClass("section")), ["paragraph"]);
  assert.deepEqual(types(withClass("level2")), ["paragraph"]);
});
