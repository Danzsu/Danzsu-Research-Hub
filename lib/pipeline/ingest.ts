import type { SupabaseClient } from "@supabase/supabase-js";
import { limitBlocks, parseBlocks, type Block } from "../blocks.ts";
import { MEDIA_BUCKET } from "../media.ts";
import { aiCleanup } from "./cleanup.ts";
import { extract } from "./extract/index.ts";
import { IMAGE_BUDGET_MS, mirrorImages, unusedMediaPaths } from "./images.ts";
import { summarize, writeNotes } from "./summary.ts";
import type { SourceKind } from "./util.ts";

const MAX_ATTEMPTS = 3;

// The cleanup prompt targets web-page chrome (nav, ads, share buttons); pdf (a Gemini
// transcription), x (post text) and youtube (the video block) have none of that to strip,
// and running the prompt on them risks dropping real content instead.
const AI_CLEANUP_KINDS: ReadonlySet<SourceKind> = new Set(["article", "github", "arxiv"]);

// A Gemini summary call can take up to 120s; starting one more source this close to the
// cron's own deadline would likely be killed mid-flight instead of finishing.
const GEMINI_SUMMARY_RESERVE_MS = 120_000;

type Source = { id: number; url: string; kind: SourceKind; note: string | null; attempts: number };

/** A failed re-extraction must not unpublish a post that already exists. */
export function failureUpdate(hasPrevious: boolean, message: string): { status?: "failed"; error: string } {
  const error = message.slice(0, 500);
  return hasPrevious ? { error } : { status: "failed", error };
}

export async function removeUnusedMedia(db: SupabaseClient, sourceId: number, blocks: Block[]): Promise<void> {
  const { data } = await db.storage.from(MEDIA_BUCKET).list(String(sourceId), { limit: 1000 });
  const unused = unusedMediaPaths((data ?? []).map((object) => `${sourceId}/${object.name}`), blocks);
  if (unused.length) await db.storage.from(MEDIA_BUCKET).remove(unused);
}

async function buildPost(db: SupabaseClient, source: Source, previous: Block[], imageBudgetMs?: number) {
  const note = source.note ? `\nThe submitter's note: ${source.note}` : "";
  const extracted = await extract(db, source.kind, source.url, note);
  const meta: Record<string, unknown> = { ...extracted.meta };
  let blocks: Block[];

  if (extracted.meta.noarchive) {
    blocks = await writeNotes(db, extracted);
    meta.mirrored = false;
  } else {
    const cleaned = AI_CLEANUP_KINDS.has(source.kind) ? await aiCleanup(db, extracted.blocks) : extracted.blocks;
    const limited = limitBlocks(cleaned);
    blocks = await mirrorImages(db, source.id, limited.blocks, previous, { budgetMs: imageBudgetMs });
    meta.mirrored = !extracted.meta.extractionFailed && blocks.length > 0;
    if (limited.clipped) meta.clipped = true;
  }

  const generated = extracted.generated ?? (await summarize(db, extracted, note));
  return {
    title: generated.title,
    summary: generated.summary,
    key_points: generated.keyPoints,
    tags: generated.tags,
    author: extracted.author,
    source_site: extracted.siteName,
    published_at: extracted.publishedAt,
    blocks,
    meta,
  };
}

/**
 * Turns a submitted source into a post, or refreshes an existing one.
 * Only machine fields are written: `overrides` and `hidden_blocks` belong to
 * the submitter and are never touched here. Replaces only on success.
 */
export async function processSource(db: SupabaseClient, id: number, options: { imageBudgetMs?: number } = {}): Promise<void> {
  const { data: source, error } = await db.from("sources").select("id, url, kind, note, attempts").eq("id", id).single<Source>();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  await db.from("sources").update({ attempts: source.attempts + 1 }).eq("id", id);
  const { data: existing } = await db.from("posts").select("id, blocks").eq("source_id", id).maybeSingle();
  const previous = existing ? parseBlocks(existing.blocks) : [];

  try {
    const post = await buildPost(db, source, previous, options.imageBudgetMs);
    const { error: saveError } = await db.from("posts").upsert(
      { source_id: source.id, kind: source.kind, url: source.url, ...post, blocks_hu: null, extracted_at: new Date().toISOString() },
      { onConflict: "source_id" },
    );
    if (saveError) throw saveError;
    await removeUnusedMedia(db, source.id, post.blocks);
    await db.from("sources").update({ status: "done", error: null }).eq("id", id);
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    await db.from("sources").update(failureUpdate(Boolean(existing), message)).eq("id", id);
  }
}

/**
 * Sources that never finished (e.g. the function was killed) or failed fewer than MAX_ATTEMPTS
 * times. `deadline` (epoch ms, e.g. from the cron route's own maxDuration) stops the loop from
 * *starting* a source once too little time remains for one more; a source already started runs
 * to completion. ponytail: sequential, one request's time budget shared one source at a time —
 * a queue deeper than that just waits for the next cron run rather than racing a shared budget.
 */
export async function retryPendingSources(db: SupabaseClient, deadline?: number): Promise<number> {
  const { data } = await db
    .from("sources")
    .select("id")
    .neq("status", "done")
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(10);

  let processed = 0;
  for (const row of data ?? []) {
    if (deadline !== undefined && deadline - Date.now() < GEMINI_SUMMARY_RESERVE_MS) break;
    const imageBudgetMs = deadline === undefined ? undefined : Math.min(IMAGE_BUDGET_MS, Math.max(0, deadline - Date.now()));
    await processSource(db, row.id as number, { imageBudgetMs });
    processed++;
  }
  return processed;
}
