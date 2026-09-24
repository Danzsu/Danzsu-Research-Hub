import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import type { Block, BlockDraft } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import { mockDns, mockFetch, TEST_IP } from "../mock-fetch.ts";
import { articleFromHtml, extractArticle, publishedDate, readPageMeta, trimByline } from "./article.ts";
import { extractArxiv, isArxivHtml, parseArxivAtom } from "./arxiv.ts";
import { extractGithub, resolveGithubImage } from "./github.ts";
import { fromLlmBlock, PDF_INSTRUCTIONS } from "./pdf.ts";

const db = {} as unknown as SupabaseClient;
const image = (blocks: Block[]) => blocks.find((b): b is Extract<Block, { type: "image" }> => b.type === "image");

const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
// Each paragraph is numbered, not identical, so the html-to-blocks noise filter's adjacent-duplicate
// dedupe doesn't collapse all 12 into one and starve the fixture below articleFromHtml's 200-char floor.
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

test("articleFromHtml rejects pages with no readable content", () => {
  assert.throws(() => articleFromHtml(page("", "<div>tiny</div>"), "https://blog.test/p"), /no readable article text/);
});

test("publishedDate keeps a stated calendar date instead of reinterpreting its timezone", () => {
  // A UTC-negative offset converts to a later UTC date; the source's own YYYY-MM-DD must win.
  assert.equal(publishedDate("2026-09-20T23:30:00-05:00"), "2026-09-20");
  assert.equal(publishedDate("2026-09-20T10:00:00Z"), "2026-09-20");
  assert.equal(publishedDate("2026-09-20"), "2026-09-20");
  assert.equal(publishedDate("March 3, 2026 UTC"), "2026-03-03"); // a non-ISO format still needs Date parsing
  assert.equal(publishedDate("not a date"), null);
  assert.equal(publishedDate(undefined), null);
});

test("publishedDate rejects a YYYY-MM-DD prefix that isn't a real calendar date", () => {
  // posts.published_at is a Postgres date column; any of these would fail that write and lose the post.
  assert.equal(publishedDate("0000-00-00T00:00:00Z"), null);
  assert.equal(publishedDate("2026-13-01"), null); // month 13
  assert.equal(publishedDate("2026-02-30"), null); // Date would silently roll this over to March 2
});

test("trimByline cuts a long author list at a name boundary, not mid-name", () => {
  const names = ["Alex Kim", "Bao Nguyen", "Chen Wei", "Dara Osei", "Elin Park", "Farah Khan", "Grace Lynn Tan", "Cody Reyes", "Priya Sharma", "Omar Abdulrahman Haddad-Lindqvist"];
  const byline = names.join(", "); // 141 chars: a plain slice(0, 120) lands mid "Abdulrahman", not at a comma
  assert.equal(
    trimByline(byline),
    "Alex Kim, Bao Nguyen, Chen Wei, Dara Osei, Elin Park, Farah Khan, Grace Lynn Tan, Cody Reyes, Priya Sharma",
  );
  assert.equal(trimByline(null), null);
  assert.equal(trimByline("Short Name"), "Short Name");
});

test("articleFromHtml reads robots directives from every robots/googlebot meta, case-insensitively", () => {
  const twoMetas = articleFromHtml(
    page(`<meta name="robots" content="max-image-preview:large"><meta name="robots" content="noarchive">`, article),
    "https://blog.test/p",
  );
  assert.equal(twoMetas.meta.noarchive, true);
  const googlebot = articleFromHtml(page(`<meta name="googlebot" content="noarchive">`, article), "https://blog.test/p");
  assert.equal(googlebot.meta.noarchive, true);
  const shoutyCase = articleFromHtml(page(`<meta name="ROBOTS" content="NOARCHIVE">`, article), "https://blog.test/p");
  assert.equal(shoutyCase.meta.noarchive, true);
  const header = articleFromHtml(page("", article), "https://blog.test/p", "noarchive");
  assert.equal(header.meta.noarchive, true);
  assert.equal(articleFromHtml(page("", article), "https://blog.test/p").meta.noarchive, undefined);
});

// Trimmed from a live fetch of oneusefulthing.org/p/the-overhang: the NewsArticle JSON-LD block
// Substack renders into the body (not the head), which cleanDocument would otherwise strip as a
// <script> before Readability ever sees it. No article:published_time or og:site_name meta exists
// on that page — datePublished and publisher.name are the only source for either field.
const substackJsonLd = `<script type="application/ld+json">${JSON.stringify({
  "@type": "NewsArticle",
  headline: "The Overhang",
  datePublished: "2026-09-18T17:54:32+00:00",
  publisher: { "@type": "Organization", name: "One Useful Thing" },
})}</script>`;

