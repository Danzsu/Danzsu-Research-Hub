import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest, jsonError } from "@/lib/api";
import { RADAR_TAG } from "@/lib/content";
import { writeBriefs } from "@/lib/pipeline/briefs";
import { retryPendingSources, START_GATE_RESERVE_MS } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Three extra daily runs (vercel.json: 14, 15 and 16 UTC, after the daily run's; Hobby fires each within its hour,
// so one can overlap the daily run's own queue work, and processSource's claim keeps one run per source) that
// only work the queue: the Library mirror's pending sources, and any submission a killed run left
// behind, each run with its own 300 s (spec 3), then write the Top 10's briefs that are still missing.
export async function GET(request: NextRequest) {
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");
  // A backstop for the daily run's own revalidation, which a run killed at its time limit never applies.
  revalidateTag(RADAR_TAG, { expire: 0 });
  const db = createAdminClient();
  const deadline = start + maxDuration * 1000;
  const processed = await retryPendingSources(db, deadline);
  // The Top 10's briefs, in one call, once the queue's posts exist; skipped when the queue used the time up.
  const briefs = deadline - Date.now() >= START_GATE_RESERVE_MS ? await writeBriefs(db) : 0;
  return NextResponse.json({ processed, briefs });
}
