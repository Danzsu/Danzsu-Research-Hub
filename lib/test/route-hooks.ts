// Route-handler tests with no running Next.js app: importing this registers tsx-hooks.ts, which
// resolves `@/lib/supabase/server` and `next/server` to this file and `server-only` to an empty
// module. Import it before the route, which is why route tests load theirs with a dynamic import.

import assert from "node:assert/strict";
import { register } from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FakeIngestDb } from "../pipeline/fake-db.ts";
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
export async function createClient(): Promise<SupabaseClient> {
  if (!routeStub.reader) throw new Error("routeStub.reader is not set");
  return routeStub.reader.db;
}

export function createAdminClient(): SupabaseClient {
  routeStub.adminCalls++;
  if (!routeStub.admin) throw new Error("routeStub.admin is not set");
  return routeStub.admin;
}

/** `next/server`'s `after()`: the task is queued, so a test can see it was scheduled and run it. */
export function after(task: () => unknown): void {
  routeStub.scheduled.push(task);
}

/**
 * Runs every task `after()` queued — each expected to reject with PGRST116, since the fake it runs
 * against holds no matching `sources` row — and returns the `sources.id` value each run's own
 * `eqCalls` recorded, in call order. Shared by the sources and reextract route tests, whose "the
 * scheduled run touches the right source" assertion was otherwise near-identical.
 */
export async function scheduledSourceIds(admin: FakeIngestDb): Promise<unknown[]> {
  for (const task of routeStub.scheduled) {
    await assert.rejects(async () => task(), { code: "PGRST116" });
  }
  return admin.eqCalls.filter((call) => call.table === "sources" && call.column === "id").map((call) => call.value);
}
