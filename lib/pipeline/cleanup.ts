import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { blockText, type Block } from "../blocks.ts";
import { generate } from "../llm.ts";

const cleanupSchema = z.object({ remove: z.array(z.string()) });

export const cleanupListing = (blocks: Block[]) =>
  blocks.map((block) => `${block.id} [${block.type}] ${blockText(block).replace(/\s+/g, " ").slice(0, 120)}`).join("\n");

/** Removal that would drop half the article is a model error, not cleanup. */
export function applyCleanup(blocks: Block[], remove: string[]): Block[] {
  const drop = new Set(remove);
  const kept = blocks.filter((block) => !drop.has(block.id));
  return kept.length >= blocks.length / 2 + 1 || kept.length === blocks.length ? kept : blocks;
}

/** Layer 3: a cheap model flags leftovers the rules missed. Failure just skips it. */
export async function aiCleanup(db: SupabaseClient, blocks: Block[]): Promise<Block[]> {
  if (blocks.length < 3) return blocks;
  try {
    const { remove } = await generate(
      db,
      "ingest_cleanup",
      cleanupSchema,
      `Below are the blocks of a web article, one per line: id, [type], first characters.
List in "remove" the ids of blocks that are NOT part of the article itself: ads, sponsor notes,
newsletter or subscription prompts, share/follow buttons, cookie notices, author bios, "related posts",
comment sections, navigation. When unsure, keep the block.

${cleanupListing(blocks)}`,
    );
    return applyCleanup(blocks, remove);
  } catch (error) {
    console.warn(`ai cleanup skipped: ${error instanceof Error ? error.message : error}`);
    return blocks;
  }
}
