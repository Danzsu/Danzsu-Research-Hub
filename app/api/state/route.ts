import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { parseStateAction } from "@/lib/state";
import { getReader } from "@/lib/supabase/server";

// Per-reader state. RLS limits every query to the caller's own rows, and
// user_id defaults to auth.uid(), so no query here names the user.

function failed(error: unknown) {
  console.error("reader state query failed", error);
  return jsonError(500, "db_error");
}

export async function GET() {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const db = reader.db;

  const [stateResult, todoResult] = await Promise.all([
    db.from("item_states").select("item_id, is_read, is_saved"),
    db.from("todos").select("id, item_id, text, is_done").order("is_done").order("created_at", { ascending: false }),
  ]);
  if (stateResult.error || todoResult.error) return failed(stateResult.error ?? todoResult.error);

  const states = Object.fromEntries(
    stateResult.data.map((row) => [row.item_id, { read: row.is_read, saved: row.is_saved }]),
  );
  const todos = todoResult.data.map((row) => ({ id: row.id, itemId: row.item_id, text: row.text, done: row.is_done }));
  return NextResponse.json({ states, todos });
}

export async function POST(request: Request) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const db = reader.db;

  const parsed = parseStateAction(await request.json().catch(() => null));
  if ("error" in parsed) return jsonError(400, parsed.error);
  const now = new Date().toISOString();

  switch (parsed.action) {
    case "set_read":
    case "set_saved": {
      const column = parsed.action === "set_read" ? "is_read" : "is_saved";
      // Upsert only touches the named column, so the other flag survives.
      const { error } = await db
        .from("item_states")
        .upsert({ item_id: parsed.itemId, [column]: parsed.value, updated_at: now }, { onConflict: "user_id,item_id" });
      return error ? failed(error) : NextResponse.json({ ok: true });
    }
    case "add_todo": {
      const { data, error } = await db.from("todos").insert({ text: parsed.text, item_id: parsed.itemId }).select("id").single();
      return error ? failed(error) : NextResponse.json({ ok: true, id: data.id });
    }
    case "set_todo": {
      const { error } = await db.from("todos").update({ is_done: parsed.value, updated_at: now }).eq("id", parsed.id);
      return error ? failed(error) : NextResponse.json({ ok: true });
    }
    case "delete_todo": {
      const { error } = await db.from("todos").delete().eq("id", parsed.id);
      return error ? failed(error) : NextResponse.json({ ok: true });
    }
  }
}
