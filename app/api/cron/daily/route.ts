import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { ARCHIVE_TAG } from "@/lib/content";
import { runDaily } from "@/lib/pipeline/daily";
import { retryPendingSources } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The same header
// triggers a manual run: curl -H "Authorization: Bearer $CRON_SECRET" <site>/api/cron/daily
export async function GET(request: NextRequest) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized");
  }

  const db = createAdminClient();
  // A failed digest (model outage, bad key) must not also stall the pending link submissions.
  const digest = await runDaily(db).catch((error: unknown) => {
    console.error("daily digest failed", error);
    return null;
  });
  // A week closes at Monday 00:00 UTC, and the upsert can't say whether this run opened a new one, so
  // every run drops the archive list (spec 1.5). Next only applies a queued revalidateTag once this
  // handler returns a Response — a crash below (retryPendingSources throwing) or the function hitting
  // its own time limit skips it — so this call is best-effort; the list's own one-day revalidate is the
  // real backstop. { expire: 0 }: when it does run, the next /archive refills the list at once instead
  // of serving one more stale day.
  revalidateTag(ARCHIVE_TAG, { expire: 0 });
  const retried = await retryPendingSources(db, start + maxDuration * 1000);
  if (!digest) return jsonError(500, "daily_failed", { retriedSources: retried });
  return NextResponse.json({ ...digest, retriedSources: retried });
}
