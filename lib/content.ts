import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArchiveIssue,
  CurrentIssue,
  DigestItem,
  GithubTopEntry,
  Language,
  Localized,
} from "@/data/digest-types";
import { toPost, type Post } from "@/lib/post-view";
import { archiveLabel, isoWeek, isoWeekMonday, publishedLabel } from "@/lib/pipeline/util";

const budapest = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type RadarData = { issue: CurrentIssue; items: DigestItem[]; githubTop10: GithubTopEntry[] };

/**
 * The latest issue, or the archived week named by `issueId` ('2026-W38').
 * Null only when `issueId` names a week that has no issue.
 */
export async function getRadar(db: SupabaseClient, issueId?: string): Promise<RadarData | null> {
  const issues = db.from("issues").select("id, updated_at");
  const { data: latest } = issueId
    ? await issues.eq("id", issueId).maybeSingle()
    : await issues.order("id", { ascending: false }).limit(1).maybeSingle();
  if (issueId && !latest) return null;

  const weekId = latest?.id ?? isoWeek(new Date()).id;
  const issue: CurrentIssue = {
    label: weekId.replace("-", " / "),
    updated: latest ? budapest.format(new Date(latest.updated_at)) : "—",
    archiveAt: archiveLabel(isoWeekMonday(weekId) ?? isoWeek(new Date()).monday),
  };
  if (!latest) return { issue, items: [], githubTop10: [] };

  const [items, repos] = await Promise.all([
    db
      .from("digest_items")
      .select("id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why")
      .eq("issue_id", latest.id)
      .order("must_read", { ascending: false })
      .order("score", { ascending: false }),
    db.from("github_top").select("repo, focus, url").eq("issue_id", latest.id).order("rank"),
  ]);

  return {
    issue,
    items: (items.data ?? []).map((row) => ({
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
    githubTop10: (repos.data ?? []).map((row) => [row.repo, row.focus, row.url] as const),
  };
}

export async function getArchive(db: SupabaseClient, language: Language): Promise<ArchiveIssue[]> {
  const current = isoWeek(new Date()).id;
  const { data } = await db
    .from("archive_issues")
    .select("id, period, item_count, read_minutes, top_title")
    .neq("id", current)
    .order("id", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    period: row.period,
    week: row.id.slice(5), // '2026-W38' → 'W38'
    top: (row.top_title as Localized | null)?.[language] ?? "—",
    itemCount: row.item_count,
    readMinutes: row.read_minutes,
  }));
}

const LIST_COLUMNS = "id, source_id, kind, url, author, source_site, published_at, title, summary, key_points, tags, meta, overrides, hidden_blocks, extracted_at, created_at";
const POST_COLUMNS = `${LIST_COLUMNS}, blocks, blocks_hu, sources(submitted_by)`;

export async function getPosts(db: SupabaseClient): Promise<Post[]> {
  const { data } = await db.from("posts").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map(toPost);
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
