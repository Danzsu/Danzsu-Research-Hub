import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { processSource } from "@/lib/pipeline/ingest";
import { parseId } from "@/lib/pipeline/util";
import { requestReextract, type ReextractResult } from "@/lib/post-edit";
import { createAdminClient, getViewer } from "@/lib/supabase/server";

export const maxDuration = 300;

// "accepted"/"cooldown" carry their own payload and are handled directly below; every other
// status is exhaustively mapped here, same pattern as the translate route.
const REEXTRACT_STATUS: Record<Exclude<ReextractResult["status"], "accepted" | "cooldown">, { status: number; error: string }> = {
  forbidden: { status: 403, error: "forbidden" },
  not_found: { status: 404, error: "not_found" },
  failed: { status: 500, error: "db_error" },
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "unauthorized");

  const postId = parseId((await params).id);
  if (!postId) return jsonError(404, "not_found");

  const admin = createAdminClient();
  const result = await requestReextract(admin, viewer.id, postId, new Date());
  if (result.status === "accepted") {
    after(() => processSource(admin, result.sourceId));
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  if (result.status === "cooldown") return jsonError(429, "cooldown", { retryAfter: result.retryAfter });
  const { status, error } = REEXTRACT_STATUS[result.status];
  return jsonError(status, error);
}
