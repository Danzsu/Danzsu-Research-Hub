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

/**
 * Bypasses RLS. For the pipeline (cron, ingest) and, each after its own auth check, the translate,
 * reextract and /media routes — never pass its results to a reader unfiltered.
 */
export function createAdminClient() {
  return createSupabaseClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { safeNext } from "@/lib/pipeline/util";

export type Viewer = { id: string; email: string };

/** The signed-in reader's client and identity, or null: the auth check of every page and reader API route (the cron route checks CRON_SECRET instead). */
export async function getReader(): Promise<{ db: Awaited<ReturnType<typeof createClient>>; viewer: Viewer } | null> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub ? { db, viewer: { id: claims.sub, email: String(claims.email ?? "") } } : null;
}

export async function getViewer(): Promise<Viewer | null> {
  return (await getReader())?.viewer ?? null;
}
