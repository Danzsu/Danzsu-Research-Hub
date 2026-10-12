import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type {
  ArchiveIssue,
  CurrentIssue,
  DailyBrief,
  DigestItem,
  GithubTopEntry,
  Language,
  Localized,
} from "@/data/digest-types";
import { readBrief } from "@/lib/brief";
import { itemSources } from "@/lib/my-sources";
import { readOverrides } from "@/lib/overrides";
import { toPost } from "@/lib/post-row";
import { shownTitle, type Post } from "@/lib/post-view";
import { budapestDay, DAILY_SIZE } from "@/lib/pipeline/daily-top";
import { archiveLabel, githubRepo, inChunks, isoWeek, isoWeekMonday, publishedLabel, weekItemPattern } from "@/lib/pipeline/util";
import { RATING_FILTERS, ratingKey, ratingTargetId, type RatingFilter, type RatingKind, type RatingTarget, type RatingValue, type Ratings } from "@/lib/ratings";
import { POST_STATE_PREFIX, readPostIds, type ReaderData, type ReaderSeed } from "@/lib/reader-store";
import { createAdminClient, type Reader } from "@/lib/supabase/server";

const budapest = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type RadarData = { issue: CurrentIssue; items: DigestItem[]; githubTop10: GithubTopEntry[] };

/** A failed query, as the error a page throws: app/error.tsx shows it with "Újra", never an empty list or
 *  a 404 (R2 spec 2). The PostgREST error rides along as the cause, for the log. */
function queryFailed(what: string, error: { message: string }): Error {
  return new Error(`${what} query failed: ${error.message}`, { cause: error });
}

const ITEM_COLUMNS = "id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why, created_at, daily_top(rank)";
const RADAR_COLUMNS = `id, updated_at, digest_items(${ITEM_COLUMNS}), github_top(repo, focus, url, stars, language, score)`;

type ItemRow = Record<string, unknown> & { daily_top?: { rank: number }[] | null };

/** A digest_items row (ITEM_COLUMNS) as the cards' DigestItem. */
function toDigestItem(row: ItemRow): DigestItem {
  const dailyRank = row.daily_top?.[0]?.rank;
  return {
    id: row.id as string,
    category: row.category as DigestItem["category"],
    mustRead: row.must_read as boolean,
    score: row.score as number,
    readMinutes: row.read_minutes as number,
    publishedAt: row.published_at as string,
    publishedLabel: publishedLabel(row.published_at as string),
    addedAt: row.created_at as string,
    source: row.source as string,
    url: row.url as string,
    tags: row.tags as DigestItem["tags"],
    title: row.title as Localized,
    summary: row.summary as Localized,
    why: row.why as Localized,
    ...(dailyRank ? { dailyRank } : {}),
  };
}

/**
 * The latest issue, or the one `issueId` names ('2026-W38'), with its items and repos embedded: one
 * query. Null only when `issueId` names a week that has no issue. A failed query throws rather than
 * answering an empty week, so no cache ever keeps a failure (spec 1.3, 1.5).
 */
export async function getRadar(db: SupabaseClient, issueId?: string): Promise<RadarData | null> {
  // The Top 3 come first (must_read), then the score; the repos keep their rank.
  const issues = db
    .from("issues")
    .select(RADAR_COLUMNS)
    .order("must_read", { ascending: false, referencedTable: "digest_items" })
    .order("score", { ascending: false, referencedTable: "digest_items" })
    .order("rank", { referencedTable: "github_top" });
  const query = issueId ? issues.eq("id", issueId) : issues.order("id", { ascending: false }).limit(1);
  const { data: latest, error } = await query.maybeSingle();
  if (error) throw queryFailed("radar", error);
  if (issueId && !latest) return null;

  const weekId = latest?.id ?? isoWeek(new Date()).id;
  const issue: CurrentIssue = {
    id: weekId,
    label: weekId.replace("-", " / "),
    updated: latest ? budapest.format(new Date(latest.updated_at)) : "—",
    archiveAt: archiveLabel(isoWeekMonday(weekId) ?? isoWeek(new Date()).monday),
  };
  if (!latest) return { issue, items: [], githubTop10: [] };

  return {
    issue,
    items: latest.digest_items.map((row) => toDigestItem(row as ItemRow)),
    githubTop10: latest.github_top.map(({ repo, focus, url, stars, language, score }) => ({ repo, focus, url, stars, language, score })),
  };
}

