import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The landing page, with a mark its header turns into a one-line status (2a spec D6).
  return NextResponse.redirect(new URL("/about?signed_out=1", request.nextUrl.origin), 303);
}
