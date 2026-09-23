/**
 * Content contract for the Radar view.
 *
 * These types are deliberately split out from `digest.ts`: when the ingest
 * pipeline starts generating issues it replaces the data module only, and never
 * has to touch the contract. The public surface consumed by the app is exactly
 * `currentIssue`, `digestItems`, `githubTop10`, `archiveIssues`, `DigestCategory`
 * and `Language`.
 */

export type Language = "hu" | "en";

export type DigestCategory = "local" | "research" | "companies" | "github";

/** A string that exists in both site languages. */
export type Localized = Record<Language, string>;

export type DigestItem = {
  /**
   * ⚠️ STABLE FOREVER. This value is stored as `item_states.item_id`, half of a
   * composite primary key. Renaming an id silently orphans every reader's read
   * and saved state — there is no migration that can recover the association.
   * Ids are append-only: add new ones, never rewrite existing ones.
   *
   * Format: `<category>-<isoweek>-<slug>`, max 120 characters (the API route
   * truncates beyond that).
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
  /** Lowercase, no leading `#` — the UI prepends it. Drawn from `digestTags`. */
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
