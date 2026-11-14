import type { DigestCategory } from "../../data/digest-types.ts";
import type { Candidate } from "./collect.ts";
import type { Judgement } from "./rank.ts";
import { errorMessage } from "./util.ts";

// Gemini Decision 1: one request judges every candidate at once. It answers typed questions about one shared
// input with calibrated probabilities (no generated text), in about a fifth of a second for hundreds of
// questions (https://aistudio.google.com/docs/decisions-api). Plain fetch, like lib/llm.ts. The model id lives
// here, not in model_settings: that table's tasks are generateContent calls.

const URL_DECISIONS = "https://generativelanguage.googleapis.com/v1beta/decisions";
const MODEL = "gemini-decision-1";
const TIMEOUT_MS = 30_000;

const AUDIENCE = "a hands-on AI engineer who runs local models, follows research and tracks what frontier AI companies ship, and wants signal, not hype";

// Ordered lowest to highest; the answer's `score` is the probability-weighted level, 0 to LEVELS.length - 1.
const RELEVANCE_LEVELS = [
  "Irrelevant: not about AI, or marketing with no substance",
  "Marginal: AI-adjacent, or a minor incremental update",
  "Useful: a solid article, tool or result an AI engineer would skim",
  "Important: a notable release, method or analysis worth reading today",
  "Essential: a major release or finding the reader must not miss",
];

const CATEGORIES: Record<DigestCategory, string> = {
  local: "Local or open models, inference engines and tooling you run yourself",
  research: "Research: papers, methods, benchmarks and analyses",
  companies: "What AI companies ship or announce: products, models, funding, policy",
  github: "A notable code repository",
};

/** The categories a story can have: a repository is picked apart from the news. */
const CHOICES = Object.fromEntries(Object.entries(CATEGORIES).filter(([id]) => id !== "github"));

export type Decided = Judgement & { category: DigestCategory };

type Answer = { type: string; score?: number; noul?: number; choice?: string };

/** The listing the questions are about: one numbered block per candidate. */
function inputFor(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => `[${i}] ${c.title} — ${c.source}${c.snippet ? `\n${c.snippet.slice(0, 280)}` : ""}`)
    .join("\n\n");
}

/** Three questions per candidate: its relevance (a score), whether it is a promotion (yes/no) and its category (a choice). */
export function questionsFor(count: number) {
  const questions: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    questions[`r${i}`] = {
      type: "score",
      instructions: `How relevant is item [${i}] to ${AUDIENCE}?`,
      criteria: RELEVANCE_LEVELS,
    };
    questions[`p${i}`] = {
      type: "noul",
      instructions: `Is item [${i}] a promotion: a course, event or product sign-up, a sale, a sponsored post or an advertisement, rather than news or substance?`,
    };
    questions[`c${i}`] = {
      type: "choice",
      instructions: `Which category fits item [${i}] best?`,
      criteria: CHOICES,
    };
  }
  return questions;
}

/** The answers as one judgement per candidate; a candidate whose answers are missing or malformed is left out. */
export function judgements(answers: Record<string, Answer | undefined>, count: number): Map<number, Decided> {
  const decided = new Map<number, Decided>();
  const categories = new Set<string>(Object.keys(CHOICES));
  for (let i = 0; i < count; i++) {
    const relevance = answers[`r${i}`]?.score;
    const promotion = answers[`p${i}`]?.noul;
    const category = answers[`c${i}`]?.choice;
    if (typeof relevance !== "number" || typeof promotion !== "number" || !category || !categories.has(category)) continue;
    decided.set(i, {
      relevance: Math.min(Math.max(relevance / (RELEVANCE_LEVELS.length - 1), 0), 1),
      promotion,
      category: category as DigestCategory,
    });
  }
  return decided;
}

/**
 * Judges every candidate in one request. Throws on a missing key, a failed or refused request; the caller falls
 * back to the rule score alone, so the day's run never depends on it.
 */
export async function decide(candidates: Candidate[]): Promise<Map<number, Decided>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  if (!candidates.length) return new Map();
  try {
    const response = await fetch(URL_DECISIONS, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ model: MODEL, input: inputFor(candidates), questions: questionsFor(candidates.length) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 300)}`);
    const { answers } = (await response.json()) as { answers?: Record<string, Answer> };
    return judgements(answers ?? {}, candidates.length);
  } catch (error) {
    throw new Error(`gemini decisions failed: ${errorMessage(error)}`, { cause: error });
  }
}
