import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeCandidates, parseFeed, type Candidate } from "./collect.ts";

const since = new Date("2026-09-21T00:00:00Z");
const feed = { name: "Test Feed", hint: "research" as const };

const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const atom = (entries: string) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;

test("parseFeed reads RSS 2.0 items: link, stripped title and snippet, the pubDate as YYYY-MM-DD", () => {
  const body = rss(`
    <item>
      <title>New &lt;b&gt;model&lt;/b&gt; released</title>
      <link> https://blog.test/new-model </link>
      <pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;A &lt;em&gt;small&lt;/em&gt; model&amp;nbsp;for laptops.&lt;/p&gt;</description>
    </item>`);
  assert.deepEqual(parseFeed(body, feed, since), [
    {
      url: "https://blog.test/new-model",
      title: "New model released",
      source: "Test Feed",
      snippet: "A small model for laptops.",
      publishedAt: "2026-09-22",
      hint: "research",
    },
  ]);
});

test("parseFeed drops RSS items older than `since` and items without a link, but keeps undated ones", () => {
  const body = rss(`
    <item><title>Old</title><link>https://blog.test/old</link><pubDate>Sun, 20 Sep 2026 23:59:00 GMT</pubDate></item>
    <item><title>No link</title><pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate></item>
    <item><title>Undated</title><link>https://blog.test/undated</link></item>`);
  assert.deepEqual(parseFeed(body, feed, since).map((c) => c.title), ["Undated"]);
});

test("parseFeed reads Atom entries, choosing the link that is neither rel=self nor rel=replies", () => {
  const body = atom(`
    <entry>
      <title>Paper notes</title>
      <link rel="self" href="https://blog.test/feed/entry/1"/>
      <link rel="replies" href="https://blog.test/p/1#comments"/>
      <link rel="alternate" href="https://blog.test/p/1"/>
      <published>2026-09-22T23:30:00-05:00</published>
      <summary>What the paper found.</summary>
    </entry>
    <entry>
      <title>Bare link</title>
      <link href="https://blog.test/p/2"/>
      <updated>2026-09-23T08:00:00Z</updated>
      <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
    </entry>`);
  const [first, second] = parseFeed(body, feed, since);
  assert.equal(first.url, "https://blog.test/p/1");
  assert.equal(first.publishedAt, "2026-09-22");
  assert.equal(first.snippet, "What the paper found.");
  assert.equal(second.url, "https://blog.test/p/2");
  assert.equal(second.publishedAt, "2026-09-23");
  assert.equal(second.snippet, "Body");
});

test("parseFeed keeps an ISO 8601 date's own calendar day, while an RSS pubDate becomes its UTC day", () => {
  // Only ISO dates (Atom's published/updated, dc:date) keep the day they were written with. An RFC 822
  // pubDate has no ISO prefix, so it still goes through Date.parse and lands on the UTC day.
  const iso = atom(`<entry><title>ISO</title><link href="https://blog.test/iso"/><published>2026-09-22T23:30:00-05:00</published></entry>`);
  const rfc = rss(`<item><title>RFC</title><link>https://blog.test/rfc</link><pubDate>Tue, 22 Sep 2026 23:30:00 -0500</pubDate></item>`);
  assert.equal(parseFeed(iso, feed, since)[0].publishedAt, "2026-09-22");
  assert.equal(parseFeed(rfc, feed, since)[0].publishedAt, "2026-09-23");
});

test("parseFeed caps the snippet at 400 characters", () => {
  const body = rss(`<item><title>Long</title><link>https://blog.test/long</link><description>${"word ".repeat(200)}</description></item>`);
  assert.equal(parseFeed(body, feed, since)[0].snippet.length, 400);
});

const candidate = (url: string, title = "A title"): Candidate => ({ url, title, source: "S", snippet: "", publishedAt: "2026-09-22", hint: "local" });

test("dedupeCandidates keeps the first of each URL, ignoring a fragment and a trailing slash", () => {
  const kept = dedupeCandidates([
    candidate("https://blog.test/a", "first"),
    candidate("https://blog.test/a/", "slash"),
    candidate("https://blog.test/a#comments", "fragment"),
    candidate("https://blog.test/b", "other"),
  ]);
  assert.deepEqual(kept.map((c) => c.title), ["first", "other"]);
});

test("dedupeCandidates drops untitled candidates without letting them claim the URL", () => {
  const kept = dedupeCandidates([candidate("https://blog.test/a", ""), candidate("https://blog.test/a", "titled")]);
  assert.deepEqual(kept.map((c) => c.title), ["titled"]);
});
