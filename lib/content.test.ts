import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";
import { isoWeek } from "./pipeline/util.ts";
import { resetRoute, routeStub, signedIn } from "./test/route-hooks.ts";

// lib/content.ts is a Next-only server module (`@/` imports, `server-only`, `next/cache`): route-hooks.ts
// registers the loader that resolves them, and stands in for lib/supabase/server.ts and next/cache.
const {
  archivedWeek,
  archiveList,
  getDaily,
  getFavorites,
  getGithubRepos,
  getOpenSources,
  getPost,
  getPosts,
  getRadar,
  getRatings,
  getReadPostIds,
  getReaderState,
  getReaderSeed,
  githubPage,
} = await import("./content.ts");

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
  created_at: "2026-09-16T05:59:50+00:00",
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
test("getRadar maps the one embedded answer: the items in the database's order, the repos with their score, the week's id", async () => {
  const items = [itemRow("2609.00002", 80, true), itemRow("2609.00001", 95)];
  const db = fakeDb(undefined, {
    rows: {
      issues: [
        issueRow("2026-W38", {
          digest_items: items,
          github_top: [
            { repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool", stars: 120, language: "Go", score: 77 },
            { repo: "owner/old", focus: "Before G1", url: "https://github.com/owner/old", stars: null, language: null, score: null },
          ],
        }),
      ],
    },
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
    addedAt: "2026-09-16T05:59:50+00:00",
    source: "arXiv cs.CL",
    url: "https://arxiv.org/abs/2609.00002",
    tags: ["evals"],
    title: text("Title 2609.00002"),
    summary: text("Summary."),
    why: text("Why."),
  });
  assert.deepEqual(radar?.githubTop10, [
    { repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool", stars: 120, language: "Go", score: 77 },
    { repo: "owner/old", focus: "Before G1", url: "https://github.com/owner/old", stars: null, language: null, score: null },
  ]);
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
    "id, updated_at, digest_items(id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why, created_at, daily_top(rank)), github_top(repo, focus, url, stars, language, score)",
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

// R2 spec 2. Kills `data ?? []` / `data ? … : null` coming back on the Library's reads: a failed query
// would show an empty Library, or a 404 for a post that exists. Also kills a list mapped to nothing.
test("the Library's content reads throw on a failed query, with the PostgREST error as the cause", async () => {
  const error = pgError("08006", "connection failure");
  const withCause = (what: string) => (e: unknown) => e instanceof Error && e.message === `${what} query failed: connection failure` && e.cause === error;
  await assert.rejects(getPosts(fakeDb(undefined, { tableErrors: { posts: error } })), withCause("posts"));
  await assert.rejects(getPost(fakeDb(undefined, { postError: error }), 7), withCause("post"));
  await assert.rejects(getOpenSources(fakeDb(undefined, { sourceSelectError: error })), withCause("open sources"));
  assert.equal(await getPost(fakeDb(), 7), null, "no row is still a 404");
  assert.deepEqual((await getPosts(fakeDb(undefined, { rows: { posts: [{ id: 3 }] } }))).map((post) => post.id), [3]);
});

// R2 spec 2. Kills the reader's own marks failing the page: the dimming is all their failure costs.
test("getReadPostIds logs a failed query and answers none, so the Library still renders", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const ids = await getReadPostIds(fakeDb(undefined, { tableErrors: { item_states: pgError("08006", "connection failure") } }));
  assert.equal(ids.size, 0);
  assert.equal(logged.mock.callCount(), 1);
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

// Spec 1.5, security invariants 1 and 3. `routeStub.reader` is set to the same reader passed in,
// mirroring production's React-memoized `getReader()`: a second call inside the cached scope answers
// with this same Reader, not null, so a leak shows up against this literal. Deliberately not a
// comparison against getRadar's own output: getRadar is the loader the cache wraps, so anything it
// itself added would appear on both sides and cancel out. Kills the closed week read through the
// reader's client, the cache keyed on anything but the week (the viewer, a cookie), and
// `createAdminClient()` swapped for the reader's cookie client inside the cached scope.
test("archivedWeek reads a closed week through the one-day cache and the admin client, keyed by the week alone", async () => {
  resetRoute();
  routeStub.admin = fakeDb(undefined, { rows: { issues: [issueRow("2026-W38")] } });
  const reader = signedIn(untouchable());
  routeStub.reader = reader;
  const radar = await archivedWeek(reader, "2026-W38", wednesdayW39);
  assert.deepEqual(radar, { issue: { id: "2026-W38", label: "2026 / W38", updated: "09. 20. 07:00", archiveAt: "09. 20." }, items: [], githubTop10: [] });
  assert.equal(routeStub.adminCalls, 1);
  assert.deepEqual(routeStub.cached, [{ keyParts: ["closed-week", "v4"], options: { revalidate: 86400 }, args: ["2026-W38"] }]);
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
// Two ids, because they sort on opposite sides of the current week: "not-a-week" sorts above it (the
// live reader-query path, if unguarded) and "2026-W00" sorts below it (the cache-key path) — the guard
// has to catch both, not just the one that happens to avoid the cache.
test("archivedWeek returns null for a malformed week id, before the cache or the admin client", async () => {
  resetRoute();
  routeStub.admin = untouchable();
  assert.equal(await archivedWeek(signedIn(untouchable()), "not-a-week", wednesdayW39), null);
  assert.equal(await archivedWeek(signedIn(untouchable()), "2026-W00", wednesdayW39), null);
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
// this test (the list would carry two rows) instead of passing unnoticed. `routeStub.reader` mirrors
// production's memoized `getReader()` (see the closed-week test above), so a leak (the cache adding the
// viewer's email to each row) would show up against the exact expected rows below, not go unnoticed.
test("archiveList reads every issue but the current week's through its tagged cache and the admin client", async () => {
  resetRoute();
  const row = { id: "2026-W38", period: "2026 / 09", item_count: 24, read_minutes: 96, top_title: text("Top") };
  routeStub.admin = fakeDb(undefined, { rows: { archive_issues: [row, { ...row, id: isoWeek(new Date()).id }] } });
  const reader = signedIn(untouchable());
  routeStub.reader = reader;
  assert.deepEqual(await archiveList(reader), [
    { id: "2026-W38", period: "2026 / 09", week: "W38", top: text("Top"), itemCount: 24, readMinutes: 96 },
  ]);
  assert.deepEqual(routeStub.cached, [{ keyParts: ["archive-list", "v1"], options: { revalidate: 86400, tags: ["archive"] }, args: [] }]);
  assert.equal(routeStub.adminCalls, 1);
});

// Review Focus 3, security invariant 4. unstable_cache stores what its function resolves (Next's
// unstable-cache.js keeps `await cb()`), so a failed query has to reject. Kills `data ?? []` in either
// loader: the Radar would show an empty week, or /archive "no closed week yet", for a day. (The stub
// always calls straight through, so this doesn't and can't prove "a rejection isn't cached, so the next
// call retries" — that's store-on-success, Next's own behaviour in unstable-cache.js.)
test("a failed query in either cached loader rejects, so the cache keeps nothing", async () => {
  resetRoute();
  routeStub.admin = fakeDb(undefined, { tableErrors: { issues: pgError("08006", "connection failure"), archive_issues: pgError("08006", "connection failure") } });
  const reader = signedIn(fakeDb());
  await assert.rejects(archivedWeek(reader, "2026-W38", wednesdayW39), /radar query failed: connection failure/);
  await assert.rejects(archiveList(reader), /archive query failed: connection failure/);
});

// G1 spec 3. Kills a lookup that answers another kind's rating for the same id, a repo found only in its
// stored casing, and a failure that fails the page instead of costing only the marks.
test("getRatings answers the reader's own ratings by key, and a failed query logs and answers none", async (t) => {
  const db = fakeDb(undefined, {
    rows: {
      ratings: [
        { target_kind: "item", target_id: "a", value: 2 },
        { target_kind: "post", target_id: "a", value: -1 },
        { target_kind: "repo", target_id: "owner/tool", value: 1 },
      ],
    },
  });
  assert.deepEqual(await getRatings(db, [{ kind: "item", id: "a" }, { kind: "repo", id: "Owner/Tool" }]), { "item:a": 2, "repo:owner/tool": 1 });
  assert.deepEqual(await getRatings(db, []), {});
  const logged = t.mock.method(console, "error", () => {});
  assert.deepEqual(await getRatings(fakeDb(undefined, { tableErrors: { ratings: pgError("08006", "connection failure") } }), [{ kind: "item", id: "a" }]), {});
  assert.equal(logged.mock.callCount(), 1);
});

/** The value lists a fake db's `.in(...)` calls on `table` received, one per query. */
const inLists = (db: ReturnType<typeof fakeDb>, table: string) =>
  db.queries.filter((query) => query.table === table).flatMap(({ calls }) => calls.filter(([method]) => method === "in").map(([, , values]) => values as unknown[]));

// Final review. Kills one `.in(...)` with every id: a busy week's hundred-odd ids pass PostgREST's URL-length
// limit, and every rating on the Radar would vanish with the failed query.
test("getRatings looks the ids up 30 at a time and answers every chunk's ratings", async () => {
  const targets = Array.from({ length: 31 }, (_, index) => ({ kind: "item" as const, id: `local-2026w39-${index}` }));
  const db = fakeDb(undefined, { rows: { ratings: [{ target_kind: "item", target_id: "local-2026w39-0", value: 2 }, { target_kind: "item", target_id: "local-2026w39-30", value: -1 }] } });
  assert.deepEqual(await getRatings(db, targets), { "item:local-2026w39-0": 2, "item:local-2026w39-30": -1 });
  assert.deepEqual(inLists(db, "ratings").map((values) => values.length), [30, 1]);
});

// Review Focus 3. Kills a page number taken as written (NaN, 0, or a 999-page query).
test("githubPage reads a page from 1 to 20, and anything else as 1", () => {
  assert.deepEqual(["1", "3", "20", "21", "999", "0", "-2", "abc", undefined].map(githubPage), [1, 3, 20, 20, 20, 1, 1, 1, 1]);
});

const repoRow = (key: string, overrides: Record<string, unknown> = {}) => ({
  repo_key: key,
  repo: key,
  focus: "f",
  url: `https://github.com/${key}`,
  stars: 10,
  language: "Go",
  score: 70,
  first_week: "2026-W38",
  last_week: "2026-W40",
  week_count: 2,
  best_rank: 3,
  rating: null,
  disliked: false,
  ...overrides,
});

// G1 spec 4. Kills the 👎 not sorted last, the filters not passed to the view, a page that can't tell
// there is more, and the language list not deduplicated.
test("getGithubRepos asks the view for one page with the 👎 last, applies the filters, and says when there is more", async () => {
  const rows = Array.from({ length: 31 }, (_, i) => repoRow(`o/r${i}`, { language: i % 2 ? "Go" : "Rust" }));
  const db = fakeDb(undefined, { rows: { github_repos: rows } });
  const page = await getGithubRepos(db, { page: 1 });
  assert.equal(page.repos.length, 30);
  assert.equal(page.more, true);
  assert.deepEqual(page.languages, ["Go", "Rust"]);
  assert.deepEqual(page.repos[0], {
    key: "o/r0",
    repo: "o/r0",
    focus: "f",
    url: "https://github.com/o/r0",
    stars: 10,
    language: "Rust",
    score: 70,
    firstWeek: "2026-W38",
    lastWeek: "2026-W40",
    weekCount: 2,
    bestRank: 3,
    rating: null,
  });
  const listing = db.queries.find(({ table, calls }) => table === "github_repos" && calls.some(([method]) => method === "limit"));
  assert.deepEqual(listing?.calls.filter(([method]) => method === "order" || method === "limit"), [
    ["order", "disliked"],
    ["order", "last_week", { ascending: false }],
    ["order", "best_rank"],
    ["limit", 31],
  ]);
  const filtered = fakeDb(undefined, { rows: { github_repos: [repoRow("o/a", { rating: 2 }), repoRow("o/b"), repoRow("o/c", { rating: 2, language: "Rust" })] } });
  assert.deepEqual((await getGithubRepos(filtered, { rating: "heart", language: "Go", page: 1 })).repos.map((r) => r.key), ["o/a"]);
  assert.deepEqual((await getGithubRepos(filtered, { rating: "none", page: 1 })).repos.map((r) => r.key), ["o/b"]);
});

// Kills a failed tab read answered as an empty tab.
test("getGithubRepos throws on a failed query, with the PostgREST error as the cause", async () => {
  const error = pgError("08006", "connection failure");
  await assert.rejects(getGithubRepos(fakeDb(undefined, { tableErrors: { github_repos: error } }), { page: 1 }), (e: unknown) => e instanceof Error && e.cause === error);
});

// G1 spec 5 and Review Focus 4. Kills the order lost (the latest ❤ first), a gone target kept as a broken
// row, a post shown with the model's title over the reader's own, and a 👍 listed as a favourite.
// Final review: a ❤ repo that fell out of the week's final Top 10 (the daily run rewrites it by rank) has
// no github_repos row, so it is kept from its own id; an id that isn't a repo path is left out.
test("getFavorites lists the reader's ❤ items, posts and repos, latest first, and leaves out what is gone", async () => {
  const db = fakeDb(undefined, {
    rows: {
      ratings: [
        { target_kind: "post", target_id: "7", value: 2, updated_at: "2026-10-03T10:00:00Z" },
        { target_kind: "repo", target_id: "owner/tool", value: 2, updated_at: "2026-10-02T10:00:00Z" },
        { target_kind: "post", target_id: "99", value: 2, updated_at: "2026-10-01T10:00:00Z" },
        { target_kind: "item", target_id: "local-2026w39-a", value: 2, updated_at: "2026-09-30T10:00:00Z" },
        { target_kind: "item", target_id: "local-2026w39-b", value: 1, updated_at: "2026-09-29T10:00:00Z" },
        { target_kind: "repo", target_id: "dropped/tool", value: 2, updated_at: "2026-09-28T10:00:00Z" },
        { target_kind: "repo", target_id: "javascript:alert(1)", value: 2, updated_at: "2026-09-27T10:00:00Z" },
      ],
      digest_items: [
        { id: "local-2026w39-a", issue_id: "2026-W39", title: { hu: "Hír", en: "News" }, url: "https://blog.test/a", source: "Blog" },
        { id: "local-2026w39-b", issue_id: "2026-W39", title: { hu: "Hasznos", en: "Useful" }, url: "https://blog.test/b", source: "Blog" },
      ],
      posts: [{ id: 7, title: { hu: "Modell", en: "Model" }, overrides: { title: { hu: "Saját", en: "Own" } } }],
      github_repos: [repoRow("owner/tool", { repo: "Owner/Tool" })],
    },
  });
  assert.deepEqual(await getFavorites(db), [
    { kind: "post", id: "7", title: { hu: "Saját", en: "Own" }, href: "/library/7", external: false, detail: null },
    { kind: "repo", id: "owner/tool", title: "Owner/Tool", href: "https://github.com/owner/tool", external: true, detail: "W40" },
    { kind: "item", id: "local-2026w39-a", title: { hu: "Hír", en: "News" }, href: "https://blog.test/a", external: true, detail: "Blog · W39" },
    { kind: "repo", id: "dropped/tool", title: "dropped/tool", href: "https://github.com/dropped/tool", external: true, detail: null },
  ]);
});

// Final review. Kills a ❤ lookup sent in one `.in(...)`: a reader's hearts only grow, and past the URL-length
// limit the collection would fail to an error page.
test("getFavorites looks the ❤ items up 30 at a time", async () => {
  const ids = Array.from({ length: 31 }, (_, index) => `local-2026w39-${index}`);
  const db = fakeDb(undefined, {
    rows: {
      ratings: ids.map((id) => ({ target_kind: "item", target_id: id, value: 2, updated_at: "2026-10-01T10:00:00Z" })),
      digest_items: ids.map((id) => ({ id, issue_id: "2026-W39", title: { hu: id, en: id }, url: `https://blog.test/${id}`, source: "Blog" })),
    },
  });
  assert.equal((await getFavorites(db)).length, 31);
  assert.deepEqual(inLists(db, "digest_items").map((values) => values.length), [30, 1]);
});

// Kills a failed lookup answered as no rows: the collection would quietly show fewer hearts instead of the error page.
test("getFavorites throws when a lookup fails, with the PostgREST error as the cause", async () => {
  const error = pgError("08006", "connection failure");
  const db = fakeDb(undefined, { rows: { ratings: [{ target_kind: "item", target_id: "a", value: 2, updated_at: "2026-10-01T10:00:00Z" }] }, tableErrors: { digest_items: error } });
  await assert.rejects(getFavorites(db), (e: unknown) => e instanceof Error && e.cause === error);
});

// Daily news spec N7. Kills the weekly card's DAY TOP mark lost in the mapping, and one invented for an item
// that never made a daily list.
test("getRadar marks the items ranked in a daily Top 10", async () => {
  const db = fakeDb(undefined, { rows: { issues: [issueRow("2026-W38", { digest_items: [{ ...itemRow("a", 90), daily_top: [{ rank: 3 }] }, { ...itemRow("b", 80), daily_top: [] }] })] } });
  const radar = await getRadar(db, "2026-W38");
  assert.deepEqual(radar?.items.map((item) => item.dailyRank), [3, undefined]);
});

const dailyRow = (day: string, rank: number, id: string, minutes = 6) => ({ day, rank, digest_items: { ...itemRow(id, 90 - rank), issue_id: "2026-W38", read_minutes: minutes } });

// Spec N7, N8, Review Focus 5. Kills an older day's ranks mixed in (the limit reaches past a short day), the
// rank order lost, the week taken from the clock instead of the items, and `today` judged in UTC.
test("getDaily answers the latest day's list in rank order, with its week and whether it is today's", async () => {
  const db = fakeDb(undefined, {
    rows: { daily_top: [dailyRow("2026-09-17", 1, "x"), dailyRow("2026-09-18", 1, "a"), dailyRow("2026-09-18", 2, "b")] },
  });
  const daily = await getDaily(db, new Date("2026-09-18T21:30:00Z"));
  assert.deepEqual(daily.items.map((item) => item.id), ["a", "b"]);
  assert.equal(daily.issue.id, "2026-W38");
  assert.equal(daily.issue.label, "2026. 09. 18.");
  assert.equal(daily.today, true);
  assert.equal((await getDaily(db, new Date("2026-09-18T22:30:00Z"))).today, false);
});

// Spec N8. Kills each fallback step: the brief over the summary, the submitter's summary over the model's,
// "being written" only for a pending source, and nothing for a failed one; "Olvasd itt" for every post.
test("getDaily gives each card the best long text there is", async () => {
  const urls = ["brief", "summary", "pending", "failed"].map((name) => `https://arxiv.org/abs/${name}`);
  const db = fakeDb(undefined, {
    rows: { daily_top: ["brief", "summary", "pending", "failed"].map((id, i) => dailyRow("2026-09-18", i + 1, id)) },
    sources: [
      { url: urls[0], status: "done", posts: { id: 1, brief: { hu: ["B"], en: ["B"] }, summary: text("S"), key_points: { hu: [], en: [] }, overrides: {} } },
      { url: urls[1], status: "done", posts: { id: 2, brief: null, summary: text("S"), key_points: { hu: ["k"], en: ["k"] }, overrides: { summary: text("Mine") } } },
      { url: urls[2], status: "pending", posts: null },
      { url: urls[3], status: "failed", posts: null },
    ],
  });
  const daily = await getDaily(db, new Date("2026-09-18T15:00:00Z"));
  assert.deepEqual(daily.briefs, {
    brief: { kind: "brief", paragraphs: { hu: ["B"], en: ["B"] } },
    summary: { kind: "post", summary: text("Mine"), keyPoints: { hu: ["k"], en: ["k"] } },
    pending: { kind: "pending" },
  });
  assert.deepEqual(daily.posts, { brief: 1, summary: 2 });
});

// Spec N8. Kills a crash or a made-up day before the first list: no day, the current week, nothing to show.
test("getDaily before any list answers an empty, not-today day in the current week", async () => {
  const daily = await getDaily(fakeDb(undefined, { rows: { daily_top: [] } }), new Date("2026-09-18T15:00:00Z"));
  assert.deepEqual([daily.items, daily.today, daily.issue.id, daily.issue.label], [[], false, "2026-W38", "—"]);
});

// Kills a failed query answered as an empty day (the page would say "no list yet" during an outage).
test("getDaily throws on a failed query", async () => {
  await assert.rejects(getDaily(fakeDb(undefined, { tableErrors: { daily_top: pgError("08006", "down") } })), /daily query failed/);
});
