import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest, jsonError } from "@/lib/api";
import { retryPendingSources } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Three extra daily runs (vercel.json: 07, 08 and 09 UTC, after the daily run's 05:00–06:05 window) that
// only work the queue: the Library mirror's pending sources, and any submission a killed run left
// behind, each run with its own 300 s (spec 3).
export async function GET(request: NextRequest) {
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");
  const processed = await retryPendingSources(createAdminClient(), start + maxDuration * 1000);
  return NextResponse.json({ processed });
}
