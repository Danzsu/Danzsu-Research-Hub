import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Acts as the signed-in reader; RLS applies. One per request. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

/** Bypasses RLS. Only for the pipeline (cron, ingest) — never pass its results to a reader unfiltered. */
export function createAdminClient() {
  return createSupabaseClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Only same-site paths: `//evil.com` and absolute URLs fall back to `/`. */
export function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export type Viewer = { id: string; email: string };

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: String(claims.email ?? "") };
}
