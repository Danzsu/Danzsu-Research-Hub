// Pure helpers — no framework imports, so `node --test` can load them directly.

export type Week = { id: string; period: string; compact: string; monday: Date };

/** ISO-8601 week of `date` (UTC). `id` is the issues PK: '2026-W39'. */
export function isoWeek(date: Date): Week {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - weekday + 1);
  d.setUTCDate(d.getUTCDate() + 4 - weekday); // Thursday decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  const ww = String(week).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { id: `${year}-W${ww}`, period: `${year} / ${month}`, compact: `${year}w${ww}`, monday };
}

/** Monday (UTC) of an ISO week id like '2026-W39', or null if the id is malformed or out of range. */
export function isoWeekMonday(id: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4)); // 4 January is always in week 1
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
  // Round-trip rejects W00 and W53 in 52-week years.
  return isoWeek(monday).id === id ? monday : null;
}

export function slugify(text: string, max = 60): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/** FNV-1a as 8 hex chars. Not for security; only for stable, content-derived ids. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 6 hex chars of fnv1a. ⚠️ Feeds digest item ids — never change its output. */
export function shortHash(text: string): string {
  return fnv1a(text).slice(0, 6);
}

/**
 * `<category>-<yyyy>w<ww>-<slug>-<urlhash>`. The URL hash makes the id a function of
 * the URL, so two stories with the same headline never collide on the PK.
 */
export function itemId(category: string, week: Week, title: string, url: string): string {
  return `${category}-${week.compact}-${slugify(title) || "item"}-${shortHash(url)}`.slice(0, 120);
}

export type SourceKind = "article" | "youtube" | "arxiv" | "github" | "x" | "pdf";

export const isValidYoutubeId = (id: string): boolean => /^[A-Za-z0-9_-]{11}$/.test(id);

export function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null | undefined = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(url.pathname)?.[1];
  }
  if (id === "videoseries") return null; // playlist embed, not a single video
  return id && isValidYoutubeId(id) ? id : null;
}

/** The embeddable video an iframe `src` points at (YouTube or a Vimeo player), or null. */
export function videoFromUrl(src: string, baseUrl: string): { provider: "youtube" | "vimeo"; videoId: string } | null {
  let url: URL;
  try {
    url = new URL(src, baseUrl);
  } catch {
    return null;
  }
  const youtube = youtubeId(url);
  if (youtube) return { provider: "youtube", videoId: youtube };
  const vimeo = /(^|\.)player\.vimeo\.com$/.test(url.hostname) && /^\/video\/(\d+)/.exec(url.pathname)?.[1];
  return vimeo ? { provider: "vimeo", videoId: vimeo } : null;
}

export function arxivId(url: URL): string | null {
  if (!/(^|\.)arxiv\.org$/.test(url.hostname)) return null;
  const match = /^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?\/?$/i.exec(url.pathname);
  return match?.[1] ?? null;
}

const GITHUB_RESERVED = new Set(["orgs", "topics", "features", "settings", "marketplace", "sponsors", "about", "search", "explore"]);

export function githubRepo(url: URL): { owner: string; repo: string } | null {
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, repo, section] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || GITHUB_RESERVED.has(owner) || (section && section !== "tree")) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}

export function xStatusId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|mobile)\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  return /^\/[^/]+\/status\/(\d+)/.exec(url.pathname)?.[1] ?? null;
}

/** Which extractor handles a submitted link. PDFs served without a .pdf path are caught later by content type. */
export function detectSource(url: URL): SourceKind {
  if (youtubeId(url)) return "youtube";
  if (arxivId(url)) return "arxiv";
  if (githubRepo(url)) return "github";
  if (xStatusId(url)) return "x";
  if (/\.pdf$/i.test(url.pathname)) return "pdf";
  return "article";
}

/** Minutes a post must sit between re-extraction attempts — the single source of truth for both
 *  `cooldownRemaining`'s own default and `requestReextract`'s explicit claim window. */
export const REEXTRACT_COOLDOWN_MINUTES = 10;

