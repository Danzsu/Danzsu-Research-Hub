import { NextResponse } from "next/server";
import { jsonError, POST_ERRORS, postRoute, type ErrorAnswer } from "@/lib/api";
import { savePostEdits, type SaveResult } from "@/lib/post-edit";
import { getReader } from "@/lib/supabase/server";

// Exhaustive by construction, same pattern as the translate route: a `SaveResult` variant with no
// entry here is a tsc error, not a silently-200 response.
const SAVE_STATUS: Record<Exclude<SaveResult, "ok">, ErrorAnswer> = {
  ...POST_ERRORS,
  invalid: { status: 400, error: "invalid" },
};

export const PATCH = postRoute(getReader, async (request, { reader, postId }) => {
  const body = await request.json().catch(() => null);
  const result = await savePostEdits(reader.db, postId, body);
  if (result === "ok") return NextResponse.json({ ok: true });
  const { status, error } = SAVE_STATUS[result];
  return jsonError(status, error);
});
