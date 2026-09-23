import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, safeNext } from "@/lib/supabase/server";

// Handles both the token_hash links from the customized email templates
// (works across devices) and the default PKCE ?code= links.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  const target = error ? "/login?error=1" : safeNext(params.get("next"));
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
