import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { fakeModelDb, geminiResponse, mockFetch, withGeminiKey } from "../mock-fetch.ts";
import { extractX, parseTweetHtml } from "./x.ts";
import { extractYoutube } from "./youtube.ts";

test("parseTweetHtml reads the post text, links and date from oEmbed html", () => {
  const post = parseTweetHtml(
    `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">There&#39;s a new kind of coding <a href="https://t.co/x">t.co/x</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://twitter.com/karpathy/status/1">February 2, 2025</a></blockquote>`,
  );
  assert.equal(post.text, "There's a new kind of coding t.co/x");
  assert.equal(post.paragraphs[0].at(-1)?.href, "https://t.co/x");
  assert.equal(post.date, "2025-02-02");
});

const tweetOembed = (html: string) => new Response(JSON.stringify({ author_name: "Andrej Karpathy", html }));

test("extractX turns a live-shaped oEmbed response into paragraph blocks and marks the result truncated", async () => {
  const restore = mockFetch(async () =>
    tweetOembed(
      `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">There&#39;s a new kind of coding <a href="https://t.co/x">t.co/x</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://twitter.com/karpathy/status/1">February 2, 2025</a></blockquote>`,
    ),
  );
  try {
    const result = await extractX(fakeModelDb(), "https://x.com/karpathy/status/1", "");
    assert.deepEqual(result.blocks.map((b) => b.type), ["paragraph"]);
    assert.equal(result.meta.truncated, true);
    assert.equal(result.author, "Andrej Karpathy");
    assert.equal(result.publishedAt, "2025-02-02");
  } finally {
    restore();
  }
});

test("extractX throws FetchError when the oEmbed endpoint 404s (no public post)", async () => {
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    await assert.rejects(() => extractX(fakeModelDb(), "https://x.com/karpathy/status/1", ""), FetchError);
  } finally {
    restore();
  }
});

const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

test("extractYoutube embeds the video and chapters from one Gemini call, keeping chapters out of `generated`", async () => {
  const restoreKey = withGeminiKey();
  const restore = mockFetch(async (url) =>
    url.includes("/oembed")
      ? new Response(JSON.stringify({ title: "How diffusion works", author_name: "A Channel" }))
      : geminiResponse({
          title: { hu: "Cím", en: "Title" },
          summary: { hu: "Összefoglaló", en: "Summary" },
          keyPoints: { hu: ["pont"], en: ["point"] },
          tags: ["training"],
          chapters: [
            { seconds: 0, title: "Intro" },
            { seconds: 90, title: "Details" },
          ],
        }),
  );
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.deepEqual(result.blocks.map((b) => b.type), ["video", "chapters"]);
    assert.equal((result.blocks[0] as Extract<Block, { type: "video" }>).videoId, "dQw4w9WgXcQ");
    assert.deepEqual((result.blocks[1] as Extract<Block, { type: "chapters" }>).items, [
      { seconds: 0, title: "Intro" },
      { seconds: 90, title: "Details" },
    ]);
    assert.equal(result.title, "How diffusion works");
    assert.equal(result.author, "A Channel");
    assert.ok(result.generated);
    assert.ok(!("chapters" in (result.generated as Record<string, unknown>)));
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube adds no chapters block when the model returns none, and falls back to the watch URL as title when oEmbed fails", async () => {
  const restoreKey = withGeminiKey();
  const restore = mockFetch(async (url) =>
    url.includes("/oembed")
      ? new Response("", { status: 404 })
      : geminiResponse({ title: { hu: "C", en: "T" }, summary: { hu: "Ö", en: "S" }, keyPoints: { hu: [], en: [] }, tags: [], chapters: [] }),
  );
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
    assert.equal(result.title, youtubeUrl);
    assert.equal(result.author, null);
  } finally {
    restore();
    restoreKey();
  }
});
