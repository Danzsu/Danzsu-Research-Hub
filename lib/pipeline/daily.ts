import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { digestTags, inBoth, type DigestCategory } from "../../data/digest-types.ts";
import { generate } from "../llm.ts";
import { collectCandidates, collectRepos, type Candidate, type Repo } from "./collect.ts";
import { decide } from "./decisions.ts";
import { budapestDay, budapestDayStart, pickDailyTop, type DailyCandidate } from "./daily-top.ts";
import { categoryFor, dropRepeatedStories, estimateMinutes, finalScore, NEUTRAL, ruleScore } from "./rank.ts";
import { errorMessage, isoWeek, itemId, urlKey, type Week } from "./util.ts";

const DAY = 86_400_000;
/** The candidates the model judges, the best of the rule score; the rest never reach it. */
const PRESELECT = 60;
/** Under this score a story isn't worth a card. */
const MIN_SCORE = 35;
/** A promotion this likely is dropped, whatever else it scores. */
const PROMOTION_LIMIT = 0.6;
const MAX_NEW_ITEMS = 25;
/** The covered titles the curate prompt lists, the latest first. */
const MAX_COVERED = 400;

const curatedSchema = z.object({
  items: z.array(
    z.object({
      index: z.int(),
      tags: z.array(z.enum(digestTags)).max(4),
      title: z.string(),
      summary: z.string(),
      why: z.string(),
    }),
  ),
  github: z.array(z.object({ index: z.int(), focus: z.string(), score: z.int().min(0).max(100) })),
});

const AUDIENCE =
  "The reader is a hands-on AI engineer who runs local models, follows research, " +
  "and tracks what frontier AI companies ship. They want signal, not hype.";

function listing(candidates: Candidate[]) {
  return candidates
    .map((c, i) => `[${i}] (${c.hint}) ${c.title} — ${c.source}${c.snippet ? `\n    ${c.snippet.slice(0, 280)}` : ""}`)
    .join("\n");
}

/** A candidate with what the rules and the model's judgement made of it: the fields a `digest_items` row needs. */
export type Scored = Candidate & { category: DigestCategory; score: number; readMinutes: number };

/**
 * The day's stories, scored: the rule score (source, freshness, popularity) picks the PRESELECT best, Gemini
 * Decision 1 judges their relevance, promotion and category in one request, and `finalScore` combines them. If the
 * model is unreachable the rule score alone decides (a neutral judgement), so the run never depends on it. Likely
 * promotions and stories under MIN_SCORE are dropped; the best MAX_NEW_ITEMS stay, best first.
 */
export async function scoreCandidates(candidates: Candidate[], now: Date, judge: typeof decide = decide): Promise<Scored[]> {
  const ranked = candidates
    .map((candidate) => ({ candidate, rule: ruleScore(candidate, now) }))
    .sort((a, b) => b.rule - a.rule)
    .slice(0, PRESELECT);
  let judged: Awaited<ReturnType<typeof decide>> = new Map();
  try {
    judged = await judge(ranked.map((entry) => entry.candidate));
  } catch (error) {
    console.warn(`decisions failed, scoring by the rules alone: ${errorMessage(error)}`);
  }
  return ranked
    .map(({ candidate, rule }, i): Scored & { promotion: number } => {
      const decided = judged.get(i);
      const judgement = decided ?? NEUTRAL;
      return {
        ...candidate,
        category: decided?.category ?? categoryFor(candidate),
        score: finalScore(rule, judgement),
        readMinutes: estimateMinutes(candidate),
        promotion: judgement.promotion,
      };
    })
    .filter((story) => story.promotion <= PROMOTION_LIMIT && story.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NEW_ITEMS);
}

