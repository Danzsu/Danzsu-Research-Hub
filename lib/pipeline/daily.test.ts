import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Repo } from "./collect.ts";
import { curatePrompt, runDaily, toDigestRows, type Scored } from "./daily.ts";
import { fakeDb, pgError } from "./fake-db.ts";
import { feeds } from "../../config/sources.ts";
import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";
import { isoWeek } from "./util.ts";

const week = isoWeek(new Date("2026-09-23T05:00:00Z"));
/** What a model-written text becomes in a row: the one original in both slots. */
const both = (text: string) => ({ hu: text, en: text });

const scored = { score: 80, readMinutes: 6, points: 0, weight: 1 };
const picked: Scored[] = [
  { url: "https://blog.test/llama-4", title: "Llama 4 on a laptop", source: "Blog", snippet: "", publishedAt: "2026-09-22", hint: "local", category: "local", ...scored },
  { url: "https://arxiv.org/abs/2609.00001", title: "A paper", source: "arXiv cs.CL", snippet: "", publishedAt: "2026-09-21", hint: "research", category: "research", ...scored },
];
const repos: Repo[] = Array.from({ length: 12 }, (_, i) => ({ repo: `owner/repo-${i}`, focus: "", url: `https://github.com/owner/repo-${i}`, stars: 100 - i, language: i % 2 ? null : "Python" }));

/** `n` synthetic Hacker News Algolia hits ("Story 0".."Story n-1"), all above the points threshold. */
const hnHits = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ title: `Story ${i}`, url: `https://news.test/${i}`, created_at: "2026-09-22T08:00:00Z", points: 100, objectID: String(i) }));

const DECISIONS_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";

/** Decision 1's answer to a request, built from its own questions: `relevance` is the score level (0–4) every item
 *  gets, `promoted` the indices answered as promotions. */
function decisionsResponse(init: RequestInit | undefined, { level = 3, promoted = [] as number[] } = {}) {
  const { questions } = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
  const answers: Record<string, unknown> = {};
  for (const key of Object.keys(questions)) {
    const i = Number(key.slice(1));
    if (key[0] === "r") answers[key] = { type: "score", score: level };
    if (key[0] === "p") answers[key] = { type: "noul", noul: promoted.includes(i) ? 0.95 : 0.05 };
    if (key[0] === "c") answers[key] = { type: "choice", choice: "local" };
  }
  return Response.json({ answers });
}

type Curated = Parameters<typeof toDigestRows>[0];
const curatedItem = (index: number, title: string): Curated["items"][number] => ({
  index,
  tags: [],
  title,
  summary: "Summary.",
  why: "Why.",
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
    title: both("Title"),
    summary: both("Summary."),
    why: both("Why."),
  });
});

