import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { fakeModelDb, geminiResponse, mockFetch, oembedThenBrokenGemini, withGeminiKey, youtubeUrl } from "../mock-fetch.ts";
import { extractX, parseTweetHtml } from "./x.ts";
import { extractYoutube } from "./youtube.ts";

// Shared with the extractX success test below (fix round 1, item 5: was duplicated).
const SIMPLE_TWEET_HTML = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">There&#39;s a new kind of coding <a href="https://t.co/x">t.co/x</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://twitter.com/karpathy/status/1">February 2, 2025</a></blockquote>`;

const tweetHtml = (p: string, date: string) =>
  `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${p}</p>&mdash; Someone (@someone) <a href="https://x.com/someone/status/9">${date}</a></blockquote>`;

test("parseTweetHtml reads the post text, links and date from oEmbed html", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Tokyo"; // east of UTC: pins the date parser's own " UTC" suffix deterministically
  try {
    const post = parseTweetHtml(SIMPLE_TWEET_HTML);
    assert.equal(post.text, "There's a new kind of coding t.co/x");
    assert.equal(post.paragraphs[0].at(-1)?.href, "https://t.co/x");
    assert.equal(post.date, "2025-02-02"); // would read as 2025-02-01 without the " UTC" suffix in this zone
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

// Live oEmbed html for karpathy/1937902205765607626: a real "<br><br>" post that used to collapse
// into one run-on line (fix round 1, item 2a).
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

test("parseTweetHtml keeps a hashtag-only post instead of dropping it as same-site navigation (fix round 1, item 2b)", () => {
  const post = parseTweetHtml(
    tweetHtml(`<a href="https://x.com/hashtag/AI?src=hash">#AI</a> <a href="https://x.com/hashtag/MachineLearning?src=hash">#MachineLearning</a>`, "April 4, 2025"),
  );
  assert.equal(post.text, "#AI #MachineLearning");
});

test("parseTweetHtml keeps a 'Follow us' post instead of dropping it as boilerplate (fix round 1, item 2b)", () => {
  const post = parseTweetHtml(tweetHtml("Follow us for more AI news and updates every week!", "May 5, 2025"));
  assert.equal(post.text, "Follow us for more AI news and updates every week!");
});

const tweetOembed = (html: string) => new Response(JSON.stringify({ author_name: "Andrej Karpathy", html }));

test("extractX turns a live-shaped oEmbed response into paragraph blocks and marks the result truncated", async () => {
  const restore = mockFetch(async () => tweetOembed(SIMPLE_TWEET_HTML));
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

test("extractX throws FetchError when the oEmbed endpoint 404s (live: a deleted or nonexistent post)", async () => {
  const restore = mockFetch(async () => new Response("", { status: 404 }));
  try {
    await assert.rejects(() => extractX(fakeModelDb(), "https://x.com/karpathy/status/1", ""), FetchError);
  } finally {
    restore();
  }
});

test("extractX throws FetchError('x post has no text') when the oEmbed post has no text (X4, e.g. an image-only tweet; fix round 2, item 2)", async () => {
  const restore = mockFetch(async () => tweetOembed(tweetHtml("", "January 1, 2025")));
  try {
    await assert.rejects(
      () => extractX(fakeModelDb(), "https://x.com/someone/status/9", ""),
      (error: unknown) => error instanceof FetchError && error.message === "x post has no text",
    );
  } finally {
    restore();
  }
});

test("extractX wraps a network error (the oEmbed fetch itself rejects) as FetchError, not a bare Error (fix round 2, item 2)", async () => {
  const restore = mockFetch(async () => {
    throw new Error("network down");
  });
  try {
    await assert.rejects(() => extractX(fakeModelDb(), "https://x.com/someone/status/9", ""), FetchError);
  } finally {
    restore();
  }
});

const videoOf = (result: { blocks: Block[] }) => result.blocks.find((b): b is Extract<Block, { type: "video" }> => b.type === "video");
const chaptersOf = (result: { blocks: Block[] }) => result.blocks.find((b): b is Extract<Block, { type: "chapters" }> => b.type === "chapters");
const noChapters = { title: { hu: "C", en: "T" }, summary: { hu: "Ö", en: "S" }, keyPoints: { hu: [], en: [] }, tags: [], chapters: [] };

test("extractYoutube embeds the video and sorts chapters by seconds, keeping chapters out of `generated`", async () => {
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
            { seconds: 90, title: "Details" }, // out of order on purpose
            { seconds: 0, title: "Intro" },
          ],
        }),
  );
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
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
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube adds no chapters block when the model returns none", async () => {
  const restoreKey = withGeminiKey();
  const restore = mockFetch(async (url) =>
    url.includes("/oembed") ? new Response(JSON.stringify({ title: "A video", author_name: "A Channel" })) : geminiResponse(noChapters),
  );
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube throws FetchError('youtube video not found') when oEmbed says the video doesn't exist (400 or 404), without ever calling Gemini", async () => {
  for (const status of [400, 404]) {
    let geminiCalled = false;
    const restore = mockFetch(async (url) => {
      if (url.includes("/oembed")) return new Response("Bad Request", { status });
      geminiCalled = true;
      return geminiResponse(noChapters);
    });
    try {
      await assert.rejects(
        () => extractYoutube(fakeModelDb(), youtubeUrl, ""),
        (error: unknown) => error instanceof FetchError && error.message === "youtube video not found",
      );
      assert.equal(geminiCalled, false);
    } finally {
      restore();
    }
  }
});

