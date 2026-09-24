import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { plainText } from "../../blocks.ts";
import { cancelBody, FetchError, readText, safeFetch } from "../fetch.ts";
import { cleanDocument, htmlToBlocks } from "../html-to-blocks.ts";
import { hasNoarchive, hostOf } from "../util.ts";
import { extractPdfResponse } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_HTML = 8 * 1024 * 1024;
const ROBOTS_META_NAMES = new Set(["robots", "googlebot"]);

export type PageMeta = { title?: string; description?: string; siteName?: string; published?: string; robots: string[] };

/** Every `meta[name=robots|googlebot]` content value, name matched case-insensitively. */
function robotsMetaValues(document: Document): string[] {
  return [...document.querySelectorAll("meta[name]")]
    .filter((meta) => ROBOTS_META_NAMES.has((meta.getAttribute("name") ?? "").toLowerCase()))
    .map((meta) => meta.getAttribute("content") ?? "");
}

/**
 * `datePublished`/`publisher.name` from the page's own JSON-LD, read across every
 * `application/ld+json` script and merged (first value found wins per field). Some sites (Substack)
 * set no `article:published_time` meta and rely on JSON-LD alone — and that JSON-LD can live in the
 * body, so this must run before `cleanDocument` strips `<script>` tags.
 */
function readJsonLd(document: Document): { datePublished?: string; siteName?: string } {
  let datePublished: string | undefined;
  let siteName: string | undefined;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    if (!data || typeof data !== "object") continue;
    const { datePublished: date, publisher } = data as { datePublished?: unknown; publisher?: { name?: unknown } };
    datePublished ??= typeof date === "string" ? date : undefined;
    siteName ??= publisher && typeof publisher === "object" && typeof publisher.name === "string" ? publisher.name : undefined;
  }
  return { datePublished, siteName };
}

/** The page's own metadata; also the last-resort content of `metadataOnly`. Call before `cleanDocument`. */
export function readPageMeta(document: Document): PageMeta {
  const content = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
  const jsonLd = readJsonLd(document);
  return {
    title: content('meta[property="og:title"]') ?? (document.querySelector("title")?.textContent?.trim() || undefined),
    description: content('meta[property="og:description"]') ?? content('meta[name="description"]'),
    siteName: content('meta[property="og:site_name"]') ?? jsonLd.siteName,
    published: content('meta[property="article:published_time"]') ?? jsonLd.datePublished,
    robots: robotsMetaValues(document),
  };
}

/** A raw date's own YYYY-MM-DD is kept as-is; converting it to UTC first can shift it a day. */
export function publishedDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/** Readability's byline can run past 120 chars mid-name on a long author list; cut at the last comma instead. */
export function trimByline(byline: string | null | undefined): string | null {
  if (!byline) return null;
  if (byline.length <= 120) return byline;
  const cut = byline.slice(0, 120);
  const lastComma = cut.lastIndexOf(",");
  return (lastComma > 0 ? cut.slice(0, lastComma) : cut).trim();
}

/** Pure: page HTML → blocks and metadata. Throws when nothing readable is left. */
export function articleFromHtml(html: string, finalUrl: string, robotsHeader?: string | null): Extracted {
  const doc = parseHTML(html).document as unknown as Document;
  const page = readPageMeta(doc);
  cleanDocument(doc.body as unknown as Element, finalUrl);
  const parsed = new Readability(doc).parse();
  const blocks = htmlToBlocks(parsed?.content ?? "", { baseUrl: finalUrl });
  const text = plainText(blocks);
  if (text.length < 200) throw new Error("no readable article text found");

  const date = page.published ?? parsed?.publishedTime ?? undefined;
  return {
    blocks,
    title: parsed?.title?.trim() || page.title || finalUrl,
    author: trimByline(parsed?.byline),
    siteName: page.siteName ?? parsed?.siteName ?? hostOf(finalUrl),
    publishedAt: publishedDate(date),
    meta: hasNoarchive(...page.robots, robotsHeader) ? { noarchive: true } : {},
    text,
  };
}

export const extractArticle: Extractor = async (db, url, note) => {
  const response = await safeFetch(url, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" });
  if (!response.ok) {
    await cancelBody(response);
    throw new FetchError(`fetch ${response.status}`);
  }
  if ((response.headers.get("content-type") ?? "").includes("application/pdf")) return extractPdfResponse(db, url, response, note);
  return articleFromHtml(await readText(response, MAX_HTML), response.url || url, response.headers.get("x-robots-tag"));
};
