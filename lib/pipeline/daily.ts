import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { localizedSchema } from "../blocks.ts";
import { digestCategories, digestTags } from "../../data/digest-types.ts";
import { generate } from "../llm.ts";
import { collectCandidates, collectRepos, type Candidate } from "./collect.ts";
import { isoWeek, itemId } from "./util.ts";

const DAY = 86_400_000;
const SHORTLIST = 40;
const MAX_NEW_ITEMS = 25;

const shortlistSchema = z.object({ keep: z.array(z.int()) });

const curatedSchema = z.object({
  items: z.array(
    z.object({
      index: z.int(),
      category: z.enum(digestCategories),
      score: z.int().min(0).max(100),
      readMinutes: z.int().min(1).max(120),
      tags: z.array(z.enum(digestTags)).max(4),
      title: localizedSchema,
      summary: localizedSchema,
      why: localizedSchema,
    }),
  ),
  github: z.array(z.object({ index: z.int(), focus: z.string() })).max(10),
});

const AUDIENCE =
  "The reader is a hands-on AI engineer who runs local models, follows research, " +
  "and tracks what frontier AI companies ship. They want signal, not hype.";

function listing(candidates: Candidate[]) {
  return candidates
    .map((c, i) => `[${i}] (${c.hint}) ${c.title} — ${c.source}${c.snippet ? `\n    ${c.snippet.slice(0, 280)}` : ""}`)
    .join("\n");
}

/** Cheap first pass. If every configured model fails, keeps the first SHORTLIST. */
async function shortlist(db: SupabaseClient, candidates: Candidate[]): Promise<Candidate[]> {
  if (candidates.length <= SHORTLIST) return candidates;
  try {
    const { keep } = await generate(
      db,
      "daily_shortlist",
      shortlistSchema,
      `${AUDIENCE}\nFrom the numbered list, pick up to ${SHORTLIST} items most worth their attention. ` +
        `Drop duplicates, marketing, and incremental papers. Return their numbers as "keep".\n\n${listing(candidates)}`,
    );
    const picked = [...new Set(keep)].filter((i) => candidates[i]).map((i) => candidates[i]);
    return picked.length ? picked : candidates.slice(0, SHORTLIST);
  } catch (error) {
    console.warn(`shortlist failed, keeping the first ${SHORTLIST}: ${error}`);
    return candidates.slice(0, SHORTLIST);
  }
}

export async function runDaily(db: SupabaseClient, now = new Date()) {
  const week = isoWeek(now);

  const { error: issueError } = await db
    .from("issues")
    .upsert({ id: week.id, period: week.period, updated_at: now.toISOString() });
  if (issueError) throw issueError;

  // Anything already stored in the last two weeks is not news again.
  const { data: recent, error: recentError } = await db
    .from("digest_items")
    .select("url")
    .gte("created_at", new Date(now.getTime() - 14 * DAY).toISOString());
  if (recentError) throw recentError;
  const known = new Set((recent ?? []).map((row) => row.url as string));

  const [candidates, repos] = await Promise.all([
    collectCandidates(new Date(now.getTime() - 2 * DAY)).then((all) => all.filter((c) => !known.has(c.url))),
    collectRepos(now),
  ]);
  const picked = await shortlist(db, candidates);

  const curated = await generate(
    db,
    "daily_curate",
    curatedSchema,
    `${AUDIENCE}
You curate NEON NEWS RADAR, a bilingual (Hungarian/English) AI digest.

PART 1 — news. From the numbered NEWS list, choose at most ${MAX_NEW_ITEMS} items worth reading today and return them in "items".
- category: local (local/open models, inference, tooling you run yourself), research (papers, methods), companies (what AI companies ship or announce), github (a notable repository).
- score 0–100: how much this matters to the reader. Be strict: 90+ is rare.
- readMinutes: realistic reading time of the original.
- tags: 1–4 from the allowed vocabulary only.
- title: short, concrete headline. summary: 2–3 sentences on what it is. why: one sentence on why it matters to the reader.
- Hungarian must be natural, idiomatic Hungarian — not a literal translation. Keep technical terms (LLM, fine-tuning, GGUF) as Hungarian engineers say them.
- Use only facts present in the listing. Do not invent numbers or claims.

PART 2 — repositories. From the numbered REPOS list, choose the 10 most useful (skip awesome-lists and spam) and return them in "github" with a focus line of at most 8 English words.

NEWS:
${listing(picked)}

REPOS:
${repos.map((r, i) => `[${i}] ${r.repo} (${r.stars}★) — ${r.focus}`).join("\n")}`,
  );

  const rows = curated.items
    .filter((item) => picked[item.index])
    .map((item) => {
      const source = picked[item.index];
      return {
        id: itemId(item.category, week, item.title.en, source.url),
        issue_id: week.id,
        category: item.category,
        score: item.score,
        read_minutes: item.readMinutes,
        published_at: source.publishedAt,
        source: source.source,
        url: source.url,
        tags: item.tags,
        title: item.title,
        summary: item.summary,
        why: item.why,
      };
    });

  if (rows.length) {
    // ignoreDuplicates: an existing row (same URL) is never rewritten — ids are permanent.
    const { error } = await db.from("digest_items").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw error;
  }

  const top = curated.github
    .filter((entry) => repos[entry.index])
    .slice(0, 10)
    .map((entry, i) => ({ issue_id: week.id, rank: i + 1, repo: repos[entry.index].repo, focus: entry.focus, url: repos[entry.index].url }));
  if (top.length) {
    const { error } = await db.from("github_top").upsert(top, { onConflict: "issue_id,rank" });
    if (error) throw error;
  }

  const { error: rpcError } = await db.rpc("refresh_must_read", { p_issue: week.id });
  if (rpcError) throw rpcError;

  return { issue: week.id, candidates: candidates.length, shortlisted: picked.length, inserted: rows.length, repos: top.length };
}
