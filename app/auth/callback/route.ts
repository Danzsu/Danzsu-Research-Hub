import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { loginWithError } from "@/lib/pipeline/util";
import { createClient, safeNext } from "@/lib/supabase/server";

// Handles the token_hash links from the customized email templates (works across devices), the default
// PKCE ?code= links, and Google's sign-in (auth/google), which comes back with a ?code= too, or with an
// error when Google or Supabase refused it.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;
  const next = safeNext(params.get("next"));
  // Refused, and no session is tried, even with a stray code. Sign-ups are off, so an uninvited Google account
  // gets signup_disabled. Any other refusal of a round trip marked via=google (the reader cancelled at
  // Google) is a Google failure; GoTrue refuses an expired or used magic link this way too, and that stays
  // the link message.
  if (params.get("error")) {
    const reason = params.get("error_code") === "signup_disabled" ? "not_invited" : params.get("via") === "google" ? "google" : "1";
    return NextResponse.redirect(loginWithError(origin, reason, next));
  }
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  return NextResponse.redirect(error ? loginWithError(origin, "1", next) : new URL(next, origin));
}
