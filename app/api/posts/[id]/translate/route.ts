import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { parseId } from "@/lib/pipeline/util";
import { createAdminClient, getReader } from "@/lib/supabase/server";
import { translatePost } from "@/lib/translate";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");

  const postId = parseId((await params).id);
  if (!postId) return jsonError(404, "not_found");

  const { data: post, error: selectError } = await reader.db.from("posts").select("id").eq("id", postId).maybeSingle();
  if (selectError) {
    console.warn(`translate ${postId}: reader select failed: ${selectError.message}`);
    return jsonError(502, "translation_failed");
  }
  if (!post) return jsonError(404, "not_found");

  // model_settings and the posts write need the secret key; existence was already checked as the reader (RLS).
  const result = await translatePost(createAdminClient(), post.id);
  if (result === "not_found") return jsonError(404, "not_found");
  if (result === "shape") return jsonError(502, "translation_shape");
  if (result === "stale") return jsonError(409, "translation_stale");
  if (result === "failed") return jsonError(502, "translation_failed");
  return NextResponse.json({ ok: true });
}
