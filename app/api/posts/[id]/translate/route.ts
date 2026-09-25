import { NextResponse } from "next/server";
import { jsonError, postRoute, type ErrorAnswer } from "@/lib/api";
import { createAdminClient, getReader } from "@/lib/supabase/server";
import { translatePost, type TranslateResult } from "@/lib/translate";

export const maxDuration = 300;

// Exhaustive by construction: a `TranslateResult` variant with no entry here is a tsc error, not a
// silently-200 response — the way an if-chain that forgot a branch (e.g. dropping "stale" → 409)
// would fall through to the final `NextResponse.json({ ok: true })` unnoticed.
const RESULT_STATUS: Record<Exclude<TranslateResult, "ok">, ErrorAnswer> = {
  not_found: { status: 404, error: "not_found" },
  shape: { status: 502, error: "translation_shape" },
  stale: { status: 409, error: "translation_stale" },
  failed: { status: 502, error: "translation_failed" },
};

export const POST = postRoute(getReader, async (_request, { reader, postId }) => {
  const { data: post, error: selectError } = await reader.db.from("posts").select("id").eq("id", postId).maybeSingle();
  if (selectError) {
    console.warn(`translate ${postId}: reader select failed: ${selectError.message}`);
    return jsonError(502, "translation_failed");
  }
  if (!post) return jsonError(404, "not_found");

  // model_settings and the posts write need the secret key; existence was already checked as the reader (RLS).
  const result = await translatePost(createAdminClient(), post.id);
  if (result === "ok") return NextResponse.json({ ok: true });
  const { status, error } = RESULT_STATUS[result];
  return jsonError(status, error);
});
