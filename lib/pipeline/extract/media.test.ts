import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { fakeDb } from "../fake-db.ts";
import { geminiResponse, mockFetch, oembedThenBrokenGemini, withEnv, withGeminiKey, youtubeUrl } from "../mock-fetch.ts";
import { extractX, parseTweetHtml } from "./x.ts";
import { extractYoutube } from "./youtube.ts";

// Shared with the extractX success test below.
const SIMPLE_TWEET_HTML = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">There&#39;s a new kind of coding <a href="https://t.co/x">t.co/x</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://twitter.com/karpathy/status/1">February 2, 2025</a></blockquote>`;

const tweetHtml = (p: string, date: string) =>
  `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${p}</p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/9">${date}</a></blockquote>`;

test("parseTweetHtml reads the post text, links and date from oEmbed html", (t) => {
  withEnv(t, "TZ", "Asia/Tokyo"); // east of UTC: pins the date parser's own " UTC" suffix deterministically
  const post = parseTweetHtml(SIMPLE_TWEET_HTML);
  assert.equal(post.text, "There's a new kind of coding t.co/x");
  assert.equal(post.paragraphs[0].at(-1)?.href, "https://t.co/x");
  assert.equal(post.date, "2025-02-02"); // would read as 2025-02-01 without the " UTC" suffix in this zone
});

// Live oEmbed html for karpathy/1937902205765607626: a real "<br><br>" post, two paragraphs.
const KARPATHY_BR_TWEET_HTML = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">+1 for &quot;context engineering&quot; over &quot;prompt engineering&quot;.<br><br>People associate prompts with short task descriptions you&#39;d give an LLM in your day-to-day use. When in every industrial-strength LLM app, context engineering is the delicate art and science of filling the context window… <a href="https://t.co/Ne65F6vFcf">https://t.co/Ne65F6vFcf</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://x.com/karpathy/status/1937902205765607626?ref_src=twsrc%5Etfw">June 25, 2025</a></blockquote>`;

test("parseTweetHtml splits a run of <br> into separate paragraphs instead of merging them (live karpathy/1937902205765607626)", () => {
  const post = parseTweetHtml(KARPATHY_BR_TWEET_HTML);
  const [first, second] = post.text.split("\n\n");
  assert.equal(post.paragraphs.length, 2);
  assert.equal(first, '+1 for "context engineering" over "prompt engineering".');
  assert.ok(second.startsWith("People associate prompts with short task descriptions"));
  assert.equal(post.date, "2025-06-25");
});

test("parseTweetHtml keeps every line of a <br>-formatted list post as its own paragraph", () => {
  const post = parseTweetHtml(
    tweetHtml(
      "Three things that changed how I code:<br>1. Read the diff, not just the summary<br>2. Keep tests green before refactoring<br>3. Small commits, always",
      "March 3, 2025",
    ),
  );
  assert.equal(post.paragraphs.length, 4);
  assert.equal(post.text.split("\n\n")[3], "3. Small commits, always");
});

test("parseTweetHtml keeps a hashtag-only post instead of dropping it as same-site navigation", () => {
  const post = parseTweetHtml(
    tweetHtml(`<a href="https://x.com/hashtag/AI?src=hash">#AI</a> <a href="https://x.com/hashtag/MachineLearning?src=hash">#MachineLearning</a>`, "April 4, 2025"),
  );
  assert.equal(post.text, "#AI #MachineLearning");
});

test("parseTweetHtml keeps a 'Follow us' post instead of dropping it as boilerplate", () => {
  const post = parseTweetHtml(tweetHtml("Follow us for more AI news and updates every week!", "May 5, 2025"));
  assert.equal(post.text, "Follow us for more AI news and updates every week!");
});

const tweetOembed = (html: string) => new Response(JSON.stringify({ author_name: "Andrej Karpathy", html }));

test("extractX turns a live-shaped oEmbed response into paragraph blocks and marks the result truncated", async (t) => {
  mockFetch(t, async () => tweetOembed(SIMPLE_TWEET_HTML));
  const result = await extractX(fakeDb(), "https://x.com/karpathy/status/1", "");
  assert.deepEqual(result.blocks.map((b) => b.type), ["paragraph"]);
  assert.equal(result.meta.truncated, true);
  assert.equal(result.author, "Andrej Karpathy");
  assert.equal(result.publishedAt, "2025-02-02");
});

