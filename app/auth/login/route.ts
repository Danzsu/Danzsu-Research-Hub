import { NextResponse, type NextRequest } from "next/server";
import { createClient, safeNext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));

  if (email.includes("@")) {
    const supabase = await createClient();
    const callback = new URL("/auth/callback", request.nextUrl.origin);
    callback.searchParams.set("next", next);
    // shouldCreateUser: false — sign-ups are off; only invited addresses get a link.
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
    });
  }

  // Same answer whether or not the address is invited, so the form can't enumerate members.
  return NextResponse.redirect(new URL("/login?sent=1", request.nextUrl.origin), 303);
}
