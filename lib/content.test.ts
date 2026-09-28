import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";
import { isoWeek } from "./pipeline/util.ts";
import { resetRoute, routeStub, signedIn } from "./test/route-hooks.ts";

// lib/content.ts is a Next-only server module (`@/` imports, `server-only`, `next/cache`): route-hooks.ts
// registers the loader that resolves them, and stands in for lib/supabase/server.ts and next/cache.
const { archivedWeek, archiveList, getRadar, getReaderState, getReaderSeed } = await import("./content.ts");

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

// Spec 1.3. Kills the week filter dropped (every week's flags and every `post:<id>` key would ride
// along), aimed at the to-dos (the panel lists them all), or built from the id as written.
test("getReaderState narrows the flags to the week's items, and keeps every to-do", async () => {
  const db = fakeDb(undefined, {
    rows: {
      item_states: [
        { item_id: "local-2026w38-a-1a2b3c", is_read: true, is_saved: false },
        { item_id: "local-2026w39-b-4d5e6f", is_read: true, is_saved: true },
        { item_id: "post:12", is_read: true, is_saved: false },
      ],
      todos: [
        { id: 1, item_id: "local-2026w37-c-7a8b9c", text: "Old week", is_done: false },
        { id: 2, item_id: null, text: "Loose", is_done: true },
      ],
    },
  });
  assert.deepEqual(await getReaderState(db, "2026-W38"), {
    states: { "local-2026w38-a-1a2b3c": { read: true, saved: false } },
    todos: [
      { id: 1, itemId: "local-2026w37-c-7a8b9c", text: "Old week", done: false },
      { id: 2, itemId: null, text: "Loose", done: true },
    ],
  });
  assert.deepEqual(
    db.queries.map(({ table, calls }) => [table, calls.slice(1)]),
    [
      ["item_states", [["like", "item_id", "%-2026w38-%"]]],
      ["todos", [["order", "is_done"], ["order", "created_at", { ascending: false }]]],
    ],
  );
});

// Kills seededAt frozen (e.g. a hardcoded 0 or the issue's own updated_at): the seed's stamp is this
// render's own moment, which is what seedNeedsLoad keys a "seen before in this tab" mount on.
test("getReaderSeed stamps seededAt with the render's own moment, not a fixed value", async (t) => {
  const db = fakeDb(undefined, { rows: { item_states: [], todos: [] } });
  t.mock.timers.enable({ apis: ["Date"] });
  const first = await getReaderSeed(db, "2026-W38");
  t.mock.timers.tick(5_000);
  const second = await getReaderSeed(db, "2026-W38");
  assert.equal(second.seededAt - first.seededAt, 5_000);
  assert.deepEqual(
    [first.issueId, first.data],
    ["2026-W38", { states: {}, todos: [] }],
  );
});

/** A client whose every query fails: handed to the side a test says must not be read. */
const untouchable = () => fakeDb(undefined, { tableErrors: { issues: pgError("42501", "read the wrong client"), archive_issues: pgError("42501", "read the wrong client") } });
const wednesdayW39 = new Date("2026-09-23T12:00:00Z");

// Spec 1.5, security invariants 1 and 3. Kills the closed week read through the reader's client, the
// cache keyed on anything but the week (the viewer, a cookie), and `createAdminClient()` swapped for the
// reader's cookie client inside the cached scope (the stub refuses cookies there, as Next does).
test("archivedWeek reads a closed week through the one-day cache and the admin client, keyed by the week alone", async () => {
  resetRoute();
  routeStub.admin = fakeDb(undefined, { rows: { issues: [issueRow("2026-W38")] } });
  const radar = await archivedWeek(signedIn(untouchable()), "2026-W38", wednesdayW39);
  assert.equal(radar?.issue.id, "2026-W38");
  assert.equal(routeStub.adminCalls, 1);
  assert.deepEqual(routeStub.cached, [{ keyParts: ["closed-week", "v1"], options: { revalidate: 86400 }, args: ["2026-W38"] }]);
});

// Kills `<` → `<=`: the week still being collected would be frozen for a day, and a reader would miss
// its new stories.
test("archivedWeek reads the current week and a future one live, as the reader, never through the cache", async () => {
  resetRoute();
  routeStub.admin = untouchable();
  const reader = signedIn(fakeDb(undefined, { rows: { issues: [issueRow("2026-W39"), issueRow("2026-W40")] } }));
  assert.equal((await archivedWeek(reader, "2026-W39", wednesdayW39))?.issue.id, "2026-W39");
  assert.equal((await archivedWeek(reader, "2026-W40", wednesdayW39))?.issue.id, "2026-W40");
  assert.deepEqual([routeStub.adminCalls, routeStub.cached.length], [0, 0]);
});

