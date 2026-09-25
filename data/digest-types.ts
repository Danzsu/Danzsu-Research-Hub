/**
 * Content contract for the Radar view. Rows come from Supabase
 * (`lib/content.ts` maps them); the daily pipeline writes them.
 */

export type Language = "hu" | "en";

export const digestCategories = ["local", "research", "companies", "github"] as const;
export type DigestCategory = (typeof digestCategories)[number];

/**
 * Controlled vocabulary. Tag filtering only produces useful clusters if the
 * vocabulary stays small — free-form tags degrade into singletons within weeks.
 */
export const digestTags = [
  "inference",
  "quantization",
  "runtime",
  "serving",
  "fine-tuning",
  "training",
  "agents",
  "evals",
  "benchmarks",
  "reasoning",
  "multimodal",
  "rag",
  "safety",
  "alignment",
  "open-weights",
  "tooling",
  "policy",
  "funding",
] as const;

/** A string that exists in both site languages. */
export type Localized = Record<Language, string>;

export type DigestItem = {
  /**
   * ⚠️ STABLE FOREVER. This value is stored as `item_states.item_id`, half of a
   * composite primary key. Renaming an id silently orphans every reader's read
   * and saved state — there is no migration that can recover the association.
   * Ids are append-only: add new ones, never rewrite existing ones.
   *
   * Format: `<category>-<yyyy>w<ww>-<slug>-<urlhash>`, from `itemId()` in
   * lib/pipeline/util.ts. Max 120 characters: `itemId()` cuts it there, and
   * `/api/state` truncates an incoming id to the same length.
   */
  id: string;
  category: DigestCategory;
  /**
   * Promotes the item into the top-3 grid. Exactly three items should set this:
   * the `nth-child(2)`/`nth-child(3)` stagger in `globals.css` only reads as a
   * deliberate composition at exactly three cards across.
   */
  mustRead?: boolean;
  /** 0–100. Rendered as `{score}/100`, so the denominator is fixed. */
  score: number;
  readMinutes: number;
  /** Pre-formatted for the 96px meta gutter; not sortable — use `publishedAt`. */
  publishedLabel: string;
  /** ISO date. Display uses `publishedLabel`; sorting and the pipeline use this. */
  publishedAt: string;
  /** Publisher or handle, rendered as plain text. The link lives in `url`. */
  source: string;
  url: string;
  /** Lowercase, no leading `#` — the UI prepends it. Drawn from `digestTags` above. */
  tags: string[];
  title: Localized;
  summary: Localized;
  why: Localized;
};

/** Positional tuple, destructured as `[repo, focus, url]` by the dashboard. */
export type GithubTopEntry = readonly [repo: string, focus: string, url: string];

export type ArchiveIssue = {
  id: string;
  /** Date-range eyebrow, e.g. `"2026 / 09"`. */
  period: string;
  /** Big display label, max ~4 chars — it renders at `font-display text-5xl`. */
  week: string;
  top: string;
  itemCount: number;
  readMinutes: number;
};

export type CurrentIssue = {
  label: string;
  /** Pre-formatted display strings, rendered verbatim. */
  updated: string;
  archiveAt: string;
};
