import assert from "node:assert/strict";
import { test } from "node:test";
import type { Candidate, Repo } from "./collect.ts";
import { curatePrompt, runDaily, toDigestRows } from "./daily.ts";
import { fakeDb } from "./fake-db.ts";
import { feeds } from "./feeds.ts";
import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";
import { isoWeek } from "./util.ts";

const week = isoWeek(new Date("2026-09-23T05:00:00Z"));
const text = (en: string) => ({ hu: `${en} (hu)`, en });

const picked: Candidate[] = [
  { url: "https://blog.test/llama-4", title: "Llama 4 on a laptop", source: "Blog", snippet: "", publishedAt: "2026-09-22", hint: "local" },
  { url: "https://arxiv.org/abs/2609.00001", title: "A paper", source: "arXiv cs.CL", snippet: "", publishedAt: "2026-09-21", hint: "research" },
];
const repos: Repo[] = Array.from({ length: 12 }, (_, i) => ({ repo: `owner/repo-${i}`, focus: "", url: `https://github.com/owner/repo-${i}`, stars: 100 - i }));

type Curated = Parameters<typeof toDigestRows>[0];
const curatedItem = (index: number, title: string): Curated["items"][number] => ({
  index,
  category: index === 0 ? "local" : "research",
  score: 80,
  readMinutes: 6,
  tags: [],
  title: text(title),
  summary: text("Summary."),
  why: text("Why."),
});

test("toDigestRows keeps item ids forever stable: category, week, English title and source URL, nothing else", () => {
  // ⚠️ These literals are half of item_states' primary key in production. If this test fails, the
  // change orphans every reader's read/saved state — fix the code, never the expected ids.
  const { items } = toDigestRows(
    { items: [curatedItem(0, "Llama 4 runs on a laptop"), curatedItem(1, "Árvíztűrő Tükörfúrógép!")], github: [] },
    picked,
    repos,
    week,
  );
  assert.deepEqual(items.map((row) => row.id), ["local-2026w39-llama-4-runs-on-a-laptop-44c0af", "research-2026w39-arvizturo-tukorfurogep-cb24ff"]);
});

test("toDigestRows takes the URL, date and source from the listing, and the rest from the model", () => {
  const { items } = toDigestRows({ items: [curatedItem(1, "Title")], github: [] }, picked, repos, week);
  assert.deepEqual(items[0], {
    id: items[0].id,
    issue_id: "2026-W39",
    category: "research",
    score: 80,
    read_minutes: 6,
    published_at: "2026-09-21",
    source: "arXiv cs.CL",
    url: "https://arxiv.org/abs/2609.00001",
    tags: [],
    title: text("Title"),
    summary: text("Summary."),
    why: text("Why."),
  });
});

test("toDigestRows drops indices the model made up and ranks at most 10 repos in answer order", () => {
  const github = [{ index: 5, focus: "fifth" }, { index: 99, focus: "made up" }, ...[0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11].map((index) => ({ index, focus: "" }))];
  const { items, top } = toDigestRows({ items: [curatedItem(7, "Made up")], github }, picked, repos, week);
  assert.deepEqual(items, []);
  assert.equal(top.length, 10);
  assert.deepEqual(top[0], { issue_id: "2026-W39", rank: 1, repo: "owner/repo-5", focus: "fifth", url: "https://github.com/owner/repo-5" });
  assert.deepEqual(top.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("curatePrompt numbers the news and repo listings the model answers with", () => {
  const prompt = curatePrompt(picked, repos.slice(0, 1));
  assert.match(prompt, /NEWS:\n\[0\] \(local\) Llama 4 on a laptop — Blog\n\[1\] \(research\) A paper — arXiv cs\.CL\n/);
  assert.match(prompt, /REPOS:\n\[0\] owner\/repo-0 \(100★\) — $/);
});

// Only the first feed answers; every other feed, and the fixed-host APIs, are mocked too, so nothing
// reaches the network. A URL stored in the last two weeks must not be offered to the model again.
test("runDaily collects, curates and writes the week's issue, skipping URLs it already has", async (t) => {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {}); // the other feeds' 404s
  const now = new Date("2026-09-23T05:00:00Z");
  const rss = `<rss><channel>
    <item><title>Known story</title><link>https://blog.test/known</link><pubDate>Tue, 22 Sep 2026 08:00:00 GMT</pubDate></item>
    <item><title>Fresh story</title><link>https://blog.test/fresh</link><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;
  let prompt = "";
  mockFetch(t, async (url, init) => {
    if (url === feeds[0].url) return new Response(rss);
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url.startsWith("https://api.github.com/search/")) {
      return Response.json({ items: [{ full_name: "owner/tool", description: "A tool", html_url: "https://github.com/owner/tool", stargazers_count: 42 }] });
    }
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      prompt = geminiPrompt(init);
      return geminiResponse({ items: [curatedItem(0, "Fresh story")], github: [{ index: 0, focus: "A tool" }] });
    }
    return new Response("", { status: 404 });
  });
  const db = fakeDb(undefined, { rows: { digest_items: [{ url: "https://blog.test/known" }] } });

  const result = await runDaily(db, now);

  assert.deepEqual(result, { issue: "2026-W39", candidates: 1, shortlisted: 1, inserted: 1, repos: 1 });
  assert.doesNotMatch(prompt, /Known story/);
  assert.match(prompt, /\[0\] \(research\) Fresh story/);
  assert.deepEqual(db.tasks, ["daily_curate"]); // one candidate is under the shortlist threshold
  const upserted = Object.fromEntries(db.upserts.map((u) => [u.table, u]));
  assert.equal((upserted.issues.values as { id: string }).id, "2026-W39");
  const [item] = upserted.digest_items.values as { id: string; url: string }[];
  assert.equal(item.url, "https://blog.test/fresh");
  assert.deepEqual(upserted.digest_items.options, { onConflict: "url", ignoreDuplicates: true }); // ids are never rewritten
  assert.deepEqual(upserted.github_top.values, [{ issue_id: "2026-W39", rank: 1, repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool" }]);
  assert.deepEqual(db.rpcCalls, [{ name: "refresh_must_read", args: { p_issue: "2026-W39" } }]);
});
