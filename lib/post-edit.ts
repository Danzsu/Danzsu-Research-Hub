import type { SupabaseClient } from "@supabase/supabase-js";
import type { Localized } from "../data/digest-types.ts";
import { parseBlocks } from "./blocks.ts";
import { hiddenBlocksSchema, overridesSchema } from "./overrides.ts";
import { REEXTRACT_COOLDOWN_MINUTES, cooldownRemaining } from "./pipeline/util.ts";

// Orchestrates the post edit/re-extract writes (the PATCH and reextract routes) so both stay thin.
// Relative imports, like overrides.ts/blocks.ts/translate.ts, so node --test can load this without
// a bundler, and so the client editor can import `editPayload` without pulling in server-only code.

const patchSchema = overridesSchema.extend({ hidden: hiddenBlocksSchema });

/**
 * The PATCH body for a save: `title`/`summary` are included only when `draft` differs from the
 * model's own text (`post.generatedTitle`/`generatedSummary`) — an unchanged or reset field must
 * not freeze the model's text as a permanent override, and omitting a field that currently has one
 * clears it (the RPC replaces `overrides` wholesale, it doesn't merge). Compared trimmed: the
 * server trims on save (`localizedField` in overrides.ts), so an untrimmed comparison here would
 * treat "Model " as a real edit and send a same-content override just for the trailing space.
 */
export function editPayload(
  post: { generatedTitle: Localized; generatedSummary: Localized },
  draft: { title: Localized; summary: Localized },
  hidden: string[],
): { title?: Localized; summary?: Localized; hidden: string[] } {
  const sameAs = (a: Localized, b: Localized) => a.hu.trim() === b.hu.trim() && a.en.trim() === b.en.trim();
  const title = sameAs(draft.title, post.generatedTitle) ? undefined : draft.title;
  const summary = sameAs(draft.summary, post.generatedSummary) ? undefined : draft.summary;
  return { ...(title && { title }), ...(summary && { summary }), hidden };
}

export type SaveResult = "ok" | "invalid" | "forbidden" | "not_found" | "failed";

/**
 * Validates `input`, drops any hidden id that isn't one of the post's own blocks (a stale or
 * tampered id can't hide a block that no longer exists), then calls `update_post_overrides` as
 * the reader — the function re-checks that the caller submitted this post; RLS can't restrict columns.
 */
export async function savePostEdits(db: SupabaseClient, postId: number, input: unknown): Promise<SaveResult> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return "invalid";

  const { data: post, error: selectError } = await db.from("posts").select("id, blocks").eq("id", postId).maybeSingle();
  if (selectError) return "failed";
  if (!post) return "not_found";

  const knownIds = new Set(parseBlocks(post.blocks).map((block) => block.id));
  const hidden = parsed.data.hidden.filter((id) => knownIds.has(id));
  const { title, summary } = parsed.data;
  const overrides = { ...(title && { title }), ...(summary && { summary }) };

  const { error: rpcError } = await db.rpc("update_post_overrides", { p_post: postId, p_overrides: overrides, p_hidden: hidden });
  if ((rpcError as { code?: string } | null)?.code === "42501") return "forbidden";
  if (rpcError) return "failed";
  return "ok";
}

export type ReextractResult =
  | { status: "accepted"; sourceId: number }
  | { status: "cooldown"; retryAfter: number }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "failed" };

/**
 * Checks the post exists and the viewer submitted it, then claims the re-extraction cooldown
 * atomically: a compare-and-swap update on `extracted_at`, guarded by the value just read (or
 * `.is(null)` for a never-extracted post) and reported back with `.select("id")`. Two overlapping
 * requests can't both win — the loser's update matches 0 rows and reports "cooldown" the same as
 * an unexpired one, instead of silently starting a second `processSource` run.
 *
 * `extracted_at` doubles as the claim time: a run that goes on to fail still used up this window,
 * so a failed re-extraction can't be retried for another `REEXTRACT_COOLDOWN_MINUTES`. An in-flight
 * translation reading the old `extracted_at` becomes stale (409, `lib/translate.ts`) once this
 * claim lands; the reader's own retry heals it.
 */
export async function requestReextract(admin: SupabaseClient, viewerId: string, postId: number, now: Date): Promise<ReextractResult> {
  const { data: post, error: selectError } = await admin
    .from("posts")
    .select("source_id, extracted_at, sources(submitted_by)")
    .eq("id", postId)
    .maybeSingle();
  if (selectError) return { status: "failed" };
  if (!post) return { status: "not_found" };

  const source = post.sources as unknown as { submitted_by: string } | null;
  if (source?.submitted_by !== viewerId) return { status: "forbidden" };

  const wait = cooldownRemaining(post.extracted_at as string | null, now, REEXTRACT_COOLDOWN_MINUTES);
  if (wait > 0) return { status: "cooldown", retryAfter: wait };

  const scoped = admin.from("posts").update({ extracted_at: now.toISOString() }).eq("id", postId);
  const guarded = post.extracted_at === null ? scoped.is("extracted_at", null) : scoped.eq("extracted_at", post.extracted_at as string);
  const { data: claimed, error: claimError } = await guarded.select("id");
  if (claimError) return { status: "failed" };
  // 0 rows means another request's own CAS already moved extracted_at off the value we just read
  // (or off null) — we don't know what it claimed, so fall back to the full cooldown.
  if (!claimed || claimed.length === 0) {
    return { status: "cooldown", retryAfter: cooldownRemaining(now.toISOString(), now, REEXTRACT_COOLDOWN_MINUTES) };
  }

  return { status: "accepted", sourceId: post.source_id as number };
}