/** The curation prompt: numbered NEWS and REPOS listings the model answers with indices into. */
export function curatePrompt(picked: Candidate[], repos: Repo[], covered: string[] = []): string {
  return `${AUDIENCE}
You curate NEON NEWS RADAR, an AI digest. Write each text once, in the language of the story's own listing (usually English); never translate.

PART 1 — news. Every numbered NEWS item below is already chosen, categorised and scored: write each one up and return all of them in "items".
- tags: 1–4 from the allowed vocabulary only.
- title: short, concrete headline. summary: 2–3 sentences on what it is. why: one sentence on why it matters to the reader.
- Use only facts present in the listing. Do not invent numbers or claims.
- One story, one item: when several NEWS entries report the same story, keep the one from the primary source (the lab, company or author) and skip the rest.${covered.length ? "\n- Skip a story the ALREADY COVERED list below already told, unless it brings a substantial new development." : ""}

PART 2 — repositories. From the numbered REPOS list, choose the 10 most useful (skip awesome-lists and spam) and return them in "github" with a focus line of at most 8 English words and a score from 0 to 100 on the same scale as the news (how useful it is to the reader).

${covered.length ? `ALREADY COVERED (the last 14 days' stories):\n${covered.slice(0, MAX_COVERED).map((title) => `- ${title}`).join("\n")}\n\n` : ""}NEWS:
${listing(picked)}

REPOS:
${repos.map((r, i) => `[${i}] ${r.repo} (${r.stars}★${r.language ? `, ${r.language}` : ""}) — ${r.focus}`).join("\n")}`;
}

/**
 * The model's answer as `digest_items` and `github_top` rows. Indices it made up are dropped; the
 * repo list is capped at 10 and ranked in answer order. ⚠️ `itemId` makes half of `item_states`'
 * primary key from the category, week, English title and source URL: never change those inputs.
 */
export function toDigestRows(curated: z.infer<typeof curatedSchema>, picked: Scored[], repos: Repo[], week: Week) {
  const items = curated.items
    .filter((item) => picked[item.index])
    .map((item) => {
      const source = picked[item.index];
      return {
        id: itemId(source.category, week, item.title, source.url),
        issue_id: week.id,
        category: source.category,
        score: source.score,
        read_minutes: source.readMinutes,
        published_at: source.publishedAt,
        source: source.source,
        url: source.url,
        tags: item.tags,
        title: inBoth(item.title),
        summary: inBoth(item.summary),
        why: inBoth(item.why),
      };
    });
  const top = curated.github
    .filter((entry) => repos[entry.index])
    .slice(0, 10)
    .map((entry, i) => {
      const repo = repos[entry.index];
      return { issue_id: week.id, rank: i + 1, repo: repo.repo, focus: entry.focus, url: repo.url, stars: repo.stars, language: repo.language, score: entry.score };
    });
  return { items, top };
}

export async function runDaily(db: SupabaseClient, now = new Date()) {
  const week = isoWeek(now);

  const { error: issueError } = await db
    .from("issues")
    .upsert({ id: week.id, period: week.period, updated_at: now.toISOString() });
  if (issueError) throw issueError;

  // Anything already stored in the last two weeks is not news again, by URL here and by story in the prompt.
  const { data: recent, error: recentError } = await db
    .from("digest_items")
    .select("url, title")
    .gte("created_at", new Date(now.getTime() - 14 * DAY).toISOString())
    .order("created_at", { ascending: false });
  if (recentError) throw recentError;
  const known = new Set((recent ?? []).map((row) => urlKey(row.url as string)));
  const covered = (recent ?? []).map((row) => (row.title as { en?: string } | null)?.en).filter((title): title is string => Boolean(title));

  const [candidates, repos] = await Promise.all([
    collectCandidates(new Date(now.getTime() - 2 * DAY), now).then((all) => all.filter((c) => !known.has(urlKey(c.url)))),
    collectRepos(now),
  ]);
  const picked = await scoreCandidates(dropRepeatedStories(candidates, covered), now);

  const curated = await generate(db, "daily_curate", curatedSchema, curatePrompt(picked, repos, covered));
  const { items, top } = toDigestRows(curated, picked, repos, week);

  let fresh: DailyCandidate[] = [];
  if (items.length) {
    // ignoreDuplicates: an existing row (same URL) is never rewritten — ids are permanent. The rows answered
    // are the ones written, so an item the upsert skipped never gets a daily_top row.
    const { data, error } = await db.from("digest_items").upsert(items, { onConflict: "url", ignoreDuplicates: true }).select("id, score, read_minutes");
    if (error) throw error;
    fresh = (data ?? []) as DailyCandidate[];
  }
  if (top.length) {
    const { error } = await db.from("github_top").upsert(top, { onConflict: "issue_id,rank" });
    if (error) throw error;
    // Yesterday's ranks past today's list would stay as stale rows: the upsert only touches ranks 1..N.
    const { error: trimError } = await db.from("github_top").delete().eq("issue_id", week.id).gt("rank", top.length);
    if (trimError) throw trimError;
  }

  // Both run whichever fails: a failed daily list must not leave the week's Top 3 stale, nor a failed refresh
  // cost the day's list. The run still fails on either.
  const { error: rpcError } = await db.rpc("refresh_must_read", { p_issue: week.id });
  const daily = await writeDailyTop(db, now);
  if (rpcError) throw rpcError;

  return { issue: week.id, candidates: candidates.length, shortlisted: picked.length, inserted: fresh.length, repos: top.length, daily };
}

/**
 * The day's Top 10 (spec N4, N6). Every item added since Budapest's midnight competes, whichever run added it:
 * a re-run, a run after a failed one, or the first evening after a morning run ranks the whole day, and the list
 * only improves. Answers how many it ranked.
 */
async function writeDailyTop(db: SupabaseClient, now: Date): Promise<number> {
  const day = budapestDay(now);
  const { data, error } = await db
    .from("digest_items")
    .select("id, score, read_minutes")
    .gte("created_at", budapestDayStart(now).toISOString())
    .order("created_at");
  if (error) throw error;
  const daily = pickDailyTop((data ?? []) as DailyCandidate[]);
  if (!daily.length) return 0;
  const { error: upsertError } = await db.from("daily_top").upsert(daily.map((item, index) => ({ day, rank: index + 1, item_id: item.id })), { onConflict: "day,rank" });
  if (upsertError) throw upsertError;
  // Like github_top: an earlier run's ranks past today's list would stay behind.
  const { error: trimError } = await db.from("daily_top").delete().eq("day", day).gt("rank", daily.length);
  if (trimError) throw trimError;
  return daily.length;
}