export type DailyData = { issue: CurrentIssue; today: boolean; items: DigestItem[]; briefs: Record<string, DailyBrief>; posts: Record<string, number> };

/**
 * The latest day's Top 10 (daily news spec N7) with each card's long text (N8) and its Library post. A failed
 * list query throws, like getRadar; a failed post lookup only costs the briefs.
 */
export async function getDaily(db: SupabaseClient, now = new Date()): Promise<DailyData> {
  const { data, error } = await db
    .from("daily_top")
    .select(`day, rank, digest_items(issue_id, ${ITEM_COLUMNS})`)
    .order("day", { ascending: false })
    .order("rank")
    .limit(DAILY_SIZE);
  if (error) throw queryFailed("daily", error);
  const rows = (data ?? []) as unknown as { day: string; rank: number; digest_items: ItemRow | null }[];
  // The latest day, and only its rows: the limit can reach past a short day into the one before.
  const day = rows.reduce<string | null>((latest, row) => (latest === null || row.day > latest ? row.day : latest), null);
  const own = rows.filter((row) => row.day === day && row.digest_items).sort((a, b) => a.rank - b.rank);
  const items = own.map((row) => toDigestItem(row.digest_items!));
  const issue: CurrentIssue = {
    id: (own[0]?.digest_items?.issue_id as string | undefined) ?? isoWeek(now).id,
    label: day ? `${day.replaceAll("-", ". ")}.` : "—",
    updated: "",
    archiveAt: "",
  };
  const sources = await itemSources(db, items, "url, status, posts(id, brief, summary, key_points, overrides)");
  const briefs: Record<string, DailyBrief> = {};
  const posts: Record<string, number> = {};
  for (const [id, source] of sources ?? []) {
    const post = source.posts as { id: number; brief: unknown; summary: Localized; key_points: Record<Language, string[]>; overrides: unknown } | null;
    if (post) {
      posts[id] = post.id;
      const brief = readBrief(post.brief);
      briefs[id] = brief
        ? { kind: "brief", paragraphs: brief }
        : { kind: "post", summary: readOverrides(post.overrides).summary ?? post.summary, keyPoints: post.key_points };
    } else if (source.status === "pending") {
      briefs[id] = { kind: "pending" };
    }
  }
  return { issue, today: day === budapestDay(now), items, briefs, posts };
}

/** Every issue but the current week's, newest first. Throws on a failed query, like getRadar. */
async function getArchive(db: SupabaseClient): Promise<ArchiveIssue[]> {
  const current = isoWeek(new Date()).id;
  const { data, error } = await db
    .from("archive_issues")
    .select("id, period, item_count, read_minutes, top_title")
    .neq("id", current)
    .order("id", { ascending: false });
  if (error) throw queryFailed("archive", error);

  return data.map((row) => ({
    id: row.id,
    period: row.period,
    week: row.id.slice(5), // '2026-W38' → 'W38'
    top: (row.top_title as Localized | null) ?? { hu: "—", en: "—" },
    itemCount: row.item_count,
    readMinutes: row.read_minutes,
  }));
}