// Review Focus 4. Kills a comparison of the week numbers alone: 2026-W53 is closed on Monday 4 January
// 2027 (2027-W01), while on Sunday 3 January 2027 it is still the current week and 2027-W01 a future one.
test("archivedWeek decides closed by the whole week id, across the year boundary", async () => {
  resetRoute();
  routeStub.admin = fakeDb(undefined, { rows: { issues: [issueRow("2026-W53")] } });
  const reader = signedIn(fakeDb(undefined, { rows: { issues: [issueRow("2026-W53"), issueRow("2027-W01")] } }));
  await archivedWeek(reader, "2026-W53", new Date("2027-01-04T00:00:00Z"));
  assert.deepEqual(routeStub.cached.map(({ args }) => args), [["2026-W53"]]);
  await archivedWeek(reader, "2026-W53", new Date("2027-01-03T23:00:00Z"));
  await archivedWeek(reader, "2027-W01", new Date("2027-01-03T23:00:00Z"));
  assert.equal(routeStub.cached.length, 1);
});

// M-2. Kills the isoWeekMonday guard dropped from archivedWeek's very first line: a malformed week id
// would otherwise reach the cache keyed on it, or the reader's own query, instead of being refused first.
test("archivedWeek returns null for a malformed week id, before the cache or the admin client", async () => {
  resetRoute();
  routeStub.admin = untouchable();
  const radar = await archivedWeek(signedIn(untouchable()), "not-a-week", wednesdayW39);
  assert.equal(radar, null);
  assert.deepEqual([routeStub.adminCalls, routeStub.cached.length], [0, 0]);
});

// Security invariant 2. The type is the first guard (tsc fails on a null here unless the directive is
// needed); the runtime check is the second. Kills either entry point's check dropped.
test("archivedWeek and archiveList refuse to run without a signed-in reader, before the admin client opens", async () => {
  resetRoute();
  // @ts-expect-error the entry points take a Reader, never null
  await assert.rejects(archivedWeek(null, "2026-W38", wednesdayW39), /signed-in reader/);
  // @ts-expect-error the entry points take a Reader, never null
  await assert.rejects(archiveList(null), /signed-in reader/);
  assert.deepEqual([routeStub.adminCalls, routeStub.cached.length], [0, 0]);
});

// Spec 1.5. Kills the list read as the reader, a key or revalidate other than the spec's, and a missing
// tag (the cron's revalidateTag would drop nothing, and a closed week would stay off the list for a day).
// M-4: a current-week row sits in the fixture too, so dropping `.neq("id", current)` in getArchive fails
// this test (the list would carry two rows) instead of passing unnoticed.
test("archiveList reads every issue but the current week's through its tagged cache and the admin client", async () => {
  resetRoute();
  const row = { id: "2026-W38", period: "2026 / 09", item_count: 24, read_minutes: 96, top_title: text("Top") };
  routeStub.admin = fakeDb(undefined, { rows: { archive_issues: [row, { ...row, id: isoWeek(new Date()).id }] } });
  assert.deepEqual(await archiveList(signedIn(untouchable())), [
    { id: "2026-W38", period: "2026 / 09", week: "W38", top: text("Top"), itemCount: 24, readMinutes: 96 },
  ]);
  assert.deepEqual(routeStub.cached, [{ keyParts: ["archive-list", "v1"], options: { revalidate: 86400, tags: ["archive"] }, args: [] }]);
  assert.equal(routeStub.adminCalls, 1);
});

// Review Focus 3, security invariant 4. unstable_cache stores what its function resolves (Next's
// unstable-cache.js keeps `await cb()`), so a failed query has to reject. Kills `data ?? []` in either
// loader: the Radar would show an empty week, or /archive "no closed week yet", for a day.
test("a failed query in either cached loader rejects, so the cache keeps nothing", async () => {
  resetRoute();
  routeStub.admin = fakeDb(undefined, { tableErrors: { issues: pgError("08006", "connection failure"), archive_issues: pgError("08006", "connection failure") } });
  const reader = signedIn(fakeDb());
  await assert.rejects(archivedWeek(reader, "2026-W38", wednesdayW39), /radar query failed: connection failure/);
  await assert.rejects(archiveList(reader), /archive query failed: connection failure/);
});
