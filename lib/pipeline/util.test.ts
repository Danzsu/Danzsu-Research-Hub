import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archiveLabel,
  arxivId,
  cooldownRemaining,
  detectSource,
  errorMessage,
  formatTimestamp,
  githubRepo,
  hasNoarchive,
  hostOf,
  isPrivateAddress,
  isoWeek,
  isoWeekMonday,
  itemId,
  list,
  mapLimited,
  parseId,
  parseSubmittedUrl,
  publishedDate,
  publishedLabel,
  safeNext,
  settledValues,
  slugify,
  videoFromUrl,
  xmlText,
  xStatusId,
  youtubeId,
} from "./util.ts";

test("safeNext keeps same-site paths", () => {
  assert.equal(safeNext("/library"), "/library");
  assert.equal(safeNext("/archive/2026-W38?text=hu#top"), "/archive/2026-W38?text=hu#top");
  assert.equal(safeNext("/%09/evil.com"), "/%09/evil.com"); // stays an encoded path on this site
});

test("safeNext rejects anything that resolves off-site", () => {
  for (const hostile of [
    "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com",
    "/..//evil.com", "/.//evil.com", "/%2e%2e//evil.com", "/a/..//evil.com",
    "https://evil.com", "javascript:alert(1)", "evil.com", "",
  ]) {
    assert.equal(safeNext(hostile), "/", JSON.stringify(hostile));
  }
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(["/library"]), "/");
});

test("isoWeek handles year boundaries", () => {
  assert.equal(isoWeek(new Date("2026-09-23T10:00:00Z")).id, "2026-W39");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")).id, "2026-W53"); // Friday → previous ISO year
  assert.equal(isoWeek(new Date("2024-12-30T00:00:00Z")).id, "2025-W01"); // Monday → next ISO year
  assert.equal(isoWeek(new Date("2026-09-27T23:00:00Z")).monday.toISOString().slice(0, 10), "2026-09-21");
});

test("isoWeekMonday inverts isoWeek and rejects bad ids", () => {
  assert.equal(isoWeekMonday("2026-W39")?.toISOString().slice(0, 10), "2026-09-21");
  assert.equal(isoWeekMonday("2025-W01")?.toISOString().slice(0, 10), "2024-12-30");
  assert.equal(isoWeekMonday("2026-W53")?.toISOString().slice(0, 10), "2026-12-28");
  for (let day = 0; day < 800; day += 3) {
    const week = isoWeek(new Date(Date.UTC(2025, 0, 1 + day)));
    assert.equal(isoWeekMonday(week.id)?.getTime(), week.monday.getTime(), week.id);
  }
  for (const bad of ["2025-W53", "2026-W00", "2026-W54", "2026-39", "../etc", ""]) {
    assert.equal(isoWeekMonday(bad), null, bad);
  }
});

