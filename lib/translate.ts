import { z } from "zod/v4";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inlineText, parseBlocks, type Block, type Inline } from "./blocks.ts";
import { generate } from "./llm.ts";
import { errorMessage, mapLimited } from "./pipeline/util.ts";
import { parseTranslatedBlocks } from "./post-view.ts";

// Only text goes to the model and only text comes back; structure, links and
// image data are copied from the original, so a translation cannot corrupt them.

// Not a discriminated union, and fields aren't required per block type, even though an untagged
// z.union converts fine with z.toJSONSchema: zod keeps only the first union variant an answer
// matches, so a paragraph legitimately answered as { id, text, spans } would match a narrower
// variant first and lose its spans — a real answer falsely rejected. A union also can't tie a
// variant to the block's own type anyway, so `applyTranslation`'s `shapeOk` check below, which has
// `block` in hand, is the real per-type gate either way.
export const translationItemSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  spans: z.array(z.string()).optional(),
  items: z.array(z.array(z.string())).optional(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  chapters: z.array(z.string()).optional(),
});
export type TranslationItem = z.infer<typeof translationItemSchema>;
export const translationSchema = z.object({ blocks: z.array(translationItemSchema) });

export function translatable(blocks: Block[]): TranslationItem[] {
  return blocks.flatMap((block): TranslationItem[] => {
    switch (block.type) {
      case "heading":
        return [{ id: block.id, text: block.text }];
      case "paragraph":
      case "quote":
        return [{ id: block.id, spans: block.content.map((span) => span.text) }];
      case "list":
        return [{ id: block.id, items: block.items.map((item) => item.map((span) => span.text)) }];
      case "image":
        return block.alt || block.caption ? [{ id: block.id, alt: block.alt, caption: block.caption }] : [];
      case "chapters":
        return [{ id: block.id, chapters: block.items.map((item) => item.title) }];
      default:
        return [];
    }
  });
}