test("toDigestRows drops indices the model made up and ranks at most 10 repos in answer order", () => {
  const github = [{ index: 5, focus: "fifth", score: 91 }, { index: 99, focus: "made up", score: 50 }, ...[0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11].map((index) => ({ index, focus: "", score: 40 }))];
  const { items, top } = toDigestRows({ items: [curatedItem(7, "Made up")], github }, picked, repos, week);
  assert.deepEqual(items, []);
  assert.equal(top.length, 10);
  assert.deepEqual(top[0], { issue_id: "2026-W39", rank: 1, repo: "owner/repo-5", focus: "fifth", url: "https://github.com/owner/repo-5", stars: 95, language: null, score: 91 });
  assert.deepEqual(top.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("curatePrompt numbers the news and repo listings the model answers with", () => {
  const prompt = curatePrompt(picked, repos.slice(0, 1));
  assert.match(prompt, /NEWS:\n\[0\] \(local\) Llama 4 on a laptop — Blog\n\[1\] \(research\) A paper — arXiv cs\.CL\n/);
  assert.match(prompt, /REPOS:\n\[0\] owner\/repo-0 \(100★, Python\) — $/);
});

// Only the first feed answers; every other feed, and the fixed-host APIs, are mocked too, so nothing
// reaches the network. A page stored in the last two weeks must not be offered to the model again, whatever form its
// URL took then (2026-11-13 audit: a trailing slash and www against a tracking parameter).
test("runDaily collects, curates and writes the week's issue, skipping URLs it already has", async (t) => {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {}); // the other feeds' 404s
  const now = new Date("2026-09-23T05:00:00Z");
  const rss = `<rss><channel>
    <item><title>Known story</title><link>https://blog.test/known?utm_source=rss</link><pubDate>Tue, 22 Sep 2026 08:00:00 GMT</pubDate></item>
    <item><title>Fresh story</title><link>https://blog.test/fresh</link><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;
  let prompt = "";
  mockFetch(t, async (url, init) => {
    if (url === feeds[0].url) return new Response(rss);
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url.startsWith("https://api.github.com/search/")) {
      return Response.json({ items: [{ full_name: "owner/tool", description: "A tool", html_url: "https://github.com/owner/tool", stargazers_count: 42, language: "Rust" }] });
    }
    if (url === DECISIONS_URL) return decisionsResponse(init);
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      prompt = geminiPrompt(init);
      return geminiResponse({ items: [curatedItem(0, "Fresh story")], github: [{ index: 0, focus: "A tool", score: 88 }] });
    }
    return new Response("", { status: 404 });
  });
  const db = fakeDb(undefined, { rows: { digest_items: [{ url: "https://www.blog.test/known/", created_at: "2026-09-20T05:00:00Z" }] } });

  const result = await runDaily(db, now);

  assert.deepEqual(result, { issue: "2026-W39", candidates: 1, shortlisted: 1, inserted: 1, repos: 1, daily: 1 });
  assert.doesNotMatch(prompt, /Known story/);
  assert.ok(prompt.includes(`[0] (${feeds[0].hint}) Fresh story`));
  assert.deepEqual(db.tasks, ["daily_curate"]); // one candidate is under the shortlist threshold
  const upserted = Object.fromEntries(db.upserts.map((u) => [u.table, u]));
  assert.equal((upserted.issues.values as { id: string }).id, "2026-W39");
  const [item] = upserted.digest_items.values as { id: string; url: string }[];
  assert.equal(item.url, "https://blog.test/fresh");
  assert.deepEqual(upserted.digest_items.options, { onConflict: "url", ignoreDuplicates: true }); // ids are never rewritten
  assert.deepEqual(upserted.github_top.values, [{ issue_id: "2026-W39", rank: 1, repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool", stars: 42, language: "Rust", score: 88 }]);
  assert.deepEqual(upserted.github_top.options, { onConflict: "issue_id,rank" }); // a re-run replaces the week's ranking
  // The week's Top 10 is rewritten by rank; a shorter day must not leave yesterday's ranks 9–10 behind.
  assert.deepEqual(db.deletes, [
    { table: "github_top", filters: [["issue_id", "2026-W39"], ["rank", 1, "gt"]] },
    { table: "daily_top", filters: [["day", "2026-09-23"], ["rank", 1, "gt"]] },
  ]);
  // The day's Top 10, by the Budapest date, rewritten by rank like the repos.
  assert.deepEqual(upserted.daily_top.values, [{ day: "2026-09-23", rank: 1, item_id: item.id }]);
  assert.deepEqual(upserted.daily_top.options, { onConflict: "day,rank" });
  // "Known" means stored in the last 14 days, by creation time.
  // …and the day's Top 10 is picked from what was added since Budapest's midnight (22:00 UTC in summer).
  assert.deepEqual(db.gteCalls, [
    { table: "digest_items", column: "created_at", value: "2026-09-09T05:00:00.000Z" },
    { table: "digest_items", column: "created_at", value: "2026-09-22T22:00:00.000Z" },
  ]);
  assert.deepEqual(db.rpcCalls, [{ name: "refresh_must_read", args: { p_issue: "2026-W39" } }]);
});

/** A run over `n` Hacker News stories, curated empty; reports what Decision 1 was asked and what the curation saw. */
async function runOverStories(t: TestContext, n: number, decisions: (init: RequestInit | undefined) => Response | Promise<Response>) {
  withGeminiKey(t);
  const warn = t.mock.method(console, "warn", () => {}); // the feeds' 404s
  const hits = hnHits(n);
  const seen = { decided: 0, prompt: "" };
  mockFetch(t, async (url, init) => {
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits });
    if (url === DECISIONS_URL) {
      seen.decided = Object.keys((JSON.parse(String(init?.body)) as { questions: object }).questions).length / 3;
      return decisions(init);
    }
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      seen.prompt = geminiPrompt(init);
      return geminiResponse({ items: [], github: [] });
    }
    return new Response("", { status: 404 });
  });
  const db = fakeDb();
  const result = await runDaily(db, new Date("2026-09-23T05:00:00Z"));
  return { db, result, seen, warn };
}

// 2026-11-13. Kills the model judging every candidate of a busy day (the listing and the cost grow with it), and the
// curation writing up more than a day's quota.
test("runDaily has Decision 1 judge only the 60 best by rule score, and curates at most 25 of them", async (t) => {
  const { result, seen, db } = await runOverStories(t, 70, (init) => decisionsResponse(init));
  assert.deepEqual([result.candidates, seen.decided, result.shortlisted], [70, 60, 25]);
  assert.deepEqual(db.tasks, ["daily_curate"], "no shortlist model any more");
  assert.equal((seen.prompt.match(/^\[\d+\] \(/gm) ?? []).length, 25);
});

// Kills the day's run depending on Decision 1: a refused request must leave the rules to score, not fail the run.
test("runDaily scores by the rules alone when Decision 1 fails, and says so", async (t) => {
  const { result, warn } = await runOverStories(t, 5, () => new Response('{"error":{"code":"safety"}}', { status: 400 }));
  assert.equal(result.shortlisted, 5);
  assert.ok(warn.mock.calls.some((call) => /decisions failed, scoring by the rules alone/.test(String(call.arguments[0]))));
});

// Kills promotions reaching a card: Decision 1 says item 0 is a sign-up, so it never reaches the curation.
test("runDaily drops what Decision 1 calls a promotion, and what is judged irrelevant", async (t) => {
  const promoted = await runOverStories(t, 3, (init) => decisionsResponse(init, { promoted: [0, 1, 2] }));
  assert.equal(promoted.result.shortlisted, 0);
  const irrelevant = await runOverStories(t, 3, (init) => decisionsResponse(init, { level: 0 }));
  assert.equal(irrelevant.result.shortlisted, 0);
});

// G1 spec 2. Kills the score dropped from the prompt (the model would answer without one and fail the schema).
// Kills a curate prompt that still asks for Hungarian: content is never translated (2026-11-01 decision).
test("curatePrompt asks for each text once, in the story's own language, and never for Hungarian", () => {
  const prompt = curatePrompt(picked, repos.slice(0, 1));
  assert.match(prompt, /never translate/);
  assert.doesNotMatch(prompt, /Hungarian|bilingual/i);
});

test("curatePrompt asks for a 0–100 score on every repo, on the news' scale", () => {
  assert.match(curatePrompt([], repos), /"github" with a focus line of at most 8 English words and a score from 0 to 100/);
});

// Review Focus 3. Kills a run with no repos wiping the week's ranking (a model hiccup would empty the Top 10).
test("runDaily with no repos leaves the week's github_top rows alone", async (t) => {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  mockFetch(t, async (url, init) => {
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: hnHits(1) });
    if (url === DECISIONS_URL) return decisionsResponse(init);
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return geminiResponse({ items: [], github: [] });
    return new Response("", { status: 404 });
  });
  const db = fakeDb();
  await runDaily(db, new Date("2026-09-23T05:00:00Z"));
  assert.deepEqual(db.deletes, []);
  assert.equal(db.upserts.some((u) => u.table === "github_top"), false);
});

// Spec N3. Kills the covered titles left out of the prompt (the model would repeat a story told yesterday),
// the list unbounded (14 days can hold 350 items), and the one-story-one-item rule dropped.
test("curatePrompt lists what the last 14 days already covered, and asks for one item per story", () => {
  const covered = Array.from({ length: 450 }, (_, i) => `Covered story ${i}`);
  const prompt = curatePrompt(picked, [], covered);
  assert.match(prompt, /ALREADY COVERED[^\n]*\n- Covered story 0\n/);
  assert.match(prompt, /- Covered story 399\n/);
  assert.doesNotMatch(prompt, /Covered story 400/);
  assert.match(prompt, /same story/);
  assert.doesNotMatch(curatePrompt(picked, []), /ALREADY COVERED/);
});

/** A run whose model curates `items` from one feed item each (Decision 1 judges every one relevant). */
async function dailyRun(t: TestContext, picks: { title: string }[], tables: Parameters<typeof fakeDb>[1] = {}, now = new Date("2026-09-23T14:00:00Z"), db = fakeDb(undefined, tables)) {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  const rss = `<rss><channel>${picks.map((p, i) => `<item><title>${p.title}</title><link>https://blog.test/${i}</link><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;
  let prompt = "";
  mockFetch(t, async (url, init) => {
    if (url === feeds[0].url) return new Response(rss);
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url === DECISIONS_URL) return decisionsResponse(init);
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      prompt = geminiPrompt(init);
      return geminiResponse({ items: picks.map((p, i) => curatedItem(i, p.title)), github: [] });
    }
    return new Response("", { status: 404 });
  });
  const result = await runDaily(db, now);
  return { db, result, prompt: () => prompt };
}

// Spec N3. Kills the recent lookup still asking for URLs only: the titles feed the ALREADY COVERED block.
test("runDaily hands the model the titles stored in the last 14 days", async (t) => {
  const { prompt } = await dailyRun(t, [{ title: "New" }], {
    rows: { digest_items: [{ url: "https://old.test/a", title: { hu: "Régi", en: "Old story" } }] },
  });
  assert.match(prompt(), /ALREADY COVERED[^\n]*\n- Old story\n/);
});

// Review Focus 2. Kills a daily_top row for an item the upsert ignored (its URL was stored more than 14 days
// ago): the foreign key would fail the whole run. Only the rows written count.
test("runDaily ranks only the items this run wrote", async (t) => {
  // Stored long ago: past the 14-day lookup, so the model sees it, but the upsert skips it.
  const { db, result } = await dailyRun(t, [{ title: "Kept" }, { title: "Old" }], {
    rows: { digest_items: [{ url: "https://blog.test/1", created_at: "2026-08-01T00:00:00Z" }] },
  });
  const top = db.upserts.find((u) => u.table === "daily_top")?.values as { item_id: string }[];
  assert.equal(top.length, 1);
  assert.match(top[0].item_id, /kept/);
  assert.equal(result.inserted, 1);
});

// Polish 1, Review Focus 1. Kills a list built from this run's inserts only: a re-run after a failed one, or the
// first evening after a morning run, would rank only the few new items. Every item added since Budapest's
// midnight competes; yesterday's don't.
test("the day's Top 10 is picked from every item added today, whichever run added it", async (t) => {
  const { db } = await dailyRun(t, [{ title: "Evening" }], {
    rows: {
      digest_items: [
        { id: "morning-best", url: "https://old.test/m", score: 95, read_minutes: 5, created_at: "2026-09-23T05:00:00Z" },
        { id: "yesterday", url: "https://old.test/y", score: 99, read_minutes: 5, created_at: "2026-09-22T20:00:00Z" },
      ],
    },
  });
  const top = db.upserts.find((u) => u.table === "daily_top")?.values as { item_id: string }[];
  assert.deepEqual(top.map((row) => row.item_id).slice(0, 1), ["morning-best"]);
  assert.match(top[1].item_id, /-evening-/);
  assert.equal(top.length, 2);
});

// Polish 1, Review Focus 2. Kills the must-read refresh skipped when the daily list's write fails.
test("a failed daily_top write still leaves the week's Top 3 refreshed", async (t) => {
  const db = fakeDb(undefined, { tableWriteErrors: { daily_top: pgError("08006", "down") } });
  await assert.rejects(dailyRun(t, [{ title: "Story" }], {}, undefined, db));
  assert.deepEqual(db.rpcCalls.map((call) => call.name), ["refresh_must_read"]);
});

// Polish final review. Kills the reverse trade: a failed refresh_must_read must not cost the day's list either.
test("a failed refresh_must_read still writes the day's list, and the run still fails", async (t) => {
  const db = fakeDb(undefined, { rpcError: pgError("08006", "down") });
  await assert.rejects(dailyRun(t, [{ title: "Story" }], {}, undefined, db));
  assert.equal((db.upserts.find((u) => u.table === "daily_top")?.values as unknown[] | undefined)?.length, 1);
});

// Spec N6, Review Focus 3. Kills the day taken in UTC: a manual run at 00:30 in Budapest belongs to the new day.
test("a run after midnight in Budapest writes the new day's list", async (t) => {
  const { db } = await dailyRun(t, [{ title: "Late" }], {}, new Date("2026-09-23T22:30:00Z"));
  assert.deepEqual(db.deletes.at(-1), { table: "daily_top", filters: [["day", "2026-09-24"], ["rank", 1, "gt"]] });
});