test("itemId is stable, bounded, and URL-unique", () => {
  const week = isoWeek(new Date("2026-09-23T00:00:00Z"));
  const a = itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/1");
  assert.match(a, /^research-2026w39-arvizturo-tukorfurogep-new-llm-[0-9a-f]{6}$/);
  assert.equal(a, itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/1"));
  assert.notEqual(a, itemId("research", week, "Árvíztűrő Tükörfúrógép: New LLM!", "https://a.example/2"));
  assert.ok(itemId("local", week, "x".repeat(500), "u").length <= 120);
  assert.equal(slugify("---"), "");
});

test("parseSubmittedUrl rejects internal and non-http targets", () => {
  assert.equal(parseSubmittedUrl("https://example.com/a#frag")?.toString(), "https://example.com/a");
  for (const bad of ["ftp://x.com", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.2", "http://[::1]/", "not a url", "http://intranet"]) {
    assert.equal(parseSubmittedUrl(bad), null, bad);
  }
});

test("parseSubmittedUrl applies isPrivateAddress to IPv4 literals only", () => {
  for (const bad of ["http://100.64.0.1/", "http://224.0.0.1/", "http://0x7f.1/"]) {
    assert.equal(parseSubmittedUrl(bad), null, bad);
  }
  // Hostnames that start like private IPv6 prefixes (ff, fd, fe8) are ordinary sites.
  for (const good of ["https://ffmpeg.org/", "https://fdroid.org/", "https://fe80.example.com/", "https://10.example.com/"]) {
    assert.ok(parseSubmittedUrl(good), good);
  }
});

test("isPrivateAddress covers v4, v6 and mapped forms", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "140.82.112.3", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("isPrivateAddress applies the IPv4 rules to IPv4 carried in NAT64, IPv4-compatible, mapped and 6to4 addresses", () => {
  const cases = {
    nat64: { private: ["64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "[64:ff9b::a9fe:a9fe]"], public: ["64:ff9b::808:808", "64:ff9b::8.8.8.8"] },
    compatible: { private: ["::7f00:1", "::127.0.0.1", "::c0a8:1"], public: ["::808:808"] },
    mapped: { private: ["::ffff:a00:1", "0:0:0:0:0:ffff:7f00:1"], public: ["::ffff:808:808", "::ffff:8.8.8.8"] },
    sixToFour: { private: ["2002:7f00:1::", "2002:a00:1::1", "2002:c0a8:101:1::1"], public: ["2002:808:808::1"] },
  };
  for (const [kind, { private: privateIps, public: publicIps }] of Object.entries(cases)) {
    for (const ip of privateIps) assert.equal(isPrivateAddress(ip), true, `${kind} ${ip}`);
    for (const ip of publicIps) assert.equal(isPrivateAddress(ip), false, `${kind} ${ip}`);
  }
});

test("detectSource and its URL helpers", () => {
  const kind = (u: string) => detectSource(new URL(u));
  assert.equal(kind("https://youtu.be/dQw4w9WgXcQ?si=abc"), "youtube");
  assert.equal(kind("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "youtube");
  assert.equal(kind("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "youtube");
  assert.equal(kind("https://www.youtube.com/@channel"), "article");
  assert.equal(kind("https://arxiv.org/abs/2401.00001v2"), "arxiv");
  assert.equal(kind("https://arxiv.org/pdf/2401.00001"), "arxiv");
  assert.equal(kind("https://arxiv.org/html/2401.00001v1/"), "arxiv");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp"), "github");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp/tree/master/docs"), "github");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp/issues/1"), "article");
  assert.equal(kind("https://github.com/topics/llm"), "article");
  assert.equal(kind("https://x.com/karpathy/status/1886192184808149383"), "x");
  assert.equal(kind("https://twitter.com/a/status/123"), "x");
  assert.equal(kind("https://site.test/paper.PDF"), "pdf");
  assert.equal(kind("https://blog.test/post"), "article");
  assert.equal(youtubeId(new URL("https://youtu.be/dQw4w9WgXcQ")), "dQw4w9WgXcQ");
  assert.equal(youtubeId(new URL("https://youtube.com/watch?v=short")), null);
  assert.equal(arxivId(new URL("https://arxiv.org/abs/2401.00001v2")), "2401.00001");
  assert.deepEqual(githubRepo(new URL("https://github.com/a/b.git")), { owner: "a", repo: "b" });
  assert.equal(xStatusId(new URL("https://x.com/a/status/42?s=20")), "42");
});

test("cooldownRemaining and formatTimestamp", () => {
  const now = new Date("2026-09-24T10:00:00Z");
  assert.equal(cooldownRemaining(null, now), 0);
  assert.equal(cooldownRemaining("2026-09-24T09:55:00Z", now), 300);
  assert.equal(cooldownRemaining("2026-09-24T09:40:00Z", now), 0);
  assert.equal(formatTimestamp(65), "1:05");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

test("hostOf and parseId", () => {
  assert.equal(hostOf("https://www.blog.test/a"), "blog.test");
  assert.equal(parseId("42"), 42);
  for (const bad of ["", "0", "4.2", "-1", "abc", "1e3", "12345678901234567"]) assert.equal(parseId(bad), null, bad);
});

test("publishedLabel", () => {
  assert.equal(publishedLabel("2026-09-22"), "09 / 22");
});

test("youtubeId rejects videoseries playlist embeds", () => {
  assert.equal(youtubeId(new URL("https://www.youtube.com/embed/videoseries?list=PL123")), null);
});

test("list normalizes an XML-parsed field that's absent, a single value, or an array", () => {
  assert.deepEqual(list(undefined), []);
  assert.deepEqual(list({ name: "Grisha Perelman" }), [{ name: "Grisha Perelman" }]); // a single tag, not split apart
  assert.deepEqual(list([{ name: "a" }, { name: "b" }]), [{ name: "a" }, { name: "b" }]);
});

test("xmlText normalizes a string, a number, an attributes-mixed #text wrapper, and absent values", () => {
  assert.equal(xmlText("plain"), "plain");
  assert.equal(xmlText(0.1), "0.1");
  assert.equal(xmlText({ "@_rel": "self", "#text": "wrapped" }), "wrapped");
  assert.equal(xmlText(undefined), "");
  assert.equal(xmlText(null), "");
});

test("hasNoarchive matches case-insensitively across several robots-directive strings", () => {
  assert.equal(hasNoarchive("index, follow"), false);
  assert.equal(hasNoarchive("max-image-preview:large", "noarchive"), true); // two metas, the second carries it
  assert.equal(hasNoarchive("NOARCHIVE"), true);
  assert.equal(hasNoarchive(null, undefined, "noarchive"), true); // a header alongside absent metas
  assert.equal(hasNoarchive(), false);
});

// Fix round 1: a real production bug — supabase-js resolves a failed call's `error` to a plain
// object (`{ message, code, details, hint }`), never an Error instance; without this, a failed posts
// upsert wrote "[object Object]" into sources.error, and the post page showed that to the submitter.
test("errorMessage reads an Error's own message, a plain error object's message field, or stringifies anything else", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(
    errorMessage({ message: "duplicate key value violates unique constraint", code: "23505", details: null, hint: null }),
    "duplicate key value violates unique constraint",
  );
  assert.equal(errorMessage("plain string"), "plain string");
  assert.equal(errorMessage({ code: "23505" }), "[object Object]"); // no message field: falls back to String()
  assert.equal(errorMessage(null), "null");
});

test("settledValues keeps the fulfilled values in order and logs each rejection with its label", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const results = await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error("down")), Promise.resolve(3)]);
  assert.deepEqual(settledValues(results, (i) => `feed ${i}`), [1, 3]);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["feed 1: down"]]);
});

test("mapLimited runs at most `limit` items concurrently and keeps result order", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 7 }, (_, i) => i);
  const results = await mapLimited(items, 3, async (i) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return i * 10;
  });
  assert.equal(maxInFlight, 3);
  assert.deepEqual(results, items.map((i) => i * 10));
});

