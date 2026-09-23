import { after, NextResponse } from "next/server";
import { processSource } from "@/lib/pipeline/ingest";
import { parseSubmittedUrl, sourceKind } from "@/lib/pipeline/util";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; note?: unknown };
  const url = parseSubmittedUrl(String(body.url ?? ""));
  if (!url) return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  // Inserted as the reader (RLS stamps submitted_by); processed with the admin client.
  const { data, error } = await supabase
    .from("sources")
    .insert({ url: url.toString(), kind: sourceKind(url), note })
    .select("id")
    .single();
  if (error?.code === "23505") return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  // Respond now; the summary takes a while. A killed run is picked up by the daily cron.
  after(() => processSource(createAdminClient(), data.id));
  return NextResponse.json({ ok: true, id: data.id }, { status: 202 });
}