test("extractYoutube still calls Gemini when the oEmbed request itself errors over the network", async () => {
  const restoreKey = withGeminiKey();
  let geminiCalled = false;
  const restore = mockFetch(async (url) => {
    if (url.includes("/oembed")) throw new Error("network down");
    geminiCalled = true;
    return geminiResponse(noChapters);
  });
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.equal(geminiCalled, true);
    assert.equal(result.title, youtubeUrl); // no oEmbed title available — falls back to the watch URL
    assert.equal(result.author, null);
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube continues without oEmbed info on other non-OK statuses (401/403, embedding disabled) and still calls Gemini", async () => {
  for (const status of [401, 403]) {
    const restoreKey = withGeminiKey();
    let geminiCalled = false;
    const restore = mockFetch(async (url) => {
      if (url.includes("/oembed")) return new Response("", { status });
      geminiCalled = true;
      return geminiResponse(noChapters);
    });
    try {
      const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
      assert.equal(geminiCalled, true);
      assert.equal(result.title, youtubeUrl);
    } finally {
      restore();
      restoreKey();
    }
  }
});

test("extractYoutube treats an oEmbed 200 with a non-JSON body the same as no info, instead of escaping into a video-less metadata post (fix round 2, item 2)", async () => {
  const restoreKey = withGeminiKey();
  let geminiCalled = false;
  const restore = mockFetch(async (url) => {
    if (url.includes("/oembed")) return new Response("not json", { status: 200 });
    geminiCalled = true;
    return geminiResponse(noChapters);
  });
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.equal(geminiCalled, true); // the bad body didn't escape uncaught — Gemini still ran
    assert.equal(result.title, youtubeUrl);
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]); // still has its video block
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube cancels the oEmbed response body on a non-ok status instead of leaving it open (fix round 2, item 4)", async () => {
  const restoreKey = withGeminiKey();
  let cancelled = false;
  const body = new ReadableStream({ cancel: () => { cancelled = true; } });
  const restore = mockFetch(async (url) => (url.includes("/oembed") ? new Response(body, { status: 403 }) : geminiResponse(noChapters)));
  try {
    await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.equal(cancelled, true);
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube returns a metadata-only result when the Gemini call fails, without ever fetching the watch page", async () => {
  const restoreKey = withGeminiKey();
  const counter = { calls: 0 };
  const restore = mockFetch(oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }, counter));
  try {
    const result = await extractYoutube(fakeModelDb(), youtubeUrl, "");
    assert.equal(counter.calls, 2); // oEmbed + the one Gemini attempt — the watch page itself is never fetched
    assert.deepEqual(result.blocks.map((b) => b.type), ["video"]);
    assert.equal(videoOf(result)?.videoId, "dQw4w9WgXcQ");
    assert.equal(result.title, "A video");
    assert.equal(result.author, "A Channel");
    assert.equal(result.meta.extractionFailed, true);
    assert.equal(result.meta.videoId, "dQw4w9WgXcQ");
    assert.equal(result.text, "A video — A Channel");
    assert.ok(!("generated" in result));
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube logs a warning with the url and error message when the Gemini call fails (fix round 2, item 1)", async (t) => {
  const restoreKey = withGeminiKey();
  const logged: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    logged.push(args.join(" "));
  });
  const restore = mockFetch(oembedThenBrokenGemini({ title: "A video", author_name: "A Channel" }));
  try {
    await extractYoutube(fakeModelDb(), youtubeUrl, "");
    // generate() itself also warns once per failed route; extractYoutube's own line (the one this
    // fix adds) must be among them, naming both the url and the underlying error, not swallowed.
    assert.ok(logged.length >= 1);
    const own = logged.find((line) => line.includes("youtube") && line.includes(youtubeUrl));
    assert.ok(own, `no logged line named both "youtube" and the url; got: ${JSON.stringify(logged)}`);
    assert.match(own, /is not valid JSON|Unexpected token/); // the underlying Gemini/JSON error, not swallowed
  } finally {
    restore();
    restoreKey();
  }
});

test("extractYoutube normalizes a youtu.be link with a timestamp, and sends the watch URL and ingest_video task to Gemini (Y3, Y4, Y5)", async () => {
  const restoreKey = withGeminiKey();
  const db = fakeModelDb();
  let oembedUrl = "";
  let fileUri: string | undefined;
  const restore = mockFetch(async (url, init) => {
    if (url.includes("/oembed")) {
      oembedUrl = url;
      return new Response(JSON.stringify({ title: "T", author_name: "A" }));
    }
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { file_data?: { file_uri: string } }[] }[] };
    fileUri = body.contents[0].parts.find((part) => part.file_data)?.file_data?.file_uri;
    return geminiResponse(noChapters);
  });
  try {
    await extractYoutube(db, "https://youtu.be/dQw4w9WgXcQ?t=5", "");
    assert.ok(oembedUrl.includes(encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")));
    assert.equal(fileUri, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.deepEqual(db.tasks, ["ingest_video"]);
  } finally {
    restore();
    restoreKey();
  }
});
