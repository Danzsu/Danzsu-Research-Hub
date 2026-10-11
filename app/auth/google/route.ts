import { NextResponse, type NextRequest } from "next/server";
import { authCallback, loginWithError } from "@/lib/pipeline/util";
import { createClient, safeNext } from "@/lib/supabase/server";

/** "Belépés Google-lel": Supabase's Google sign-in (PKCE; the verifier lands in a cookie here). Sign-ups
 *  are off, so Supabase refuses an uninvited account and creates nothing; the callback says why. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // select_account: after "not invited", the next click must let the reader pick another Google account.
    options: { redirectTo: authCallback(origin, next, "google"), skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  // Defensive: supabase-js builds the URL locally and answers no error today.
  return NextResponse.redirect(error || !data.url ? loginWithError(origin, "google", next) : data.url, 303);
}