test("readPageMeta and articleFromHtml take date and site name from body JSON-LD when no meta tag has them", () => {
  const doc = parseHTML(page("", substackJsonLd + article)).document as unknown as Document;
  const meta = readPageMeta(doc);
  assert.equal(meta.published, undefined); // no article:published_time meta on this page
  assert.equal(meta.jsonLdPublished, "2026-09-18T17:54:32+00:00");
  assert.equal(meta.siteName, "One Useful Thing");
  const result = articleFromHtml(page("", substackJsonLd + article), "https://www.oneusefulthing.org/p/the-overhang");
  assert.equal(result.publishedAt, "2026-09-18");
  assert.equal(result.siteName, "One Useful Thing");
});

test("readJsonLd finds the date inside a top-level array of nodes, skipping ones with no useful fields", () => {
  // A charset-suffixed, mixed-case type — "Application/Ld+Json; charset=utf-8" — must still match.
  const html = page(
    "",
    `<script type="Application/Ld+Json; charset=utf-8">${JSON.stringify([
      { "@type": "BreadcrumbList", itemListElement: [] },
      { "@type": "NewsArticle", datePublished: "2026-09-18T17:54:32+00:00", publisher: { name: "One Useful Thing" } },
    ])}</script>${article}`,
  );
  const result = articleFromHtml(html, "https://www.oneusefulthing.org/p/the-overhang");
  assert.equal(result.publishedAt, "2026-09-18");
  assert.equal(result.siteName, "One Useful Thing");
});

test("readJsonLd finds the date inside an @graph array", () => {
  const html = page(
    "",
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Some Site" },
        { "@type": "NewsArticle", datePublished: "2026-09-18T17:54:32+00:00", publisher: { name: "One Useful Thing" } },
      ],
    })}</script>${article}`,
  );
  const result = articleFromHtml(html, "https://www.oneusefulthing.org/p/the-overhang");
  assert.equal(result.publishedAt, "2026-09-18");
  assert.equal(result.siteName, "One Useful Thing");
});

test("readJsonLd never throws on an array, a non-object, or malformed JSON", () => {
  for (const body of ["[]", "null", "42", "not json at all", "{}"]) {
    assert.doesNotThrow(() => readPageMeta(parseHTML(page("", `<script type="application/ld+json">${body}</script>${article}`)).document as unknown as Document));
  }
});

test("a garbage JSON-LD date does not shadow a valid date Readability found elsewhere", () => {
  // No article:published_time meta. The JSON-LD has no @context, so Readability's own JSON-LD
  // reader (which requires one) ignores it and falls through to a meta name it recognises that our
  // own readPageMeta doesn't check at all — "parsely-pub-date" — landing on a genuinely valid date.
  // Our readJsonLd (which doesn't require @context) still reads the garbage "yesterday" into
  // jsonLdPublished; the old `page.published ?? parsed?.publishedTime` chain (page.published
  // already merged with the JSON-LD date) would have let that garbage win outright.
  const head = `<meta name="parsely-pub-date" content="2026-09-20T10:00:00Z">
    <script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", datePublished: "yesterday" })}</script>`;
  const result = articleFromHtml(page(head, article), "https://blog.test/p");
  assert.equal(result.publishedAt, "2026-09-20");
});

test("articleFromHtml falls back to Readability's own site name when no og/JSON-LD site name is found", () => {
  // Our own selector is an exact-case CSS attribute match; Readability's is a case-insensitive
  // regex over every meta element, so a shouty-case property is a genuine (not contrived) divergence.
  const result = articleFromHtml(page(`<meta property="OG:SITE_NAME" content="Shouty Site">`, article), "https://blog.test/p");
  assert.equal(result.siteName, "Shouty Site");
});

