import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listMySources } from "@/lib/my-sources";
import { getReader } from "@/lib/supabase/server";

/** The taiyaki link chat's thread: the caller's own latest submissions. */
export async function GET() {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const sources = await listMySources(reader.db, reader.viewer.id);
  return sources ? NextResponse.json({ sources }) : jsonError(500, "db_error");
}
