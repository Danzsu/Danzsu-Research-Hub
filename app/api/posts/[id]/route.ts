import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { parseId } from "@/lib/pipeline/util";
import { savePostEdits, type SaveResult } from "@/lib/post-edit";
import { getReader } from "@/lib/supabase/server";

// Exhaustive by construction, same pattern as the translate route: a `SaveResult` variant with no
// entry here is a tsc error, not a silently-200 response.
const SAVE_STATUS: Record<Exclude<SaveResult, "ok">, { status: number; error: string }> = {
  invalid: { status: 400, error: "invalid" },
  forbidden: { status: 403, error: "forbidden" },
  not_found: { status: 404, error: "not_found" },
  failed: { status: 500, error: "db_error" },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");

  const postId = parseId((await params).id);
  if (!postId) return jsonError(400, "invalid");

  const body = await request.json().catch(() => null);
  const result = await savePostEdits(reader.db, postId, body);
  if (result === "ok") return NextResponse.json({ ok: true });
  const { status, error } = SAVE_STATUS[result];
  return jsonError(status, error);
}
