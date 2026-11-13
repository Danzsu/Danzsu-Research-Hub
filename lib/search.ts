import type { SupabaseClient } from "@supabase/supabase-js";

// Search over the Radar's items, the Library's posts and the GitHub repos: the `search_all` function in
// supabase/migrations/20261113000000_search.sql does the matching (words by full text, typos by trigram).

export type SearchKind = "item" | "post" | "repo";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  /** The page in this app: an item's week, a post, the repo list. */
  href: string;
  /** The original (an item's, a repo's), else null. */
  url: string | null;
  meta: string;
};

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

/** The query as typed, tidied: whitespace collapsed and the length capped. */
export const normalizeQuery = (raw: unknown): string =>
  (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);

const KINDS: readonly SearchKind[] = ["item", "post", "repo"];

/** The best `limit` matches, most relevant first; none for a query under SEARCH_MIN_LENGTH. Throws on a failed query. */
export async function searchAll(db: SupabaseClient, raw: unknown, limit = 40): Promise<SearchHit[]> {
  const q = normalizeQuery(raw);
  if (q.length < SEARCH_MIN_LENGTH) return [];
  const { data, error } = await db.rpc("search_all", { q, lim: limit });
  if (error) throw new Error(`search query failed: ${error.message}`, { cause: error });
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => KINDS.includes(row.kind as SearchKind))
    .map((row) => ({
      kind: row.kind as SearchKind,
      id: String(row.id),
      title: String(row.title ?? ""),
      snippet: String(row.snippet ?? ""),
      href: String(row.href),
      url: typeof row.url === "string" ? row.url : null,
      meta: String(row.meta ?? ""),
    }));
}