test("extractX throws FetchError when the oEmbed endpoint 404s (live: a deleted or nonexistent post)", async (t) => {
  mockFetch(t, async () => new Response("", { status: 404 }));
  await assert.rejects(() => extractX(fakeDb(), "https://x.com/karpathy/status/1", ""), FetchError);
});

test("extractX throws FetchError('x post has no text') when the oEmbed post has no text (e.g. an image-only tweet)", async (t) => {
  mockFetch(t, async () => tweetOembed(tweetHtml("", "January 1, 2025")));
  await assert.rejects(
    () => extractX(fakeDb(), "https://x.com/someone/status/9", ""),
    (error: unknown) => error instanceof FetchError && error.message === "x post has no text",
  );
});

test("extractX wraps a network error (the oEmbed fetch itself rejects) as FetchError, not a bare Error", async (t) => {
  mockFetch(t, async () => {
    throw new Error("network down");
  });
  await assert.rejects(() => extractX(fakeDb(), "https://x.com/someone/status/9", ""), FetchError);
});

const videoOf = (result: { blocks: Block[] }) => result.blocks.find((b): b is Extract<Block, { type: "video" }> => b.type === "video");
const chaptersOf = (result: { blocks: Block[] }) => result.blocks.find((b): b is Extract<Block, { type: "chapters" }> => b.type === "chapters");
const noChapters = { title: { hu: "C", en: "T" }, summary: { hu: "Ö", en: "S" }, keyPoints: { hu: [], en: [] }, tags: [], chapters: [] };

test("extractYoutube embeds the video and sorts chapters by seconds, keeping chapters out of `generated`", async (t) => {
  withGeminiKey(t);
  mockFetch(t, async (url) =>
    url.includes("/oembed")
      ? new Response(JSON.stringify({ title: "How diffusion works", author_name: "A Channel" }))
      : geminiResponse({
          title: { hu: "Cím", en: "Title" },
          summary: { hu: "Összefoglaló", en: "Summary" },
          keyPoints: { hu: ["pont"], en: ["point"] },
          tags: ["training"],
          chapters: [
            { seconds: 90, title: "Details" }, // out of order on purpose
            { seconds: 0, title: "Intro" },
          ],
        }),
  );
  const result = await extractYoutube(fakeDb(), youtubeUrl, "");
  assert.deepEqual(result.blocks.map((b) => b.type), ["video", "chapters"]);
  assert.equal(videoOf(result)?.videoId, "dQw4w9WgXcQ");
  assert.deepEqual(chaptersOf(result)?.items, [
    { seconds: 0, title: "Intro" },
    { seconds: 90, title: "Details" },
  ]);
  assert.equal(result.title, "How diffusion works");
  assert.equal(result.author, "A Channel");
  assert.ok(result.generated);
  assert.ok(!("chapters" in (result.generated as Record<string, unknown>)));
});

test("extractYoutube adds no chapters block when the model returns none", async (t) => {
  withGeminiKey(t);
  mockFetch(t, async (url) =>
    url.includes("/oembed") ? new Response(JSON.stringify({ title: "A video", author_name: "A Channel" })) : geminiResponse(noChapters),
  );
  const result = await extractYoutube(fakeDb(), youtubeUrl, "");
  assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
});

test("extractYoutube throws FetchError('youtube video not found') when oEmbed says the video doesn't exist (400 or 404), without ever calling Gemini", async (t) => {
  for (const status of [400, 404]) {
    let geminiCalled = false;
    mockFetch(t, async (url) => {
      if (url.includes("/oembed")) return new Response("Bad Request", { status });
      geminiCalled = true;
      return geminiResponse(noChapters);
    });
    await assert.rejects(
      () => extractYoutube(fakeDb(), youtubeUrl, ""),
      (error: unknown) => error instanceof FetchError && error.message === "youtube video not found",
    );
    assert.equal(geminiCalled, false);
  }
});

