import type { SupabaseClient } from "@supabase/supabase-js";
import type { Localized } from "../data/digest-types.ts";
import { readOverrides } from "./overrides.ts";
import { MINE_LIMIT, parseSubmittedUrl, type SourceKind } from "./pipeline/util.ts";
import { shownTitle } from "./post-view.ts";

// The reader's own submissions, for the taiyaki link chat: GET /api/sources/mine lists them, and
// POST /api/sources/[id]/retry sends a failed one through the pipeline again. Both routes stay thin.

/** One of the reader's own submissions, as GET /api/sources/mine answers it (newest first). */
export type MySource = {
  id: number;
  url: string;
  kind: SourceKind;
  status: "pending" | "done" | "failed";
  error: string | null;
  note: string | null;
  createdAt: string;
  /** Its post, titled as readers see it; null until there is one. */
  post: { id: number; title: Localized } | null;
};

/** A source's embedded `posts(...)` join, cast from PostgREST's untyped shape — shared by every
 *  caller that reads one, since `posts.source_id` is unique and `select` always embeds it as one
 *  object, or null. `title`/`overrides` are only ever present when the caller's own select asked
 *  for them (`duplicateSource` doesn't); reading either off a value that lacks them answers
 *  `undefined`, same as a column the fixture never set. */
type EmbeddedPost = { id: number; title?: unknown; overrides?: unknown };
const embeddedPost = (value: unknown): EmbeddedPost | null => (value as EmbeddedPost | null | undefined) ?? null;

/**
 * The viewer's latest MINE_LIMIT submissions, newest first, each with its post. The `submitted_by`
 * filter is ours, not RLS's: every reader may select every source. Null when the query fails.
 */
export async function listMySources(db: SupabaseClient, viewerId: string): Promise<MySource[] | null> {
  const { data, error } = await db
    .from("sources")
    .select("id, url, kind, status, error, note, created_at, posts(id, title, overrides)")
    .eq("submitted_by", viewerId)
    .order("created_at", { ascending: false })
    .limit(MINE_LIMIT);
  if (error) {
    console.error("own sources query failed", error);
    return null;
  }
  return (data ?? []).map((row) => {
    const post = embeddedPost(row.posts);
    return {
      id: row.id,
      url: row.url,
      kind: row.kind,
      status: row.status,
      error: row.error,
      note: row.note,
      createdAt: row.created_at,
      post: post ? { id: post.id, title: shownTitle(post.title, readOverrides(post.overrides)) } : null,
    };
  });
}

/** The source a duplicate submission ran into (`sources.url` is unique), with its post once there is one. */
export type DuplicateSource = { id: number; status: string; attempts: number; postId?: number };

/**
 * The source already holding `url`, once a duplicate submission's insert fails on `sources.url`'s
 * unique constraint (`POST /api/sources`): the reader's "already in" answer points at its post (the
 * link chat's "MEGNYITÁS →"), and a pending one with no post yet gets started (read-here spec 3).
 * `undefined` when there is no row or the lookup itself fails; a failure is logged, never thrown, so
 * the 409 the caller already decided on still goes out, just plain.
 */
export async function duplicateSource(db: SupabaseClient, url: string): Promise<DuplicateSource | undefined> {
  const { data, error } = await db.from("sources").select("id, status, attempts, posts(id)").eq("url", url).maybeSingle();
  if (error) {
    console.warn("duplicate source lookup failed", error);
    return undefined;
  }
  if (!data) return undefined;
  const postId = embeddedPost(data.posts)?.id;
  return { id: data.id as number, status: data.status as string, attempts: (data.attempts as number | undefined) ?? 0, ...(postId === undefined ? {} : { postId }) };
}

export type RetryResult = "accepted" | "forbidden" | "not_found" | "not_failed" | "failed";

/**
 * "Újra" on the viewer's own failed submission. Read as the reader, then claimed with the admin
 * client (readers can't update `sources`) in one compare-and-swap that repeats both checks: only a
 * row that is still the viewer's and still `failed` goes back to `pending`. Of two overlapping
 * clicks only one can win; the other's update matches 0 rows and answers "not_failed".
 * The claim also resets `attempts`: a retry run killed at 300 s would otherwise stay `pending` at
 * 3+ attempts, which `retryPendingSources` never picks up.
 */
export async function retrySource(db: SupabaseClient, admin: SupabaseClient, viewerId: string, sourceId: number): Promise<RetryResult> {
  const { data: source, error } = await db.from("sources").select("submitted_by, status").eq("id", sourceId).maybeSingle();
  if (error) {
    console.error(`retry ${sourceId}: read failed`, error);
    return "failed";
  }
  if (!source) return "not_found";
  if (source.submitted_by !== viewerId) return "forbidden";
  if (source.status !== "failed") return "not_failed";

  // The status CAS below stops two overlapping clicks. A click during a cron's own run of this same
  // failed source is stopped by processSource's claim: the run holds `claimed_at`, so the retry's own
  // processSource finds the lease fresh and leaves it (read-here spec 3). The attempts reset still gives
  // the retry a fresh 3-attempt cron budget.
  const { data: claimed, error: claimError } = await admin
    .from("sources")
    .update({ status: "pending", error: null, attempts: 0 })
    .eq("id", sourceId)
    .eq("submitted_by", viewerId)
    .eq("status", "failed")
    .select("id");
  if (claimError) {
    console.error(`retry ${sourceId}: claim failed`, claimError);
    return "failed";
  }
  return claimed?.length ? "accepted" : "not_failed";
}

/** URLs per `.in(...)` lookup: a week's hundred or so stay far under PostgREST's URL-length limit. */
const LOOKUP_CHUNK = 30;

/**
 * Item id → the Library post already made from its URL: a card's "Olvasd itt" opens it (read-here
 * spec 1). The URLs go through parseSubmittedUrl, as a submission's and the mirror's do, so both sides
 * compare the same string. A failed lookup answers {} and is logged: the card then offers the chat,
 * whose 409 still points at the post. Never cached: a post can appear any day, for an open week or a
 * closed one.
 */
export async function readHerePosts(db: SupabaseClient, items: { id: string; url: string }[]): Promise<Record<string, number>> {
  const idsByUrl = new Map<string, string[]>();
  for (const item of items) {
    const url = parseSubmittedUrl(item.url)?.toString();
    if (url) idsByUrl.set(url, [...(idsByUrl.get(url) ?? []), item.id]);
  }
  const urls = [...idsByUrl.keys()];
  const chunks = Array.from({ length: Math.ceil(urls.length / LOOKUP_CHUNK) }, (_, index) => urls.slice(index * LOOKUP_CHUNK, (index + 1) * LOOKUP_CHUNK));
  const answers = await Promise.all(chunks.map((chunk) => db.from("sources").select("url, posts(id)").in("url", chunk)));
  const posts: Record<string, number> = {};
  for (const { data, error } of answers) {
    if (error) {
      console.warn("read-here post lookup failed", error);
      return {};
    }
    for (const row of data ?? []) {
      const post = embeddedPost(row.posts);
      if (post) for (const id of idsByUrl.get(row.url as string) ?? []) posts[id] = post.id;
    }
  }
  return posts;
}
