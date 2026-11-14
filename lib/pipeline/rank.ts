import type { DigestCategory } from "../../data/digest-types.ts";
import type { Candidate } from "./collect.ts";

// What decides a candidate without a model: how alike two headlines are, how fresh, popular and trusted a story
// is, its category and reading time, and how the rule score and the model's relevance combine into the 0–100
// score the rest of the app reads (the Top 3, the daily Top 10, the Library mirror's 85).

const DAY = 86_400_000;

/** Two headlines this alike (Jaccard over their words) tell one story. */
export const SAME_STORY = 0.6;

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "with", "is", "are", "at", "by", "from", "new", "how", "why", "what", "its", "it", "as", "your", "you"]);

/** A headline's distinctive words, lower-case, without punctuation and filler. */
export function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => (word.length > 1 || /\d/.test(word)) && !STOP.has(word)), // a lone digit tells Claude 4 from Claude 5
  );
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Drops a candidate that retells a story already covered (a stored title) or that a better source in this run
 * already tells; of two alike, the higher `weight` stays (the lab's own post over its coverage), the earlier on a tie.
 */
export function dropRepeatedStories(candidates: Candidate[], coveredTitles: string[]): Candidate[] {
  const covered = coveredTitles.map(words);
  const fresh = candidates.filter((candidate) => {
    const own = words(candidate.title);
    return !covered.some((title) => similarity(own, title) >= SAME_STORY);
  });
  const kept: { candidate: Candidate; words: Set<string> }[] = [];
  for (const candidate of fresh) {
    const own = words(candidate.title);
    const twin = kept.findIndex((entry) => similarity(own, entry.words) >= SAME_STORY);
    if (twin === -1) kept.push({ candidate, words: own });
    else if (candidate.weight > kept[twin].candidate.weight) kept[twin] = { candidate, words: own };
  }
  return kept.map((entry) => entry.candidate);
}

const ageDays = (candidate: Candidate, now: Date) => Math.max(0, (now.getTime() - Date.parse(`${candidate.publishedAt}T12:00:00Z`)) / DAY);

/** 0–1 from what the feed itself tells: the source's trust (`weight`, 1 is neutral), freshness (a 2-day half-life)
 *  and popularity (Hacker News points, Hugging Face upvotes, on a log scale that tops out at 500). */
export function ruleScore(candidate: Candidate, now: Date): number {
  const trust = Math.min(candidate.weight / 1.5, 1);
  const fresh = 0.5 ** (ageDays(candidate, now) / 2);
  const popular = Math.min(Math.log1p(candidate.points) / Math.log1p(500), 1);
  return 0.45 * trust + 0.3 * fresh + 0.25 * popular;
}

const LOCAL = /\b(ollama|llama\.cpp|gguf|ggml|vllm|lm studio|local(ly)?|on-device|open[- ]weights?|quantiz\w*|self-host\w*|run (it )?on (your|a) (laptop|gpu|mac))\b/i;
const RESEARCH = /\b(paper|arxiv|benchmark|dataset|we (propose|present|show)|study|survey|theorem|ablation)\b/i;

/** The category a feed's own hint can't tell (Hacker News is one hint for everything): by the headline's words. */
export function categoryFor(candidate: Candidate): DigestCategory {
  if (candidate.hint !== "companies" || !candidate.source.startsWith("Hacker News")) return candidate.hint;
  if (LOCAL.test(candidate.title)) return "local";
  if (RESEARCH.test(candidate.title)) return "research";
  return "companies";
}

/** A reading time a page's feed can't give: by what it is (a paper, a lab's post, a link from Hacker News). */
export function estimateMinutes(candidate: Candidate): number {
  if (candidate.url.includes("arxiv.org") || candidate.hint === "research") return 20;
  if (candidate.source.startsWith("Hacker News")) return 6;
  return candidate.hint === "local" ? 8 : 5;
}

export type Judgement = {
  /** 0–1: how relevant the reader would find it (the model's level, probability-weighted). */
  relevance: number;
  /** 0–1: the probability it is a promotion (a course, an event, a sign-up). */
  promotion: number;
};

/** What a missing judgement (the model unreachable) stands for: neither good nor bad. */
export const NEUTRAL: Judgement = { relevance: 0.5, promotion: 0 };

/** The rule score's real range on a day's feeds (measured: 0.42 for the dullest, 0.72 for the best), stretched to 0–1. */
const RULE_FLOOR = 0.35;
const RULE_SPAN = 0.4;

/**
 * The 0–100 score. Relevance leads (70%), the feed's own signals follow (30%, stretched to their real range), and a
 * likely promotion is cut down to a third. Measured on a day's live feeds: an essential story from an average
 * source scores about 85 (the Library mirror's line), from a top one about 95; an important one 65–80, a useful
 * one about 50, a marginal one about 30.
 */
export function finalScore(rule: number, judgement: Judgement): number {
  const signals = Math.min(Math.max((rule - RULE_FLOOR) / RULE_SPAN, 0), 1);
  const base = 0.7 * judgement.relevance + 0.3 * signals;
  const penalised = judgement.promotion > 0.6 ? base * 0.3 : base;
  return Math.max(0, Math.min(99, Math.round(100 * penalised)));
}
