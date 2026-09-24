import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { processSource } from "@/lib/pipeline/ingest";
import { detectSource, parseSubmittedUrl } from "@/lib/pipeline/util";
import { createAdminClient, getReader } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; note?: unknown };
  const url = parseSubmittedUrl(String(body.url ?? ""));
  if (!url) return jsonError(400, "invalid_url");
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  // Inserted as the reader (RLS stamps submitted_by); processed with the admin client.
  const { data, error } = await reader.db
    .from("sources")
    .insert({ url: url.toString(), kind: detectSource(url), note })
    .select("id")
    .single();
  if (error?.code === "23505") return jsonError(409, "already_submitted");
  if (error || !data) return jsonError(500, "insert_failed");

  // Respond now; the summary takes a while. A killed run is picked up by the daily cron.
  after(() => processSource(createAdminClient(), data.id));
  return NextResponse.json({ ok: true, id: data.id }, { status: 202 });
}
