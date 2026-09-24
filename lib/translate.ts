import { z } from "zod/v4";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBlocks, type Block, type Inline } from "./blocks.ts";
import { generate } from "./llm.ts";
import { parseTranslatedBlocks } from "./post-view.ts";

// Only text goes to the model and only text comes back; structure, links and
// image data are copied from the original, so a translation cannot corrupt them.

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

/** Null when a translatable block is missing from the answer: the caller must not save it. */
export function applyTranslation(blocks: Block[], translated: TranslationItem[]): Block[] | null {
  const byId = new Map(translated.map((item) => [item.id, item]));
  if (translatable(blocks).some((item) => !byId.has(item.id))) return null;
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
        return { ...block, alt: item.alt ?? block.alt, caption: item.caption ?? block.caption };
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

/** Runs `items` through `work`, at most `limit` in flight, results kept in the original order. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) results[i] = await work(items[i]);
    }),
  );
  return results;
}

export type TranslateResult = "ok" | "not_found" | "shape" | "failed";

/**
 * Translates a post's blocks to Hungarian and saves them to `blocks_hu`. A no-op ("ok" without a
 * model call) once `blocks_hu` already holds a real translation — `parseTranslatedBlocks` decides
 * that, same rule as the read path, so `[]`/garbage jsonb there is retried here too.
 */
export async function translatePost(db: SupabaseClient, postId: number): Promise<TranslateResult> {
  const { data: post } = await db.from("posts").select("id, blocks, blocks_hu").eq("id", postId).maybeSingle();
  if (!post) return "not_found";
  if (parseTranslatedBlocks(post.blocks_hu)) return "ok";

  const blocks = parseBlocks(post.blocks);
  const chunks = chunkTranslatable(translatable(blocks));
  try {
    const answers = await mapLimited(chunks, CHUNK_CONCURRENCY, (chunk) =>
      generate(db, "translate_post", translationSchema, `${TRANSLATE_INSTRUCTIONS}\n\n${JSON.stringify(chunk)}`),
    );
    const translated = applyTranslation(blocks, answers.flatMap((answer) => answer.blocks));
    if (!translated) return "shape";
    // Partial upsert: only `blocks_hu` is in the payload, so the conflict update touches nothing else.
    const { error } = await db.from("posts").upsert({ id: post.id, blocks_hu: translated });
    if (error) throw error;
    return "ok";
  } catch (error) {
    console.warn(`translate ${post.id}: ${error instanceof Error ? error.message : error}`);
    return "failed";
  }
}