test("mapLimited propagates the first error", async () => {
  await assert.rejects(
    mapLimited([0, 1, 2], 2, async (i) => {
      if (i === 1) throw new Error("boom");
      return i;
    }),
    /boom/,
  );
});

test("mapLimited stops dispatching new items once one has failed, without cancelling in-flight ones", async () => {
  const started: number[] = [];
  const items = [0, 1, 2, 3, 4, 5];
  await assert.rejects(
    mapLimited(items, 2, async (i) => {
      started.push(i);
      // item 1 fails fast; item 0 (the other in-flight slot) keeps running well past that —
      // long enough that if the failure didn't stop new dispatches, a 3rd item would start too.
      await new Promise((resolve) => setTimeout(resolve, i === 1 ? 5 : 20));
      if (i === 1) throw new Error("boom");
      return i;
    }),
    /boom/,
  );
  // mapLimited's own promise rejects as soon as item 1 fails — well before item 0's still-running
  // worker loop reaches the point of trying to grab a 3rd item. Wait past that window before
  // checking what actually got dispatched, or this assertion would pass even without the guard.
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(started, [0, 1]); // 2, 3, 4, 5 were never dispatched once item 1 failed
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

test("videoFromUrl recognises YouTube and Vimeo player embeds, resolving against the page", () => {
  const base = "https://blog.test/post";
  assert.deepEqual(videoFromUrl("//www.youtube.com/embed/dQw4w9WgXcQ", base), { provider: "youtube", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(videoFromUrl("https://player.vimeo.com/video/76979871?h=abc", base), { provider: "vimeo", videoId: "76979871" });
  for (const other of ["https://vimeo.com/76979871", "https://ads.test/frame", "/embed/dQw4w9WgXcQ", "http://[bad"]) {
    assert.equal(videoFromUrl(other, base), null, other);
  }
});

test("archiveLabel names the Sunday that closes the week, across month and year boundaries", () => {
  assert.equal(archiveLabel(isoWeekMonday("2026-W39")!), "09. 27.");
  assert.equal(archiveLabel(isoWeekMonday("2026-W40")!), "10. 04.");
  assert.equal(archiveLabel(isoWeekMonday("2026-W53")!), "01. 03.");
});
