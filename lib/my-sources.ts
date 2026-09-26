import type { SupabaseClient } from "@supabase/supabase-js";
import type { Localized } from "../data/digest-types.ts";
import type { SourceKind } from "./pipeline/util.ts";
import { shownTitle } from "./post-view.ts";

// The reader's own submissions, for the taiyaki link chat: GET /api/sources/mine lists them, and
// POST /api/sources/[id]/retry sends a failed one through the pipeline again. Both routes stay thin.

/** The thread shows this many of the reader's latest submissions. */
export const MINE_LIMIT = 10;

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
 *  for them (`existingPostId` doesn't); reading either off a value that lacks them answers
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
      post: post ? { id: post.id, title: shownTitle(post) } : null,
    };
  });
}

/**
 * The post already made from `url`, once a duplicate submission's insert fails on `sources.url`'s
 * unique constraint (`POST /api/sources`) — so the reader's "already in" answer can point at it
 * (the link chat's "MEGNYITÁS →"). `undefined` both when there's no post yet and when the lookup
 * itself fails; a lookup failure is logged, never thrown, so the 409 the caller already decided on
 * still goes out, just without a postId.
 */
export async function existingPostId(db: SupabaseClient, url: string): Promise<number | undefined> {
  const { data, error } = await db.from("sources").select("posts(id)").eq("url", url).maybeSingle();
  if (error) {
    console.warn("duplicate source's post lookup failed", error);
    return undefined;
  }
  return embeddedPost(data?.posts)?.id;
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
  if (error) return "failed";
  if (!source) return "not_found";
  if (source.submitted_by !== viewerId) return "forbidden";
  if (source.status !== "failed") return "not_failed";

  // ponytail: no cooldown — the status CAS rules out overlapping runs, and each run is one click; add a wait here if it gets abused.
  const { data: claimed, error: claimError } = await admin
    .from("sources")
    .update({ status: "pending", error: null, attempts: 0 })
    .eq("id", sourceId)
    .eq("submitted_by", viewerId)
    .eq("status", "failed")
    .select("id");
  if (claimError) return "failed";
  return claimed?.length ? "accepted" : "not_failed";
}
