import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { assignIds, type Block } from "../../lib/blocks.ts";
import { render } from "../../lib/test/render.ts";

const { PostBlocks } = await import("./post-blocks.tsx");

const baseUrl = "https://blog.test/posts/one";
const blocks = assignIds([
  { type: "video", provider: "youtube", videoId: "bad" },
  { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
  { type: "chapters", items: [{ seconds: 30, title: "Intro" }] },
  { type: "paragraph", content: [{ text: "docs", href: "/doc" }, { text: " and " }, { text: "a trap", href: "javascript:alert(1)" }] },
  { type: "video", provider: "vimeo", videoId: "76979871" },
  { type: "repo", fullName: "owner/repo", url: "javascript:alert(2)", stars: 1, topics: [] },
  { type: "image", originalUrl: "javascript:alert(3)", alt: "", path: null },
  { type: "code", language: "ts", code: "const answer = 42;" },
  {
    type: "image",
    originalUrl: "https://blog.test/figure.png",
    alt: "A chart",
    caption: "Figure 1",
    path: "1/0123456789abcdef",
    format: "avif",
    widths: [640, 1280],
    width: 1280,
    height: 720,
    placeholder: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  },
]);
const [invalidVideo, youtube, , paragraph, vimeo, repo, missingImage, codeBlock, mirroredImage] = blocks;

type Props = Parameters<typeof PostBlocks>[0];
const renderBlocks = (props: Partial<Props> = {}) => render(createElement(PostBlocks, { blocks, language: "en", baseUrl, ...props }));
const wrapper = (doc: Document, block: Block) => doc.querySelector(`[data-block-id="${block.id}"]`);
const controls = () => createElement("button", { type: "button" }, "toggle");

test("PostBlocks links only what safeHref allows, resolved against the post's URL", () => {
  const doc = renderBlocks();
  const row = wrapper(doc, paragraph)!;
  assert.deepEqual([...row.querySelectorAll("a")].map((a) => a.getAttribute("href")), ["https://blog.test/doc"]);
  assert.equal(row.textContent, "docs and a trap"); // the unsafe span stays, as plain text
});

test("PostBlocks emits no link that isn't http(s) or an in-page query or fragment, from any block type", () => {
  for (const doc of [renderBlocks({ hidden: [vimeo.id] }), renderBlocks({ controls })]) {
    for (const link of doc.querySelectorAll("a")) assert.match(link.getAttribute("href") ?? "", /^(https?:|\?|#)/);
  }
  // The unsafe repo URL and image URL still show, as plain text.
  assert.equal(wrapper(renderBlocks(), repo)!.querySelectorAll("a").length, 0);
  assert.match(wrapper(renderBlocks(), missingImage)!.textContent!, /javascript:alert\(3\)/);
});

test("PostBlocks embeds a video only when its id validates", () => {
  const doc = renderBlocks();
  assert.equal(wrapper(doc, invalidVideo)!.querySelectorAll("iframe").length, 0);
  const sources = [...doc.querySelectorAll("iframe")].map((frame) => frame.getAttribute("src"));
  assert.deepEqual(sources, ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "https://player.vimeo.com/video/76979871?dnt=1"]);
});

test("PostBlocks gives id=video, the ?t= start and autoplay to the first visible valid video only", () => {
  const doc = renderBlocks({ videoStart: 30 });
  assert.equal(doc.querySelectorAll("#video").length, 1);
  const primary = doc.getElementById("video")!;
  assert.equal(primary.querySelector("iframe")!.getAttribute("src"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30&autoplay=1");
  assert.equal(wrapper(doc, vimeo)!.querySelector("iframe")!.getAttribute("src"), "https://player.vimeo.com/video/76979871?dnt=1");

  const withHidden = renderBlocks({ hidden: [youtube.id] });
  assert.equal(withHidden.getElementById("video")!.querySelector("iframe")!.getAttribute("src"), "https://player.vimeo.com/video/76979871?dnt=1");
});

test("PostBlocks carries the page's query into chapter links and the hidden-blocks link, dropping t from the latter", () => {
  const doc = renderBlocks({ hidden: [vimeo.id], linkQuery: { text: "hu", t: "90" } });
  assert.equal(doc.querySelector("nav a")!.getAttribute("href"), "?text=hu&t=30#video");
  const reveal = [...doc.querySelectorAll("a")].find((a) => a.textContent === "1 hidden block — show")!;
  assert.equal(reveal.getAttribute("href"), "?text=hu&hidden=show");
});

test("PostBlocks in controls mode keeps hidden blocks, and picks the primary video among them", () => {
  const doc = renderBlocks({ hidden: [youtube.id], controls });
  assert.ok(wrapper(doc, youtube), "a hidden block still renders in edit mode");
  assert.equal([...doc.querySelectorAll("a")].some((a) => a.textContent?.includes("hidden block")), false);
  assert.equal(doc.getElementById("video")!.querySelector("iframe")!.getAttribute("src"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("PostBlocks in controls mode gives every block a 40px-tall row and dims only a hidden block's content", () => {
  const doc = renderBlocks({ hidden: [youtube.id], controls });
  for (const row of doc.querySelectorAll("[data-block-id]")) assert.ok(row.classList.contains("min-h-10"), row.getAttribute("data-block-id")!);
  const hiddenRow = wrapper(doc, youtube)!;
  assert.equal(hiddenRow.classList.contains("opacity-40"), false, "the control itself must keep full contrast");
  assert.equal(hiddenRow.children[0].tagName, "BUTTON");
  assert.ok(hiddenRow.children[1].classList.contains("opacity-40"));
  assert.equal(wrapper(doc, vimeo)!.querySelectorAll(".opacity-40").length, 0);
});

// The one layout rule kept here (spec 1.4.11): images, code and video break out of the 75ch prose
// width, and an image's caption sits inside its own frame. The rest of the look is checked in a browser.
test("images, code and video break out of the prose width, and a caption sits inside the image's frame", () => {
  const doc = renderBlocks();
  for (const wide of [mirroredImage, codeBlock, youtube]) {
    assert.equal(wrapper(doc, wide)!.classList.contains("max-w-[75ch]"), false, wide.id);
  }
  assert.ok(wrapper(doc, paragraph)!.classList.contains("max-w-[75ch]"));
  assert.equal(wrapper(doc, mirroredImage)!.querySelector("figure figcaption")!.textContent, "Figure 1");
});

// R1: the placeholder is written into a CSS url("…"); anything but a base64 data:image URL could
// break out of it (a tracking url(), an injected declaration).
test("an image's blur placeholder is rendered only when it is a base64 data:image URL", () => {
  const placeholderStyle = (block: Block) =>
    wrapper(render(createElement(PostBlocks, { blocks: [block], language: "en", baseUrl })), block)!
      .querySelector('span[aria-hidden="true"]')
      ?.getAttribute("style") ?? null;
  assert.match(placeholderStyle(mirroredImage) ?? "", /background-image/);
  const injected = { ...mirroredImage, placeholder: 'data:image/png;base64,AAAA"), url("https://evil.test/track' } as Block;
  assert.equal(placeholderStyle(injected), null);
});