// The two caches (spec 1.5; the rules are in ARCHITECTURE.md → Invariants, the mechanics in CLAUDE.md →
// Server path). A cached function may not
// read cookies, so both read with the admin client: only the content tables and the archive_issues view,
// which every member may read through RLS anyway. They hold content only, never the viewer, and are
// reachable only through archivedWeek and archiveList, which take a signed-in Reader.
// ⚠️ Next's data cache outlives a deploy (unstable_cache.md): bump the key's version whenever RadarData
// or ArchiveIssue changes shape, or a deploy serves the old shape for up to a day. v2: items gained addedAt.
// v3: githubTop10 rows became objects with stars, language and score.
const ONE_DAY = 86_400;
/** The daily cron's revalidateTag drops the archive list with this tag. */
export const ARCHIVE_TAG = "archive";

// A closed week never changes, so it needs no tag: a day later Next refills it in the background.
const closedWeek = unstable_cache((week: string) => getRadar(createAdminClient(), week), ["closed-week", "v4"], { revalidate: ONE_DAY });
const cachedArchive = unstable_cache(() => getArchive(createAdminClient()), ["archive-list", "v1"], { revalidate: ONE_DAY, tags: [ARCHIVE_TAG] });

/** The type keeps a signed-out caller away from the caches; this keeps one whose types were cast. */
function assertSignedIn(reader: Reader | null) {
  if (!reader?.viewer.id) throw new Error("the content caches need a signed-in reader");
}

/**
 * `week`'s Radar (an id isoWeekMonday accepted). A closed week, `week < isoWeek(now).id`, comes from the
 * one-day cache: zero-padded ids sort as strings, across a year boundary too. The current week and a
 * future one are read live, as the reader. Null when the week has no issue.
 */
export async function archivedWeek(reader: Reader, week: string, now = new Date()): Promise<RadarData | null> {
  if (!isoWeekMonday(week)) return null;
  assertSignedIn(reader);
  return week < isoWeek(now).id ? closedWeek(week) : getRadar(reader.db, week);
}

/** The /archive list, from its cache until the daily cron drops it. */
export async function archiveList(reader: Reader): Promise<ArchiveIssue[]> {
  assertSignedIn(reader);
  return cachedArchive();
}

const LIST_COLUMNS = "id, source_id, kind, url, author, source_site, published_at, title, summary, key_points, tags, meta, overrides, hidden_blocks, extracted_at, created_at";
const POST_COLUMNS = `${LIST_COLUMNS}, blocks, blocks_hu, sources(submitted_by, error, claimed_at)`;

export async function getPosts(db: SupabaseClient): Promise<Post[]> {
  const { data, error } = await db.from("posts").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(100);
  if (error) throw queryFailed("posts", error);
  return (data ?? []).map(toPost);
}

/**
 * The caller's flags on week `issueId`'s items, and every to-do (RLS: own rows only): GET /api/state and
 * the Radar pages' seed. The flags narrow to the week by the item id's fixed form (weekItemPattern); the
 * to-dos stay whole, because the panel lists them all. Null when a query fails or the id is malformed.
 */
export async function getReaderState(db: SupabaseClient, issueId: string): Promise<ReaderData | null> {
  const pattern = weekItemPattern(issueId);
  if (!pattern) return null;
  const [stateResult, todoResult] = await Promise.all([
    db.from("item_states").select("item_id, is_read, is_saved").like("item_id", pattern),
    db.from("todos").select("id, item_id, text, is_done").order("is_done").order("created_at", { ascending: false }),
  ]);
  if (stateResult.error || todoResult.error) {
    console.error("reader state query failed", stateResult.error ?? todoResult.error);
    return null;
  }
  return {
    states: Object.fromEntries(stateResult.data.map((row) => [row.item_id, { read: row.is_read, saved: row.is_saved }])),
    todos: todoResult.data.map((row) => ({ id: row.id, itemId: row.item_id, text: row.text, done: row.is_done })),
  };
}

/** A Radar page's seed: the reader's state for `issueId`, stamped with this render (spec 1.4, seedNeedsLoad). */
export async function getReaderSeed(db: SupabaseClient, issueId: string): Promise<ReaderSeed> {
  return { issueId, seededAt: Date.now(), data: await getReaderState(db, issueId) };
}

