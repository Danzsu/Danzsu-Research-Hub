import { NextResponse, type NextRequest } from "next/server";
import { runDaily } from "@/lib/pipeline/daily";
import { retryPendingSources } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The same header
// triggers a manual run: curl -H "Authorization: Bearer $CRON_SECRET" <site>/api/cron/daily
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const digest = await runDaily(db);
  const retried = await retryPendingSources(db);
  return NextResponse.json({ ...digest, retriedSources: retried });
}