/** Seconds until a post may be re-extracted again. */
export function cooldownRemaining(extractedAt: string | null, now: Date, minutes = REEXTRACT_COOLDOWN_MINUTES): number {
  if (!extractedAt) return 0;
  const ready = new Date(extractedAt).getTime() + minutes * 60_000;
  return Math.max(0, Math.ceil((ready - now.getTime()) / 1000));
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** The URL's own last path segment, decoded — for naming a source by its filename when nothing better is available. */
export function filenameOf(url: string): string | undefined {
  const segment = new URL(url).pathname.split("/").findLast(Boolean);
  if (!segment) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Route and page ids: positive integers only. */
export const parseId = (raw: string): number | null => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null);

/** Loopback, private, link-local, CGNAT, multicast/reserved, and their IPv4-mapped IPv6 forms. */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return (
    address === "::" || address === "::1" ||
    /^f[cd]/.test(address) ||     // fc00::/7 unique local
    /^fe[89ab]/.test(address) ||  // fe80::/10 link-local
    /^ff/.test(address) ||        // multicast
    address.startsWith("::ffff:") // mapped in hex form
  );
}

/**
 * Parses a user-submitted link. Rejects non-http(s) and obvious internal hosts at
 * the API boundary; `safeFetch` in fetch.ts additionally resolves DNS and
 * re-checks every redirect hop.
 */
export function parseSubmittedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    host.startsWith("[") || // every IPv6 literal
    // IPv4 literals only: isPrivateAddress' IPv6 prefix rules would also match "ffmpeg.org".
    (/^[\d.]+$/.test(host) && isPrivateAddress(host))
  ) {
    return null;
  }
  url.hash = "";
  return url;
}

const SAME_SITE = "https://same.site";

/**
 * Only same-site paths survive; anything else falls back to `/`. Checked on the parsed URL, not the
 * string: the URL parser drops tab/newline, reads `\` as `/` and resolves dot-segments, so both
 * `/\t/evil.com` and `/..//evil.com` can turn into `//evil.com`. The returned path must itself
 * resolve on this site, because the caller resolves it again.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const url = new URL(value, SAME_SITE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === SAME_SITE && new URL(path, SAME_SITE).origin === SAME_SITE ? path : "/";
  } catch {
    return "/";
  }
}

/**
 * A raw date as YYYY-MM-DD, or null. An ISO-looking prefix is kept as written (its own calendar
 * day, whatever the offset) only if it is a real date: `published_at` is a Postgres `date`, and JS's
 * Date silently rolls "2026-02-30" into March. Anything else goes through Date.parse and is reported
 * as its UTC day; a string with no zone of its own is read in the server's local time first.
 */
export function publishedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const prefix = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
  if (prefix) {
    const date = new Date(`${prefix}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === prefix ? prefix : null;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/** The header's freeze date: the Sunday of the ISO week starting `monday`, as 'MM. DD.'. */
export function archiveLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return `${String(sunday.getUTCMonth() + 1).padStart(2, "0")}. ${String(sunday.getUTCDate()).padStart(2, "0")}.`;
}

/** Display label for the 96px meta gutter: '09 / 22'. */
export function publishedLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${month} / ${day}`;
}

/** Normalizes an XML-parsed field that's absent, a single value, or (when repeated) an array. */
export function list<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** An XML-parsed leaf value as a string: a plain string, a number (parseTagValue), or an
 * attributes-mixed `{ "#text": ... }` wrapper (ignoreAttributes: false). */
export function xmlText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return xmlText((value as { "#text": unknown })["#text"]);
  return "";
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** True if any of the given robots-directive strings turns off archiving, case-insensitively. */
export function hasNoarchive(...values: (string | null | undefined)[]): boolean {
  return values.some((value) => value && /noarchive/i.test(value));
}

/**
 * Runs `items` through `work`, at most `limit` in flight, results kept in the original order.
 * Once any `work()` call rejects, no further items are dispatched — calls already in flight still
 * run to completion, but `mapLimited` itself rejects with the first error once every worker settles.
 */
export async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length && !failed; i = next++) {
        try {
          results[i] = await work(items[i]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  return results;
}
