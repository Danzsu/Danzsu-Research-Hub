import type { SupabaseClient } from "@supabase/supabase-js";
import { detectSource, parseSubmittedUrl, type SourceKind } from "./util.ts";

/** A Radar item scoring at least this goes into the Library by itself, with the week's Top 3 (spec 2). */
export const MIRROR_MIN_SCORE = 85;

/**
 * The automatic Library mirror (spec 2): queues the week's best items, every one scoring at least
 * MIRROR_MIN_SCORE, the Top 3 and every day's Top 10 (daily news spec N5), as `pending` sources under the system account. A URL already in
 * `sources` (a member's own submission, or an earlier day's mirror) is left as it is. The daily cron
 * calls it after runDaily; retryPendingSources works the queue there and in the mirror crons.
 * Answers how many sources it newly queued; 0, with one warning, without the account.
 */
export async function queueMirrors(db: SupabaseClient, issueId: string, systemUserId = process.env.RADAR_MIRROR_USER_ID): Promise<number> {
  if (!systemUserId) {
    console.warn("RADAR_MIRROR_USER_ID is not set, so the Library mirror queued nothing");
    return 0;
  }
  const { data, error } = await db.from("digest_items").select("url, score, must_read, daily_top(rank)").eq("issue_id", issueId);
  if (error) throw error;
  // The same normalizing a member's submission gets, so the card's lookup and a later paste find this row.
  // Keyed by URL: two items can normalize to one, and one upsert may not carry the same key twice.
  const rows = new Map<string, { url: string; kind: SourceKind; submitted_by: string }>();
  for (const item of data ?? []) {
    const inDailyTop = Array.isArray(item.daily_top) && item.daily_top.length > 0;
    if (item.score < MIRROR_MIN_SCORE && !item.must_read && !inDailyTop) continue;
    const url = parseSubmittedUrl(item.url as string);
    if (url) rows.set(url.toString(), { url: url.toString(), kind: detectSource(url), submitted_by: systemUserId });
  }
  if (!rows.size) return 0;
  const { data: queued, error: queueError } = await db.from("sources").upsert([...rows.values()], { onConflict: "url", ignoreDuplicates: true }).select("id");
  if (queueError) throw queueError;
  return queued?.length ?? 0;
}