test("fromLlmBlock maps the flat model schema and drops malformed blocks", () => {
  assert.deepEqual(fromLlmBlock({ type: "heading", text: "Intro", level: 5 }), { type: "heading", level: 4, text: "Intro" });
  assert.deepEqual(fromLlmBlock({ type: "paragraph", text: "Body" }), { type: "paragraph", content: [{ text: "Body" }] });
  assert.deepEqual(fromLlmBlock({ type: "list", ordered: true, items: ["a", "b"] }), { type: "list", ordered: true, items: [[{ text: "a" }], [{ text: "b" }]] });
  assert.deepEqual(fromLlmBlock({ type: "code", code: "x = 1", language: "py" }), { type: "code", code: "x = 1", language: "py" });
  assert.equal(fromLlmBlock({ type: "list", items: [] }), null);
  assert.equal(fromLlmBlock({ type: "paragraph", text: "  " }), null);
});

test("the PDF transcription budget is cut to fit one Gemini call inside post()'s abort", () => {
  assert.match(PDF_INSTRUCTIONS, /12,000 words/);
  assert.doesNotMatch(PDF_INSTRUCTIONS, /40,000/);
});

test("arXiv helpers: HTML detection and Atom parsing", () => {
  assert.equal(isArxivHtml('<div class="ltx_page_main">'), true);
  assert.equal(isArxivHtml("<p>No HTML for this paper</p>"), false);
  const meta = parseArxivAtom(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Attention Is All
      You Need</title><summary>We propose the Transformer.</summary><published>2017-06-12T17:57:34Z</published>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>`);
  assert.deepEqual(meta, { title: "Attention Is All You Need", summary: "We propose the Transformer.", published: "2017-06-12", authors: ["Ashish Vaswani", "Noam Shazeer"] });
});

// Live export.arxiv.org/api/query?id_list=math/0211159 response, trimmed: real https links, a
// feed-level <title>, the arxiv: namespace, and — the case this pins — a SINGLE <author>, which
// fast-xml-parser hands back as one object rather than an array. Wrapping it wrong (e.g. spreading
// its .name string) would parse it into individual characters instead of one author.
const singleAuthorFeed = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv Query: search_query=&amp;id_list=math/0211159&amp;start=0&amp;max_results=10</title>
  <entry>
    <id>http://arxiv.org/abs/math/0211159v1</id>
    <title>The entropy formula for the Ricci flow and its geometric applications</title>
    <link href="https://arxiv.org/abs/math/0211159v1" rel="alternate" type="text/html"/>
    <summary>  We present a monotonic expression for the Ricci flow, valid in all dimensions and without curvature assumptions.</summary>
    <published>2002-11-11T16:11:49Z</published>
    <arxiv:comment>39 pages</arxiv:comment>
    <arxiv:primary_category term="math.DG"/>
    <author>
      <name>Grisha Perelman</name>
    </author>
  </entry>
</feed>`;

// Live export.arxiv.org/api/query?id_list=2401.99999 (and id_list=1234.5678) response, verbatim: a
// well-formed but unrecognised id gets a 200 with an empty result set, not a 404 and not an entry.
const emptyFeed = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/api/rnxrW8yd5bhCFzWS8hh40TByGfM</id>
  <title>arXiv Query: search_query=&amp;id_list=2401.99999&amp;start=0&amp;max_results=10</title>
  <updated>2026-09-24T13:57:13Z</updated>
  <opensearch:itemsPerPage>10</opensearch:itemsPerPage>
  <opensearch:totalResults>0</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
</feed>`;

// Live export.arxiv.org/api/query?id_list=foo response body, verbatim: an error-shaped entry — id
// containing "/api/errors#", title "Error", author "arXiv api core". Live probing found arXiv
// actually serves this over HTTP 400, not 200 (extractArxiv's own metadata() already throws on that
// before parseArxivAtom ever runs), so this pins parseArxivAtom's defense in depth on the body shape
// alone, independent of whatever status code a caller wraps it in.
const errorEntryFeed = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/</id>
  <title>arXiv Search Results</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>https://arxiv.org/api/errors#incorrect_id_format_for_foo</id>
    <title>Error</title>
    <link href="https://arxiv.org/api/errors#incorrect_id_format_for_foo" rel="alternate" type="text/html"/>
    <summary>incorrect id format for foo</summary>
    <author>
      <name>arXiv api core</name>
    </author>
  </entry>
</feed>`;

test("parseArxivAtom parses a real single-author entry to one author, not characters", () => {
  assert.deepEqual(parseArxivAtom(singleAuthorFeed), {
    title: "The entropy formula for the Ricci flow and its geometric applications",
    summary: "We present a monotonic expression for the Ricci flow, valid in all dimensions and without curvature assumptions.",
    published: "2002-11-11",
    authors: ["Grisha Perelman"],
  });
});

test("parseArxivAtom throws a plain Error for an empty result set or an error-shaped entry", () => {
  assert.throws(() => parseArxivAtom(emptyFeed), (error: unknown) => error instanceof Error && !(error instanceof FetchError));
  assert.throws(() => parseArxivAtom(errorEntryFeed), (error: unknown) => error instanceof Error && /error/i.test(error.message));
});

test("a numeric-looking title or summary stays a string instead of being parsed as a number", () => {
  const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://arxiv.org/abs/0.10</id><title>0.10</title><summary>0.10</summary></entry></feed>`;
  const meta = parseArxivAtom(feed);
  assert.equal(meta.title, "0.10");
  assert.equal(meta.summary, "0.10");
});

test("extractArxiv throws a plain Error, not a FetchError, for an id the API doesn't recognise", async () => {
  const restore = mockFetch(async () => new Response(emptyFeed, { status: 200 }));
  try {
    await assert.rejects(
      () => extractArxiv(db, "https://arxiv.org/abs/2401.99999", ""),
      (error: unknown) => error instanceof Error && !(error instanceof FetchError),
    );
  } finally {
    restore();
  }
});

// Trimmed from a live fetch of arxiv.org/html/2401.00001 (200, no redirect, no <base> tag): the
// figure src is a plain relative path, "2401.00001v1/return_difference.png".
const arxivHtmlFixture = `<!doctype html><html><head><title>Sector Rotation by Factor Model and Fundamental Analysis</title></head>
<body><div class="ltx_page_main"><article>
<h1 class="ltx_title">Sector Rotation by Factor Model and Fundamental Analysis</h1>
${Array.from({ length: 12 }, (_, i) => `<p class="ltx_p">Paragraph ${i} on factor models, fundamental analysis and sector rotation strategies. </p>`).join("")}
<figure class="ltx_figure"><img src="2401.00001v1/return_difference.png" alt="Return difference" width="640" height="480"><figcaption class="ltx_caption">Figure 1: Return difference.</figcaption></figure>
</article></div></body></html>`;

test("extractArxiv resolves an HTML paper's figure against the real (unslashed) page URL", async (t) => {
  mockDns(t);
  const restoreFetch = mockFetch(async (url) => {
    if (url.includes("export.arxiv.org")) return new Response(singleAuthorFeed, { status: 200 });
    if (url.includes("/html/")) return new Response(arxivHtmlFixture, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("", { status: 404 });
  });
  try {
    const result = await extractArxiv(db, "https://arxiv.org/abs/2401.00001", "");
    // Forcing a trailing slash on the base (the old bug) would instead give
    // ".../html/2401.00001/2401.00001v1/return_difference.png", which 404s.
    assert.equal(image(result.blocks)?.originalUrl, "https://arxiv.org/html/2401.00001v1/return_difference.png");
  } finally {
    restoreFetch();
  }
});

test("extractArxiv falls back to the abstract when neither an HTML nor a PDF version can be read", async (t) => {
  mockDns(t);
  const restoreFetch = mockFetch(async (url) => {
    if (url.includes("export.arxiv.org")) return new Response(singleAuthorFeed, { status: 200 });
    return new Response("", { status: 404 }); // no HTML version, no PDF either
  });
  try {
    const result = await extractArxiv(db, "https://arxiv.org/abs/math/0211159", "");
    assert.deepEqual(
      result.blocks.map((b) => b.type),
      ["heading", "paragraph"],
    );
    assert.ok(result.text.includes("monotonic expression for the Ricci flow"));
  } finally {
    restoreFetch();
  }
});

// Trimmed from a live fetch of api.github.com/repos/facebookresearch/detectron2 (Accept:
// application/vnd.github+json).
const repoInfoFixture = {
  full_name: "facebookresearch/detectron2",
  html_url: "https://github.com/facebookresearch/detectron2",
  description: "Detectron2 is a platform for object detection, segmentation and other visual recognition tasks.",
  stargazers_count: 34729,
  language: "Python",
  topics: [],
  license: { spdx_id: "Apache-2.0" },
  default_branch: "main",
  pushed_at: "2026-08-19T05:38:53Z",
  owner: { login: "facebookresearch" },
};

// Trimmed from a live fetch of api.github.com/repos/facebookresearch/detectron2/readme (Accept:
// application/vnd.github.html+json). The plain-relative top image and the absolute camo-proxied
// badge (a real snippet from tensorflow/tensorflow's rendered README, same shape) are verbatim,
// except the first image's real filename (".github/Detectron2-Logo-Horz.svg") is renamed below to
// drop "logo" — the unrelated icon/logo noise filter would otherwise drop that block before the
// image-resolution assertion runs, since filterNoise is part of the same htmlToDrafts call. GitHub's
// rendering never rewrote that relative src at all — it only proxies absolute external images
// through camo; the root-relative, differently-cased, and blob-vs-raw shapes below are constructed
// (not observed live) to exercise resolveGithubImage's own branches.
const readmeFixture = `
  <img src=".github/Detectron2-Horz.svg" width="300" style="max-width: 100%;">
  <img src="/docs/banner.png" alt="banner">
  <img src="/facebookresearch/detectron2/raw/main/docs/x.png" alt="x">
  <img src="/Facebookresearch/Detectron2/blob/main/img/y.png" alt="y">
  <img src="https://camo.githubusercontent.com/4b99b5f67e5e01f9ba4d88092d59b81a473b8f8fba65b8d3b5dd638fafdcee58/68747470733a2f2f7777772e74656e736f72666c6f772e6f72672f696d616765732f74665f6c6f676f5f686f72697a6f6e74616c2e706e67"
       data-canonical-src="https://www.tensorflow.org/images/tf_logo_horizontal.png" style="max-width: 100%;">
`;

test("resolveGithubImage resolves root-relative and blob/raw-prefixed paths case-insensitively, leaving plain-relative and absolute camo URLs to normal resolution", () => {
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
    "https://raw.githubusercontent.com/facebookresearch/detectron2/main/docs/x.png", // already repo-qualified ("raw") — rebuilt, not just re-hosted on github.com
    "https://raw.githubusercontent.com/facebookresearch/detectron2/main/img/y.png", // different case, "blob" not "raw" — a github.com/.../blob/... URL would be the HTML viewer page, not image bytes
    "https://camo.githubusercontent.com/4b99b5f67e5e01f9ba4d88092d59b81a473b8f8fba65b8d3b5dd638fafdcee58/68747470733a2f2f7777772e74656e736f72666c6f772e6f72672f696d616765732f74665f6c6f676f5f686f72697a6f6e74616c2e706e67", // absolute camo, untouched
  ]);
});

test("extractGithub converts repo info and a real README into blocks", async () => {
  const restore = mockFetch(async (url) =>
    url.endsWith("/readme")
      ? new Response(readmeFixture, { status: 200 })
      : new Response(JSON.stringify(repoInfoFixture), { status: 200 }),
  );
  try {
    const result = await extractGithub(db, "https://github.com/facebookresearch/detectron2", "");
    assert.equal(result.title, "facebookresearch/detectron2");
    assert.equal(result.author, "facebookresearch");
    assert.equal(result.blocks[0].type, "repo");
    assert.equal(image(result.blocks)?.originalUrl, "https://raw.githubusercontent.com/facebookresearch/detectron2/main/.github/Detectron2-Horz.svg");
  } finally {
    restore();
  }
});

test("extractGithub treats a 404 README as no README, but any other README failure fails the extraction", async () => {
  const restoreOk = mockFetch(async (url) =>
    url.endsWith("/readme") ? new Response("", { status: 404 }) : new Response(JSON.stringify(repoInfoFixture), { status: 200 }),
  );
  try {
    const result = await extractGithub(db, "https://github.com/facebookresearch/detectron2", "");
    assert.deepEqual(result.blocks.map((b) => b.type), ["repo"]); // no README content, but it still succeeds
  } finally {
    restoreOk();
  }

  const restoreRateLimited = mockFetch(async (url) =>
    url.endsWith("/readme") ? new Response("", { status: 403 }) : new Response(JSON.stringify(repoInfoFixture), { status: 200 }),
  );
  try {
    await assert.rejects(() => extractGithub(db, "https://github.com/facebookresearch/detectron2", ""), FetchError);
  } finally {
    restoreRateLimited();
  }
});

test("extractArticle fetches, cleans and extracts an article page, honouring the X-Robots-Tag response header", async () => {
  const html = page(`<title>Big news</title>`, article);
  const restore = mockFetch(async () => new Response(html, { headers: { "content-type": "text/html", "x-robots-tag": "noarchive" } }));
  try {
    const result = await extractArticle(db, `http://${TEST_IP}/post`, "");
    assert.equal(result.meta.noarchive, true);
    assert.ok(result.text.includes("local models"));
  } finally {
    restore();
  }
});