export function chunkTranslatable(items: TranslationItem[], maxChars = 15_000): TranslationItem[][] {
  const chunks: TranslationItem[][] = [];
  let current: TranslationItem[] = [];
  let size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (current.length && size + length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Same span count keeps the marks; otherwise the block degrades to one plain span. */
function spansFrom(original: Inline[], translated: string[] | undefined): Inline[] {
  if (!translated) return original;
  if (translated.length === original.length) return original.map((span, i) => ({ ...span, text: translated[i] }));
  return [{ text: translated.join("") }];
}

/** True unless `translated` is an obviously bad answer for `original`: empty/whitespace when the
 *  source wasn't, or absurdly long — a degenerate repetition loop. */
function validText(original: string, translated: string): boolean {
  if (original.trim() && !translated.trim()) return false;
  return translated.length <= original.length * 3 + 200;
}

/**
 * Whether `item` is a well-formed translation of `block`: every expected field is present, `items`/
 * `chapters` array lengths match the original, and no text field looks broken. A span-count
 * mismatch inside one paragraph/quote/list-item still degrades to plain text later (`spansFrom`
 * above) — but the *joined* fallback text is validated here like any other
 * field, so a mismatch can't be used to smuggle empty or degenerate text past this check.
 */
function shapeOk(block: Block, item: TranslationItem): boolean {
  switch (block.type) {
    case "heading":
      return item.text !== undefined && validText(block.text, item.text);
    case "paragraph":
    case "quote":
      return (
        item.spans !== undefined &&
        (item.spans.length === block.content.length
          ? item.spans.every((span, i) => validText(block.content[i].text, span))
          : validText(inlineText(block.content), item.spans.join("")))
      );
    case "list":
      return (
        item.items !== undefined &&
        item.items.length === block.items.length &&
        item.items.every((spans, i) =>
          spans.length === block.items[i].length
            ? spans.every((text, j) => validText(block.items[i][j].text, text))
            : validText(inlineText(block.items[i]), spans.join("")),
        )
      );
    case "image":
      return (
        (!block.alt || (item.alt !== undefined && validText(block.alt, item.alt))) &&
        (block.caption === undefined || (item.caption !== undefined && validText(block.caption, item.caption)))
      );
    case "chapters":
      return (
        item.chapters !== undefined &&
        item.chapters.length === block.items.length &&
        item.chapters.every((title, i) => validText(block.items[i].title, title))
      );
    default:
      return true;
  }
}

/** Null when a translatable block is missing from the answer, or the answer's shape for a block is
 *  broken (wrong field, wrong array length, empty/degenerate text) — the caller must not save it. */
export function applyTranslation(blocks: Block[], translated: TranslationItem[]): Block[] | null {
  const byId = new Map(translated.map((item) => [item.id, item]));
  const expected = translatable(blocks);
  if (expected.some((item) => !byId.has(item.id))) return null;
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  if (expected.some((item) => !shapeOk(blockById.get(item.id)!, byId.get(item.id)!))) return null;
  return blocks.map((block): Block => {
    const item = byId.get(block.id);
    if (!item) return block;
    switch (block.type) {
      case "heading":
        return { ...block, text: item.text ?? block.text };
      case "paragraph":
      case "quote":
        return { ...block, content: spansFrom(block.content, item.spans) };
      case "list":
        return { ...block, items: block.items.map((spans, i) => spansFrom(spans, item.items?.[i])) };
      case "image":
        return {
          ...block,
          // Mirrors the caption guard below: an empty alt means a decorative image, so a model's
          // invented (or oversized) alt is never applied, not just never required.
          alt: block.alt === "" ? block.alt : (item.alt ?? block.alt),
          caption: block.caption === undefined ? undefined : (item.caption ?? block.caption),
        };
      case "chapters":
        return { ...block, items: block.items.map((chapter, i) => ({ ...chapter, title: item.chapters?.[i] ?? chapter.title })) };
      default:
        return block;
    }
  });
}

export const TRANSLATE_INSTRUCTIONS = `Translate every text field of these content blocks into natural, idiomatic Hungarian.
- Return the same blocks with the same ids and the same fields.
- "spans" are consecutive pieces of one sentence (some are links or bold): return exactly as many spans, each translated so that joined together they read naturally.
- Keep code, URLs, product and model names, numbers and units unchanged.`;

/** At most this many chunk requests run at once — a long post is ~14 chunks, and running them
 *  unbounded would trip free-tier model rate limits. */
const CHUNK_CONCURRENCY = 3;

export type TranslateResult = "ok" | "not_found" | "shape" | "failed" | "stale";

/**
 * Translates a post's blocks to Hungarian and saves them to `blocks_hu`. A no-op ("ok" without a
 * model call) once `blocks_hu` already holds a real translation — `parseTranslatedBlocks` decides
 * that, same rule as the read path, so `[]`/garbage jsonb there is retried here too — or once there
 * is nothing translatable at all (e.g. a bare video post).
 *
 * The write is guarded on `extracted_at`, read alongside `blocks`: a re-extraction (`processSource`)
 * can upsert fresh blocks with `blocks_hu: null` while the model call below is still running (up to
 * 300s), and without this guard that write would land on top of the newer extraction. `"stale"`
 * means the guard matched 0 rows — the caller should tell the reader to retry, not treat it as done.
 */
export async function translatePost(db: SupabaseClient, postId: number): Promise<TranslateResult> {
  const { data: post, error: selectError } = await db
    .from("posts")
    .select("id, blocks, blocks_hu, extracted_at")
    .eq("id", postId)
    .maybeSingle();
  if (selectError) {
    console.warn(`translate ${postId}: select failed: ${errorMessage(selectError)}`);
    return "failed";
  }
  if (!post) return "not_found";
  if (parseTranslatedBlocks(post.blocks_hu)) return "ok";

  const blocks = parseBlocks(post.blocks);
  const items = translatable(blocks);
  if (items.length === 0) return "ok"; // nothing to translate — e.g. a bare video post

  const chunks = chunkTranslatable(items);
  try {
    const answers = await mapLimited(chunks, CHUNK_CONCURRENCY, (chunk) =>
      generate(db, "translate_post", translationSchema, `${TRANSLATE_INSTRUCTIONS}\n\n${JSON.stringify(chunk)}`),
    );
    const translated = applyTranslation(blocks, answers.flatMap((answer) => answer.blocks));
    if (!translated) return "shape";

    // ponytail: a chunk that falls back to the slower model can push a 400-block post past the
    // 300s function budget; a kill then loses every chunk this run already translated. Upgrade
    // path: persist chunks as they finish, or move translation to a background job.
    const scoped = db.from("posts").update({ blocks_hu: translated }).eq("id", post.id);
    const guarded = post.extracted_at === null ? scoped.is("extracted_at", null) : scoped.eq("extracted_at", post.extracted_at);
    const { data: updated, error } = await guarded.select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) return "stale"; // re-extracted while the model was running
    return "ok";
  } catch (error) {
    console.warn(`translate ${post.id}: ${errorMessage(error)}`);
    return "failed";
  }
}
