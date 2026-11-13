import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { normalizeQuery, searchAll } from "@/lib/search";
import { getReader } from "@/lib/supabase/server";

/** `?q=`: the ⌘K palette's matches, as the reader (RLS applies). At most 8; the /search page lists more. */
export async function GET(request: Request) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const q = normalizeQuery(new URL(request.url).searchParams.get("q"));
  try {
    return NextResponse.json({ hits: await searchAll(reader.db, q, 8) });
  } catch (error) {
    console.error("search failed", error);
    return jsonError(500, "db_error");
  }
}