/** The reader's opened posts (item_states `post:<id>`, RLS: own rows only); the Library list dims them. A
 *  failure only costs the dimming, so it logs and answers none instead of failing the page (R2 spec 2). */
export async function getReadPostIds(db: SupabaseClient): Promise<Set<number>> {
  const { data, error } = await db.from("item_states").select("item_id").like("item_id", `${POST_STATE_PREFIX}%`).eq("is_read", true);
  if (error) console.error("read posts query failed", error);
  return readPostIds((data ?? []).map((row) => row.item_id as string));
}

/** The reader's own ratings on `targets`, by ratingKey (RLS: own rows only). Like getReadPostIds, a failure
 *  only costs showing them, so it logs and answers none (G1 spec 3). */
export async function getRatings(db: SupabaseClient, targets: RatingTarget[]): Promise<Ratings> {
  const wanted = new Set(targets.map(ratingKey));
  const answers = await inChunks([...new Set(targets.map(ratingTargetId))], (ids) => db.from("ratings").select("target_kind, target_id, value").in("target_id", ids));
  const failed = answers.find((answer) => answer.error);
  if (failed) {
    console.error("ratings query failed", failed.error);
    return {};
  }
  const ratings: Ratings = {};
  for (const row of answers.flatMap((answer) => answer.data ?? [])) {
    const key = ratingKey({ kind: row.target_kind as RatingKind, id: row.target_id as string });
    if (wanted.has(key)) ratings[key] = row.value as RatingValue;
  }
  return ratings;
}

export const GITHUB_PAGE = 30;
/** The GitHub tab's `?page=`: 1 to 20, anything else 1 (20 pages of 30 is every repo a year of weeks can hold). */
export function githubPage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? Math.min(page, 20) : 1;
}

export type GithubRepo = {
  key: string;
  repo: string;
  focus: string;
  url: string;
  stars: number | null;
  language: string | null;
  score: number | null;
  firstWeek: string;
  lastWeek: string;
  weekCount: number;
  bestRank: number;
  rating: RatingValue | null;
};

const REPO_COLUMNS = "repo_key, repo, focus, url, stars, language, score, first_week, last_week, week_count, best_rank, rating";

/** The archive's GitHub tab (G1 spec 4): one row per repo from the github_repos view, with the reader's own
 *  rating; the 👎 ones last, then the latest week first; `page` pages of GITHUB_PAGE, one more row read to
 *  tell whether there is more. Throws on a failed query, like getPosts. */
export async function getGithubRepos(
  db: SupabaseClient,
  { rating, language, page }: { rating?: RatingFilter; language?: string; page: number },
): Promise<{ repos: GithubRepo[]; more: boolean; languages: string[] }> {
  let query = db.from("github_repos").select(REPO_COLUMNS);
  if (rating) query = RATING_FILTERS[rating] === null ? query.is("rating", null) : query.eq("rating", RATING_FILTERS[rating]);
  if (language) query = query.eq("language", language);
  const shown = page * GITHUB_PAGE;
  const [listed, languages] = await Promise.all([
    query.order("disliked").order("last_week", { ascending: false }).order("best_rank").limit(shown + 1),
    db.from("github_repos").select("language"),
  ]);
  if (listed.error) throw queryFailed("github repos", listed.error);
  if (languages.error) throw queryFailed("github languages", languages.error);
  return {
    repos: listed.data.slice(0, shown).map((row) => ({
      key: row.repo_key,
      repo: row.repo,
      focus: row.focus,
      url: row.url,
      stars: row.stars,
      language: row.language,
      score: row.score,
      firstWeek: row.first_week,
      lastWeek: row.last_week,
      weekCount: row.week_count,
      bestRank: row.best_rank,
      rating: row.rating as RatingValue | null,
    })),
    more: listed.data.length > shown,
    languages: [...new Set(languages.data.flatMap((row) => (row.language ? [row.language as string] : [])))].sort(),
  };
}

