import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";
import { isoWeek } from "./pipeline/util.ts";
import "./test/route-hooks.ts";

// lib/content.ts is a Next-only server module (`@/` imports, `server-only`): route-hooks.ts registers
// the loader that resolves both, and stands in for lib/supabase/server.ts.
const { getRadar } = await import("./content.ts");

const text = (en: string) => ({ hu: `${en} (hu)`, en });
/** A digest_items row as the embed selects it. */
const itemRow = (id: string, score: number, mustRead = false) => ({
  id,
  category: "research",
  must_read: mustRead,
  score,
  read_minutes: 6,
  published_at: "2026-09-15",
  source: "arXiv cs.CL",
  url: `https://arxiv.org/abs/${id}`,
  tags: ["evals"],
  title: text(`Title ${id}`),
  summary: text("Summary."),
  why: text("Why."),
});
/** An issues row with its two embeds, as PostgREST answers the one Radar query. */
const issueRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  updated_at: "2026-09-20T05:00:00Z",
  digest_items: [],
  github_top: [],
  ...overrides,
});

// Kills a mapping that re-sorts or drops the embedded rows (the database orders them: must_read, then
// score), a tuple with its fields swapped, and an issue id that isn't the row's.
test("getRadar maps the one embedded answer: the items in the database's order, the repos as tuples, the week's id", async () => {
  const items = [itemRow("2609.00002", 80, true), itemRow("2609.00001", 95)];
  const db = fakeDb(undefined, {
    rows: { issues: [issueRow("2026-W38", { digest_items: items, github_top: [{ repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool" }] })] },
  });
  const radar = await getRadar(db, "2026-W38");
  assert.deepEqual(radar?.issue, { id: "2026-W38", label: "2026 / W38", updated: "09. 20. 07:00", archiveAt: "09. 20." });
  assert.deepEqual(radar?.items.map((item) => item.id), ["2609.00002", "2609.00001"]);
  assert.deepEqual(radar?.items[0], {
    id: "2609.00002",
    category: "research",
    mustRead: true,
    score: 80,
    readMinutes: 6,
    publishedAt: "2026-09-15",
    publishedLabel: "09 / 15",
    source: "arXiv cs.CL",
    url: "https://arxiv.org/abs/2609.00002",
    tags: ["evals"],
    title: text("Title 2609.00002"),
    summary: text("Summary."),
    why: text("Why."),
  });
  assert.deepEqual(radar?.githubTop10, [["owner/tool", "A tool", "https://github.com/owner/tool"]]);
});

// Kills the embeds' order dropped or aimed at the wrong table (the Top 3 would no longer lead), a
// second round trip for the items, and the latest-issue branch losing its order or its limit.
test("getRadar asks for the named week or the latest issue in one query, with the embeds ordered by the database", async () => {
  const db = fakeDb(undefined, { rows: { issues: [] } });
  assert.equal(await getRadar(db, "2026-W38"), null);
  const empty = await getRadar(db);
  assert.equal(empty?.issue.id, isoWeek(new Date()).id); // no issue yet: the current week, empty
  assert.deepEqual([empty?.items, empty?.githubTop10], [[], []]);
  const select = [
    "select",
    "id, updated_at, digest_items(id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why), github_top(repo, focus, url)",
  ];
  const embedOrder = [
    ["order", "must_read", { ascending: false, referencedTable: "digest_items" }],
    ["order", "score", { ascending: false, referencedTable: "digest_items" }],
    ["order", "rank", { referencedTable: "github_top" }],
  ];
  assert.deepEqual(db.queries, [
    { table: "issues", calls: [select, ...embedOrder, ["eq", "id", "2026-W38"], ["maybeSingle"]] },
    { table: "issues", calls: [select, ...embedOrder, ["order", "id", { ascending: false }], ["limit", 1], ["maybeSingle"]] },
  ]);
});

// Kills `data ?? []` coming back: a failed query has to throw, or the closed-week cache keeps an
// empty week for a day and `/` shows an empty Radar as if nothing had been collected. Also kills the
// thrown error losing its `cause`, which would strip the original PostgREST error off the one a
// caller logs.
test("getRadar throws on a failed query instead of answering an empty week", async () => {
  const error = pgError("08006", "connection failure");
  const db = fakeDb(undefined, { tableErrors: { issues: error } });
  const failsWithCause = (e: unknown) => e instanceof Error && /radar query failed: connection failure/.test(e.message) && e.cause === error;
  await assert.rejects(getRadar(db), failsWithCause);
  await assert.rejects(getRadar(db, "2026-W38"), failsWithCause);
});
