import { NextResponse } from "next/server";
import { getAppUser } from "@/app/lib/user";
import { getRawDb } from "@/db/raw";

type StateRow = { item_id: string; is_read: number; is_saved: number };
type TodoRow = { id: number; item_id: string | null; text: string; is_done: number; created_at: number };

async function requireUser() {
  const user = await getAppUser();
  if (!user) return null;
  const now = Date.now();
  await getRawDb()
    .prepare(
      `INSERT INTO profiles (user_id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    )
    .bind(user.userId, user.email, user.displayName, now, now)
    .run();
  return user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getRawDb();
  const [stateResult, todoResult] = await db.batch([
    db.prepare("SELECT item_id, is_read, is_saved FROM item_states WHERE user_id = ?").bind(user.userId),
    db.prepare(
      `SELECT id, item_id, text, is_done, created_at
       FROM todos WHERE user_id = ? ORDER BY is_done ASC, created_at DESC`,
    ).bind(user.userId),
  ]);

  const states = Object.fromEntries(
    (stateResult.results as unknown as StateRow[]).map((row) => [
      row.item_id,
      { read: Boolean(row.is_read), saved: Boolean(row.is_saved) },
    ]),
  );
  const todos = (todoResult.results as unknown as TodoRow[]).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    text: row.text,
    done: Boolean(row.is_done),
  }));

  return NextResponse.json({ states, todos });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const now = Date.now();
  const db = getRawDb();

  if (action === "set_read" || action === "set_saved") {
    const itemId = String(body.itemId ?? "").slice(0, 120);
    const value = body.value === true ? 1 : 0;
    if (!itemId) return NextResponse.json({ error: "missing_item" }, { status: 400 });
    const column = action === "set_read" ? "is_read" : "is_saved";
    await db.prepare(
      `INSERT INTO item_states (user_id, item_id, ${column}, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
         ${column} = excluded.${column},
         updated_at = excluded.updated_at`,
    ).bind(user.userId, itemId, value, now).run();
    return NextResponse.json({ ok: true });
  }

  if (action === "add_todo") {
    const todoText = String(body.text ?? "").trim().slice(0, 180);
    const itemId = body.itemId ? String(body.itemId).slice(0, 120) : null;
    if (!todoText) return NextResponse.json({ error: "missing_text" }, { status: 400 });
    const result = await db.prepare(
      `INSERT INTO todos (user_id, item_id, text, is_done, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).bind(user.userId, itemId, todoText, now, now).run();
    return NextResponse.json({ ok: true, id: result.meta.last_row_id });
  }

  if (action === "set_todo") {
    const id = Number(body.id);
    const value = body.value === true ? 1 : 0;
    if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    await db.prepare(
      "UPDATE todos SET is_done = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(value, now, id, user.userId).run();
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_todo") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    await db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").bind(id, user.userId).run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
