import { after, NextResponse } from "next/server";
import { jsonError, POST_ERRORS, postRoute, type ErrorAnswer } from "@/lib/api";
import { processSource } from "@/lib/pipeline/ingest";
import { requestReextract, type ReextractResult } from "@/lib/post-edit";
import { createAdminClient, getReader } from "@/lib/supabase/server";

export const maxDuration = 300;

// "accepted"/"cooldown" carry their own payload and are handled directly below; every other
// status is exhaustively mapped here, same pattern as the translate route.
const REEXTRACT_STATUS: Record<Exclude<ReextractResult["status"], "accepted" | "cooldown">, ErrorAnswer> = POST_ERRORS;

export const POST = postRoute(getReader, async (_request, { reader, postId }) => {
  const admin = createAdminClient();
  const result = await requestReextract(admin, reader.viewer.id, postId, new Date());
  if (result.status === "accepted") {
    after(() => processSource(admin, result.sourceId));
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  if (result.status === "cooldown") return jsonError(429, "cooldown", { retryAfter: result.retryAfter });
  const { status, error } = REEXTRACT_STATUS[result.status];
  return jsonError(status, error);
});
