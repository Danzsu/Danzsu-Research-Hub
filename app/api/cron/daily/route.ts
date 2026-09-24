import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
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
  const retried = await retryPendingSources(db, start + maxDuration * 1000);
  if (!digest) return jsonError(500, "daily_failed", { retriedSources: retried });
  return NextResponse.json({ ...digest, retriedSources: retried });
}
