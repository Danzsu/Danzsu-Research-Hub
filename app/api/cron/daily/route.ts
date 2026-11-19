import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest, jsonError } from "@/lib/api";
import { ARCHIVE_TAG, RADAR_TAG } from "@/lib/content";
import { writeBriefs } from "@/lib/pipeline/briefs";
import { hasDailyTop, runDaily } from "@/lib/pipeline/daily";
import { retryPendingSources, START_GATE_RESERVE_MS } from "@/lib/pipeline/ingest";
import { queueMirrors } from "@/lib/pipeline/mirror";
import { isoWeek } from "@/lib/pipeline/util";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The same header
// triggers a manual run: curl -H "Authorization: Bearer $CRON_SECRET" <site>/api/cron/daily
// `?retry=1` is the afternoon and evening retry rounds (vercel.json, 17 and 21 UTC; a stopgap until the staged
// pipeline, P1 spec): they run only while today's Top 10 is still missing, so a provider outage at 13 UTC
// no longer leaves the day empty.
export async function GET(request: NextRequest) {
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");

  const db = createAdminClient();
  if (new URL(request.url).searchParams.get("retry") === "1" && (await hasDailyTop(db))) {
    return NextResponse.json({ skipped: "already_ran" });
  }
  // A failed digest (model outage, bad key) must not also stall the pending link submissions.
  const digest = await runDaily(db).catch((error: unknown) => {
    console.error("daily digest failed", error);
    return null;
  });
  // After the digest, so today's items and Top 3 count (spec 2); after a failed one too, so the week's
  // earlier best still get queued. A failure here is logged, never the day's answer.
  const mirrored = await queueMirrors(db, isoWeek(new Date()).id).catch((error: unknown) => {
    console.error("library mirror queue failed", error);
    return 0;
  });
  // A week closes at Monday 00:00 UTC, and the upsert can't say whether this run opened a new one, so
  // every run drops the archive list (spec 1.5). Next only applies a queued revalidateTag once this
  // handler returns a Response — a crash below (retryPendingSources throwing) or the function hitting
  // its own time limit skips it — so this call is best-effort; the list's own one-day revalidate is the
  // real backstop. { expire: 0 }: when it does run, the next /archive refills the list at once instead
  // of serving one more stale day.
  revalidateTag(ARCHIVE_TAG, { expire: 0 });
  // The current week too: this run wrote its new items, the Top 3 and the repos.
  revalidateTag(RADAR_TAG, { expire: 0 });
  const deadline = start + maxDuration * 1000;
  const retried = await retryPendingSources(db, deadline);
  if (!digest) return jsonError(500, "daily_failed", { retriedSources: retried, mirrored });
  // A retry round has no mirror round after it: the posts it just made get their briefs here.
  const briefs = deadline - Date.now() >= START_GATE_RESERVE_MS ? await writeBriefs(db) : 0;
  return NextResponse.json({ ...digest, mirrored, retriedSources: retried, briefs });
}
