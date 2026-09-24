import type { SupabaseClient } from "@supabase/supabase-js";
import { limitBlocks, parseBlocks, type Block } from "../blocks.ts";
import { MEDIA_BUCKET } from "../media.ts";
import { aiCleanup } from "./cleanup.ts";
import { extract } from "./extract/index.ts";
import { IMAGE_BUDGET_MS, mirrorImages, unusedMediaPaths } from "./images.ts";
import { summarize, writeNotes } from "./summary.ts";
import { errorMessage, type SourceKind } from "./util.ts";

const MAX_ATTEMPTS = 3;

// The cleanup prompt targets web-page chrome (nav, ads, share buttons); pdf (a Gemini
// transcription), x (post text) and youtube (the video block) have none of that to strip,
// and running the prompt on them risks dropping real content instead.
const AI_CLEANUP_KINDS: ReadonlySet<SourceKind> = new Set(["article", "github", "arxiv"]);

// retryPendingSources' own "don't start one more source" gate. A single model task's true worst
// case is up to 2×120s (main route, then its one fallback — see retryPendingSources' own ponytail
// note below); this reserve is deliberately smaller than that, so it doesn't just refuse to ever
// start the last source in a batch — a source that does hit the full worst case can still outlive
// `deadline` regardless.
export const START_GATE_RESERVE_MS = 120_000;

// The image budget's own reserve, held back for the summarize() call that follows mirrorImages
// inside buildPost. Sized for the *typical* case, not the worst case above: reserving the full
// worst case here would starve the image budget on an ordinary run, even though a source that
// does hit the worst case can still outlive the deadline (see retryPendingSources' own comment).
export const SUMMARY_RESERVE_MS = 30_000;

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

/** A fresh read of a source's current post blocks, taken right before failure-path media cleanup —
 *  not the start-of-run snapshot, which a concurrent run could have moved past by publishing new
 *  images since. `null` means the read itself failed; the caller skips cleanup rather than risk
 *  deleting images a fresher (unseen) post still references. */
async function currentPostBlocks(db: SupabaseClient, sourceId: number): Promise<Block[] | null> {
  const { data, error } = await db.from("posts").select("blocks").eq("source_id", sourceId).maybeSingle();
  if (error) return null;
  return data ? parseBlocks(data.blocks) : [];
}

/** The image budget for a source whose processing must fit before `deadline` (epoch ms), leaving
 *  `SUMMARY_RESERVE_MS` for the summarize() call that follows mirrorImages; `undefined` (mirrorImages'
 *  own 90s default) when there is no deadline. Computed fresh right before mirrorImages is called,
 *  not earlier — `now` is a parameter only so a test can pin the formula without real timers. */
export function imageBudgetFor(deadline: number | undefined, now = Date.now()): number | undefined {
  return deadline === undefined ? undefined : Math.min(IMAGE_BUDGET_MS, Math.max(0, deadline - now - SUMMARY_RESERVE_MS));
}

async function buildPost(db: SupabaseClient, source: Source, previous: Block[], deadline?: number) {
  const note = source.note ? `\nThe submitter's note: ${source.note}` : "";
  const extracted = await extract(db, source.kind, source.url, note);
  const meta: Record<string, unknown> = { ...extracted.meta };
  let blocks: Block[];

  if (extracted.meta.noarchive) {
    blocks = await writeNotes(db, extracted);
    meta.mirrored = false;
  } else {
    // Clip first, then clean: the listing sent to aiCleanup must never exceed the same cap.
    const limited = limitBlocks(extracted.blocks);
    const cleaned = AI_CLEANUP_KINDS.has(source.kind) ? await aiCleanup(db, limited.blocks) : limited.blocks;
    blocks = await mirrorImages(db, source.id, cleaned, previous, { budgetMs: imageBudgetFor(deadline) });
    // A YouTube video is embedded, not mirrored — never true for that kind, regardless of blocks.
    meta.mirrored = source.kind !== "youtube" && !extracted.meta.extractionFailed && blocks.length > 0;
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
export async function processSource(db: SupabaseClient, id: number, options: { deadline?: number } = {}): Promise<void> {
  const { data: source, error } = await db.from("sources").select("id, url, kind, note, attempts").eq("id", id).single<Source>();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  await db.from("sources").update({ attempts: source.attempts + 1 }).eq("id", id);
  // A transient lookup error is not "no existing post" — treating it as one would let a failed
  // re-extraction below mark an already-published post `failed` instead of leaving it alone.
  const { data: existing, error: existingError } = await db.from("posts").select("id, blocks").eq("source_id", id).maybeSingle();
  if (existingError) throw existingError;
  const previous = existing ? parseBlocks(existing.blocks) : [];
  let saved = false;

  try {
    const post = await buildPost(db, source, previous, options.deadline);
    const { error: saveError } = await db.from("posts").upsert(
      { source_id: source.id, kind: source.kind, url: source.url, ...post, blocks_hu: null, extracted_at: new Date().toISOString() },
      { onConflict: "source_id" },
    );
    if (saveError) throw saveError;
    saved = true;
    await removeUnusedMedia(db, source.id, post.blocks);
    await db.from("sources").update({ status: "done", error: null }).eq("id", id);
  } catch (failure) {
    const message = errorMessage(failure);
    // Once the upsert itself has succeeded, the new post's images are live and referenced — nothing
    // here is orphaned, and cleaning up against a stale read could delete them. Only a failure
    // before that point gets cleanup, and even then not against `previous` (a start-of-run snapshot
    // a concurrent run could have moved past) but a fresh read of what's live right now; a failed
    // re-read just skips cleanup rather than risk deleting images a fresher post still references.
    // A failure in this cleanup itself is logged, never allowed to overwrite the message below.
    if (!saved) {
      try {
        const current = await currentPostBlocks(db, id);
        if (current) await removeUnusedMedia(db, id, current);
      } catch (cleanupError) {
        console.warn(`orphaned-media cleanup failed for source ${id}: ${errorMessage(cleanupError)}`);
      }
    }
    // `saved` counts too: a post that this very run just wrote is exactly as "already published" as
    // one written earlier — a failure after that point (e.g. the trailing media cleanup or status
    // write) must not flip a live post's source row to `failed`.
    await db.from("sources").update(failureUpdate(saved || Boolean(existing), message)).eq("id", id);
  }
}

/**
 * Sources that never finished (e.g. the function was killed) or failed fewer than MAX_ATTEMPTS
 * times. `deadline` (epoch ms, e.g. from the cron route's own maxDuration) stops the loop from
 * *starting* a source once too little time remains for one more.
 * ponytail: a source that IS started can still outlive `deadline` — extraction, cleanup and
 * summarize() each have their own fallback route, so a single model task can take up to 2×120s,
 * and a pdf needs two such tasks (transcription, then summary). When that happens the platform
 * kills the function mid-flight, this attempt is spent, and the source is retried on the next
 * cron run. Upgrade path: a dedicated retry cron with its own 300s budget instead of sharing
 * runDaily's.
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
    if (deadline !== undefined && deadline - Date.now() < START_GATE_RESERVE_MS) break;
    await processSource(db, row.id as number, { deadline });
    processed++;
  }
  return processed;
}
