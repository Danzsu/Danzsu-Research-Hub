import { after, NextResponse } from "next/server";
import { jsonError, POST_ERRORS, postRoute, type ErrorAnswer } from "@/lib/api";
import { retrySource, type RetryResult } from "@/lib/my-sources";
import { processSource } from "@/lib/pipeline/ingest";
import { createAdminClient, getReader } from "@/lib/supabase/server";

export const maxDuration = 300;

// Exhaustive by construction, like the posts/[id] routes: a RetryResult with no entry is a tsc error.
const RETRY_STATUS: Record<Exclude<RetryResult, "accepted">, ErrorAnswer> = {
  ...POST_ERRORS,
  not_failed: { status: 409, error: "not_failed" },
};

export const POST = postRoute(getReader, async (_request, { reader, postId: sourceId }) => {
  const result = await retrySource(reader.db, createAdminClient(), reader.viewer.id, sourceId);
  if (result !== "accepted") {
    const { status, error } = RETRY_STATUS[result];
    return jsonError(status, error);
  }
  // Like POST /api/sources: answer now, process after the response.
  after(() => processSource(createAdminClient(), sourceId));
  return NextResponse.json({ ok: true }, { status: 202 });
});
