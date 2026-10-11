import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDevPreviewPath, isPublicPath, signedOutTarget } from "@/lib/public-paths";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Before any Supabase call: the preview has to work with no keys and no network.
  if (isDevPreviewPath(pathname, process.env.NODE_ENV)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() verifies the JWT and refreshes an expired session.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(signedOutTarget(pathname, search), request.nextUrl));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|ico|webmanifest)$).*)"],
};