// Anything short of "the video doesn't exist" only costs the title and author: Gemini still runs.
const oembedWithoutInfo: [string, () => Response][] = [
  ["the oEmbed request errors over the network", () => {
    throw new Error("network down");
  }],
  ["oEmbed answers 401 (embedding disabled)", () => new Response("", { status: 401 })],
  ["oEmbed answers 403", () => new Response("", { status: 403 })],
  ["oEmbed answers 200 with a non-JSON body", () => new Response("not json", { status: 200 })],
];

for (const [name, oembed] of oembedWithoutInfo) {
  test(`extractYoutube still calls Gemini and keeps the video block when ${name}`, async (t) => {
    withGeminiKey(t);
    let geminiCalled = false;
    mockFetch(t, async (url) => {
      if (url.includes("/oembed")) return oembed();
      geminiCalled = true;
      return geminiResponse(noChapters);
    });
    const result = await extractYoutube(fakeDb(), youtubeUrl, "");
    assert.equal(geminiCalled, true);
    assert.equal(result.title, youtubeUrl); // no oEmbed title: falls back to the watch URL
    assert.equal(result.author, null);
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
  });
}

test("extractYoutube cancels the oEmbed response body on a non-ok status instead of leaving it open", async (t) => {
  withGeminiKey(t);
  let cancelled = false;
  const body = new ReadableStream({ cancel: () => { cancelled = true; } });
  mockFetch(t, async (url) => (url.includes("/oembed") ? new Response(body, { status: 403 }) : geminiResponse(noChapters)));
  await extractYoutube(fakeDb(), youtubeUrl, "");
  assert.equal(cancelled, true);
});

test("extractYoutube returns a metadata-only result when the Gemini call fails, without ever fetching the watch page", async (t) => {
  withGeminiKey(t);
  const counter = { calls: 0 };
  mockFetch(t, oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }, counter));
  const result = await extractYoutube(fakeDb(), youtubeUrl, "");
  assert.equal(counter.calls, 2); // oEmbed + the one Gemini attempt — the watch page itself is never fetched
  assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
  assert.equal(videoOf(result)?.videoId, "dQw4w9WgXcQ");
  assert.equal(result.title, "A video");
  assert.equal(result.author, "A Channel");
  assert.equal(result.meta.extractionFailed, true);
  assert.equal(result.meta.videoId, "dQw4w9WgXcQ");
  assert.equal(result.text, "A video — A Channel");
  assert.ok(!("generated" in result));
});

test("extractYoutube logs a warning with the url and error message when the Gemini call fails", async (t) => {
  withGeminiKey(t);
  const logged: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    logged.push(args.join(" "));
  });
  mockFetch(t, oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }));
  await extractYoutube(fakeDb(), youtubeUrl, "");
  // generate() itself also warns once per failed route; extractYoutube's own line (the one this
  // fix adds) must be among them, naming both the url and the underlying error, not swallowed.
  assert.ok(logged.length >= 1);
  const own = logged.find((line) => line.includes("youtube") && line.includes(youtubeUrl));
  assert.ok(own, `no logged line named both "youtube" and the url; got: ${JSON.stringify(logged)}`);
  assert.match(own, /is not valid JSON|Unexpected token/); // the underlying Gemini/JSON error, not swallowed
});

test("extractYoutube normalizes a youtu.be link with a timestamp, and sends the watch URL and ingest_video task to Gemini (Y3, Y4, Y5)", async (t) => {
  withGeminiKey(t);
  const db = fakeDb();
  let oembedUrl = "";
  let fileUri: string | undefined;
  mockFetch(t, async (url, init) => {
    if (url.includes("/oembed")) {
      oembedUrl = url;
      return new Response(JSON.stringify({ title: "T", author_name: "A" }));
    }
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { file_data?: { file_uri: string } }[] }[] };
    fileUri = body.contents[0].parts.find((part) => part.file_data)?.file_data?.file_uri;
    return geminiResponse(noChapters);
  });
  await extractYoutube(db, "https://youtu.be/dQw4w9WgXcQ?t=5", "");
  assert.ok(oembedUrl.includes(encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")));
  assert.equal(fileUri, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.deepEqual(db.tasks, ["ingest_video"]);
});