export type Favorite = { kind: RatingKind; id: string; title: Localized | string; href: string; external: boolean; detail: string | null };

type Row = Record<string, unknown>;
type Lookup = { data: Row[] | null; error: { message: string } | null };
/** A lookup by id in chunks (inChunks), as one answer: the first failure, or every row; no query for no ids. */
async function lookUp<T>(ids: T[], run: (chunk: T[]) => PromiseLike<Lookup>): Promise<Lookup> {
  const answers = await inChunks(ids, run);
  return answers.find((answer) => answer.error) ?? { data: answers.flatMap((answer) => answer.data ?? []), error: null };
}

/** The reader's ❤ items, posts and repos, the latest first (G1 spec 5). A ❤ whose target is gone (a deleted
 *  post) is left out, except a repo: one that fell out of its week's final Top 10 (the daily run rewrites the
 *  week's rows by rank) has no github_repos row, so it is kept from its own id. Throws on a failed query:
 *  this list is the page's content. */
export async function getFavorites(db: SupabaseClient): Promise<Favorite[]> {
  const { data: hearts, error } = await db.from("ratings").select("target_kind, target_id, updated_at").eq("value", 2).order("updated_at", { ascending: false });
  if (error) throw queryFailed("favorites", error);
  const idsOf = (kind: RatingKind) => hearts.filter((row) => row.target_kind === kind).map((row) => row.target_id as string);
  const itemIds = idsOf("item");
  const postIds = idsOf("post").map(Number).filter(Number.isInteger);
  const repoIds = idsOf("repo");
  const [items, posts, repos] = await Promise.all([
    lookUp(itemIds, (chunk) => db.from("digest_items").select("id, issue_id, title, url, source").in("id", chunk)),
    lookUp(postIds, (chunk) => db.from("posts").select("id, title, overrides").in("id", chunk)),
    lookUp(repoIds, (chunk) => db.from("github_repos").select("repo_key, repo, url, last_week").in("repo_key", chunk)),
  ]);
  for (const result of [items, posts, repos]) if (result.error) throw queryFailed("favorites", result.error);
  const found = new Map<string, Favorite>();
  for (const row of items.data ?? []) {
    const detail = `${row.source} · ${String(row.issue_id).slice(5)}`;
    found.set(`item:${row.id}`, { kind: "item", id: row.id as string, title: row.title as Localized, href: row.url as string, external: true, detail });
  }
  for (const row of posts.data ?? []) {
    const title = shownTitle(row.title, readOverrides(row.overrides));
    found.set(`post:${row.id}`, { kind: "post", id: String(row.id), title, href: `/library/${row.id}`, external: false, detail: null });
  }
  for (const id of repoIds) {
    const url = URL.parse(`https://github.com/${id}`);
    const repo = url && githubRepo(url);
    if (repo) found.set(`repo:${id}`, { kind: "repo", id, title: id, href: `https://github.com/${repo.owner}/${repo.repo}`, external: true, detail: null });
  }
  for (const row of repos.data ?? []) {
    const detail = String(row.last_week).slice(5);
    found.set(`repo:${row.repo_key}`, { kind: "repo", id: row.repo_key as string, title: row.repo as string, href: row.url as string, external: true, detail });
  }
  return hearts.flatMap((row) => found.get(`${row.target_kind}:${row.target_id}`) ?? []);
}

export async function getPost(db: SupabaseClient, id: number): Promise<Post | null> {
  const { data, error } = await db.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw queryFailed("post", error);
  return data ? toPost(data) : null;
}

export type SubmittedSource = { id: number; url: string; kind: string; status: string; error: string | null; createdAt: string };

export async function getOpenSources(db: SupabaseClient): Promise<SubmittedSource[]> {
  const { data, error } = await db
    .from("sources")
    .select("id, url, kind, status, error, created_at")
    .neq("status", "done")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw queryFailed("open sources", error);
  return (data ?? []).map((row) => ({ ...row, createdAt: row.created_at }));
}
