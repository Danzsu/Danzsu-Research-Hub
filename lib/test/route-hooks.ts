// Route-handler tests with no running Next.js app: importing this registers tsx-hooks.ts, which
// resolves `@/lib/supabase/server` and `next/server` to this file and `server-only` to an empty
// module. Import it before the route, which is why route tests load theirs with a dynamic import.

import { register } from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "../supabase/server.ts";

register("./tsx-hooks.ts", import.meta.url);

export { NextResponse } from "next/server.js";
export { safeNext } from "../pipeline/util.ts";

type Reader = { db: SupabaseClient; viewer: Viewer };

/** What the stubbed modules answer. `resetRoute()` at the start of every test. */
export const routeStub = {
  /** `getReader()`'s answer: null is signed out. */
  reader: null as Reader | null,
  /** `createAdminClient()`'s answer. */
  admin: null as SupabaseClient | null,
  /** How many times the route asked for the admin client. */
  adminCalls: 0,
  /** Every task the route handed to `after()`, not yet run. */
  scheduled: [] as (() => unknown)[],
};

export function resetRoute(): void {
  Object.assign(routeStub, { reader: null, admin: null, adminCalls: 0, scheduled: [] });
}

/** A signed-in reader whose RLS-scoped client is `db`. */
export const signedIn = (db: SupabaseClient, id = "owner"): Reader => ({ db, viewer: { id, email: `${id}@example.test` } });

export const getReader = async () => routeStub.reader;
export const getViewer = async () => routeStub.reader?.viewer ?? null;
export const createClient = async () => routeStub.reader?.db;

export function createAdminClient(): SupabaseClient {
  routeStub.adminCalls++;
  if (!routeStub.admin) throw new Error("routeStub.admin is not set");
  return routeStub.admin;
}

/** `next/server`'s `after()`: the task is queued, so a test can see it was scheduled and run it. */
export function after(task: () => unknown): void {
  routeStub.scheduled.push(task);
}
