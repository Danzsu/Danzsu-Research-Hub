// Pure helpers — no framework imports, so `node --test` can load them directly.

export type Week = { id: string; label: string; period: string; compact: string; monday: Date };

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
  return { id: `${year}-W${ww}`, label: `${year} / W${ww}`, period: `${year} / ${month}`, compact: `${year}w${ww}`, monday };
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
 * `<category>-<isoweek>-<slug>-<urlhash>`. The URL hash makes the id a function of
 * the URL, so two stories with the same headline never collide on the PK.
 */
export function itemId(category: string, week: Week, title: string, url: string): string {
  return `${category}-${week.compact}-${slugify(title) || "item"}-${shortHash(url)}`.slice(0, 120);
}

export function sourceKind(url: URL): "youtube" | "article" {
  const host = url.hostname.replace(/^(www|m)\./, "");
  return host === "youtube.com" || host === "youtu.be" ? "youtube" : "article";
}

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
 * the API boundary; `safeFetch` in ingest.ts additionally resolves DNS and
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
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.startsWith("[")
  ) {
    return null;
  }
  url.hash = "";
  return url;
}

/** Display label for the 96px meta gutter: '09 / 22'. */
export function publishedLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${month} / ${day}`;
}
