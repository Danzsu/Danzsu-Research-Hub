import type { Localized } from "../data/digest-types.ts";
import { parseBlocks, plainText, type Block } from "./blocks.ts";
import { readHiddenBlocks, readOverrides } from "./overrides.ts";
import type { SourceKind } from "./pipeline/util.ts";
import { shownTitle, type Post, type PostMeta } from "./post-view.ts";

// A posts row as the page's Post. It parses the row's jsonb through the zod schemas (parseBlocks,
// readOverrides), so only the server imports it: lib/content.ts, post-article.tsx and lib/translate.ts.
// lib/client-bundle.test.ts fails if a client component ever reaches it.

/** A `posts` row (optionally with its `sources(submitted_by, error)` embed) as the page's Post. */
export function toPost(row: Record<string, unknown>): Post {
  const overrides = readOverrides(row.overrides);
  const source = row.sources as { submitted_by: string; error?: string | null } | null | undefined;
  return {
    id: row.id as number,
    sourceId: row.source_id as number,
    kind: row.kind as SourceKind,
    url: row.url as string,
    author: row.author as string | null,
    siteName: row.source_site as string | null,
    publishedAt: row.published_at as string | null,
    // Submitter edits win over the model's text; re-extraction never overwrites them.
    title: shownTitle(row.title, overrides),
    summary: overrides.summary ?? (row.summary as Localized),
    generatedTitle: row.title as Localized,
    generatedSummary: row.summary as Localized,
    keyPoints: row.key_points as Post["keyPoints"],
    tags: row.tags as string[],
    blocks: parseBlocks(row.blocks),
    blocksHu: parseTranslatedBlocks(row.blocks_hu),
    meta: (row.meta ?? {}) as PostMeta,
    hiddenBlocks: readHiddenBlocks(row.hidden_blocks),
    submittedBy: source?.submitted_by ?? null,
    lastError: source?.error ?? null,
    extractedAt: row.extracted_at as string | null,
    createdAt: row.created_at as string,
  };
}

const WORDS_PER_MINUTE = 220;
/** Below this word count there isn't enough real text for a read-time estimate to mean anything
 * (an extraction failure or a title-only fallback can leave a handful of stray words). */
const MIN_WORDS_FOR_READ_TIME = 10;

/** Null for kinds with no reading body (youtube) and for posts with ~no extracted text. */
export function readMinutes(blocks: Block[], kind: SourceKind): number | null {
  if (kind === "youtube") return null;
  const words = plainText(blocks).trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_FOR_READ_TIME) return null;
  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
}

/** `blocks_hu` as `[]` or unparseable jsonb both mean "not translated yet", not "translated to nothing". */
export function parseTranslatedBlocks(raw: unknown): Block[] | null {
  const parsed = parseBlocks(raw);
  return parsed.length > 0 ? parsed : null;
}
