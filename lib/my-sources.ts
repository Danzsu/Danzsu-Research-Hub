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
    // posts.source_id is unique, so PostgREST embeds the post as one object, or null.
    const post = row.posts as unknown as { id: number; title: unknown; overrides: unknown } | null;
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
