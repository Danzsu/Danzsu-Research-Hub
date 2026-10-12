import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest, jsonError } from "@/lib/api";
import { retryPendingSources } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Three extra daily runs (vercel.json: 14, 15 and 16 UTC, after the daily run's; Hobby fires each within its hour,
// so one can overlap the daily run's own queue work, and processSource's claim keeps one run per source) that
// only work the queue: the Library mirror's pending sources, and any submission a killed run left
// behind, each run with its own 300 s (spec 3).
export async function GET(request: NextRequest) {
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");
  const processed = await retryPendingSources(createAdminClient(), start + maxDuration * 1000);
  return NextResponse.json({ processed });
}
