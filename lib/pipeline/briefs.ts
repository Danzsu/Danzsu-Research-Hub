import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { originalText, type Localized } from "../../data/digest-types.ts";
import { parseBlocks, plainText } from "../blocks.ts";
import { readBrief } from "../brief.ts";
import { generate } from "../llm.ts";
import { itemSources } from "../my-sources.ts";
import { budapestDay } from "./daily-top.ts";
import { NOT_INSTRUCTIONS } from "./summary.ts";
import { errorMessage } from "./util.ts";

// The one place a post gets a model-written text: the day's Top 10 get a 2–3 minute brief, all in a single call
// (2026-11-14 decision). Every other post reads its mirrored page, summarized by rule (quick-summary.ts).

/** Per post, what the model reads: enough for the story, bounded for ten of them in one request. */
const BRIEF_SOURCE_CHARS = 6_000;
/** A post thinner than this has no brief to write (a tweet, a video with no transcript). */
const MIN_SOURCE_CHARS = 600;

const briefsSchema = z.object({
  briefs: z.array(z.object({ id: z.number(), paragraphs: z.array(z.string()).min(1).max(6) })).max(20),
});

export const BRIEF_INSTRUCTIONS = `For each numbered article below, write a brief for an AI engineer who is deciding whether to open it: 3–5 short paragraphs, 300–450 words in total (shorter when the article is short; never pad).
- Write in the article's own language; never translate.
- Cover what happened, the key details and numbers, why it matters, and any caveats.
- Your own words, never the article's sentences. Only state what the article says.
- Answer one entry per article, with its number as id.`;

type BriefTarget = { id: number; title: string; text: string };

/** The day's Top 10 posts that have text enough and no brief yet. */
async function targetsFor(db: SupabaseClient, day: string): Promise<BriefTarget[]> {
  const { data, error } = await db.from("daily_top").select("item_id, digest_items(url)").eq("day", day);
  if (error) throw error;
  const items = (data ?? []).flatMap((row) => {
    const item = row.digest_items as { url?: string } | { url?: string }[] | null;
    const url = (Array.isArray(item) ? item[0] : item)?.url;
    return url ? [{ id: row.item_id as string, url }] : [];
  });
  const sources = await itemSources(db, items, "url, posts(id, title, brief, blocks)");
  const targets = new Map<number, BriefTarget>();
  for (const source of sources?.values() ?? []) {
    const embedded = source.posts as Record<string, unknown> | Record<string, unknown>[] | null;
    const post = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!post || readBrief(post.brief)) continue;
    const text = plainText(parseBlocks(post.blocks)).slice(0, BRIEF_SOURCE_CHARS);
    if (text.length < MIN_SOURCE_CHARS) continue;
    targets.set(post.id as number, { id: post.id as number, title: originalText(post.title as Localized), text });
  }
  return [...targets.values()];
}

/**
 * Writes the missing briefs of today's Top 10 posts in one model call. Answers how many it stored; failures are
 * logged, never thrown, since the cron's real work is done and the next mirror round tries again.
 */
export async function writeBriefs(db: SupabaseClient, now = new Date()): Promise<number> {
  try {
    const targets = await targetsFor(db, budapestDay(now));
    if (!targets.length) return 0;
    const listing = targets.map((target) => `ARTICLE ${target.id}: ${target.title}\n${target.text}`).join("\n\n");
    // Shares the curate task's model route: both are one daily writing call.
    const { briefs } = await generate(db, "daily_curate", briefsSchema, `${BRIEF_INSTRUCTIONS}\n${NOT_INSTRUCTIONS}\n\nSOURCE:\n${listing}`);
    const known = new Set(targets.map((target) => target.id));
    let stored = 0;
    for (const { id, paragraphs } of briefs) {
      if (!known.has(id)) continue;
      known.delete(id);
      const { error } = await db.from("posts").update({ brief: { hu: paragraphs, en: paragraphs } }).eq("id", id);
      if (error) console.warn(`brief for post ${id} not stored`, error);
      else stored++;
    }
    return stored;
  } catch (error) {
    console.warn(`briefs failed: ${errorMessage(error)}`);
    return 0;
  }
}
