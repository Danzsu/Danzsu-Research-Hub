import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Per-reader state. RLS limits every query to the caller's own rows, and
// user_id defaults to auth.uid(), so no query here names the user.

async function reader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? supabase : null;
}

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const failed = () => NextResponse.json({ error: "db_error" }, { status: 500 });

export async function GET() {
  const db = await reader();
  if (!db) return unauthorized();

  const [stateResult, todoResult] = await Promise.all([
    db.from("item_states").select("item_id, is_read, is_saved"),
    db.from("todos").select("id, item_id, text, is_done").order("is_done").order("created_at", { ascending: false }),
  ]);
  if (stateResult.error || todoResult.error) return failed();

  const states = Object.fromEntries(
    stateResult.data.map((row) => [row.item_id, { read: row.is_read, saved: row.is_saved }]),
  );
  const todos = todoResult.data.map((row) => ({ id: row.id, itemId: row.item_id, text: row.text, done: row.is_done }));
  return NextResponse.json({ states, todos });
}

export async function POST(request: Request) {
  const db = await reader();
  if (!db) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const now = new Date().toISOString();
  const value = body.value === true;

  if (action === "set_read" || action === "set_saved") {
    const itemId = String(body.itemId ?? "").slice(0, 120);
    if (!itemId) return NextResponse.json({ error: "missing_item" }, { status: 400 });
    const column = action === "set_read" ? "is_read" : "is_saved";
    // Upsert only touches the named column, so the other flag survives.
    const { error } = await db
      .from("item_states")
      .upsert({ item_id: itemId, [column]: value, updated_at: now }, { onConflict: "user_id,item_id" });
    return error ? failed() : NextResponse.json({ ok: true });
  }

  if (action === "add_todo") {
    const text = String(body.text ?? "").trim().slice(0, 180);
    if (!text) return NextResponse.json({ error: "missing_text" }, { status: 400 });
    const itemId = body.itemId ? String(body.itemId).slice(0, 120) : null;
    const { data, error } = await db.from("todos").insert({ text, item_id: itemId }).select("id").single();
    return error ? failed() : NextResponse.json({ ok: true, id: data.id });
  }

  const id = Number(body.id);
  if ((action === "set_todo" || action === "delete_todo") && !Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  if (action === "set_todo") {
    const { error } = await db.from("todos").update({ is_done: value, updated_at: now }).eq("id", id);
    return error ? failed() : NextResponse.json({ ok: true });
  }

  if (action === "delete_todo") {
    const { error } = await db.from("todos").delete().eq("id", id);
    return error ? failed() : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
