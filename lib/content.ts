import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type {
  ArchiveIssue,
  CurrentIssue,
  DigestItem,
  GithubTopEntry,
  Localized,
} from "@/data/digest-types";
import { toPost } from "@/lib/post-row";
import type { Post } from "@/lib/post-view";
import { archiveLabel, isoWeek, isoWeekMonday, publishedLabel, weekItemPattern } from "@/lib/pipeline/util";
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

const RADAR_COLUMNS =
  "id, updated_at, digest_items(id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why), github_top(repo, focus, url)";

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
  if (error) throw new Error(`radar query failed: ${error.message}`, { cause: error });
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
    items: latest.digest_items.map((row) => ({
      id: row.id,
      category: row.category,
      mustRead: row.must_read,
      score: row.score,
      readMinutes: row.read_minutes,
      publishedAt: row.published_at,
      publishedLabel: publishedLabel(row.published_at),
      source: row.source,
      url: row.url,
      tags: row.tags,
      title: row.title as Localized,
      summary: row.summary as Localized,
      why: row.why as Localized,
    })),
    githubTop10: latest.github_top.map((row) => [row.repo, row.focus, row.url] as const),
  };
}

/** Every issue but the current week's, newest first. Throws on a failed query, like getRadar. */
async function getArchive(db: SupabaseClient): Promise<ArchiveIssue[]> {
  const current = isoWeek(new Date()).id;
  const { data, error } = await db
    .from("archive_issues")
    .select("id, period, item_count, read_minutes, top_title")
    .neq("id", current)
    .order("id", { ascending: false });
  if (error) throw new Error(`archive query failed: ${error.message}`, { cause: error });

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
// ⚠️ Next's data cache outlives a deploy (unstable_cache.md): bump "v1" whenever RadarData or
// ArchiveIssue changes shape, or a deploy serves the old shape for up to a day.
const ONE_DAY = 86_400;
/** The daily cron's revalidateTag drops the archive list with this tag. */
export const ARCHIVE_TAG = "archive";

// A closed week never changes, so it needs no tag: a day later Next refills it in the background.
const closedWeek = unstable_cache((week: string) => getRadar(createAdminClient(), week), ["closed-week", "v1"], { revalidate: ONE_DAY });
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
const POST_COLUMNS = `${LIST_COLUMNS}, blocks, blocks_hu, sources(submitted_by, error)`;

export async function getPosts(db: SupabaseClient): Promise<Post[]> {
  const { data } = await db.from("posts").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(100);
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

/** The reader's opened posts (item_states `post:<id>`, RLS: own rows only); the Library list dims them. */
export async function getReadPostIds(db: SupabaseClient): Promise<Set<number>> {
  const { data } = await db.from("item_states").select("item_id").like("item_id", `${POST_STATE_PREFIX}%`).eq("is_read", true);
  return readPostIds((data ?? []).map((row) => row.item_id as string));
}

export async function getPost(db: SupabaseClient, id: number): Promise<Post | null> {
  const { data } = await db.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  return data ? toPost(data) : null;
}

export type SubmittedSource = { id: number; url: string; kind: string; status: string; error: string | null; createdAt: string };

export async function getOpenSources(db: SupabaseClient): Promise<SubmittedSource[]> {
  const { data } = await db
    .from("sources")
    .select("id, url, kind, status, error, created_at")
    .neq("status", "done")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((row) => ({ ...row, createdAt: row.created_at }));
}
