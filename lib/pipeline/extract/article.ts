import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { plainText } from "../../blocks.ts";
import { ensureOk, readText, safeFetch } from "../fetch.ts";
import { cleanDocument } from "../html-noise.ts";
import { htmlToBlocks } from "../html-to-blocks.ts";
import { hasNoarchive, hostOf, publishedDate } from "../util.ts";
import { extractPdfResponse } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_HTML = 8 * 1024 * 1024;
const ROBOTS_META_NAMES = new Set(["robots", "googlebot"]);

export type PageMeta = {
  title?: string;
  description?: string;
  siteName?: string;
  /** From `meta[property=article:published_time]` only — the JSON-LD date is `jsonLdPublished`, kept separate so the fallback chain can validate each candidate instead of one shadowing the other. */
  published?: string;
  jsonLdPublished?: string;
  robots: string[];
};

/** Every `meta[name=robots|googlebot]` content value, name matched case-insensitively and trimmed. */
function robotsMetaValues(document: Document): string[] {
  return [...document.querySelectorAll("meta[name]")]
    .filter((meta) => ROBOTS_META_NAMES.has((meta.getAttribute("name") ?? "").trim().toLowerCase()))
    .map((meta) => meta.getAttribute("content") ?? "");
}

type JsonLdNode = { datePublished?: unknown; publisher?: { name?: unknown } };
const hasJsonLdFields = (node: unknown): node is JsonLdNode => {
  if (!node || typeof node !== "object") return false;
  const { datePublished, publisher } = node as JsonLdNode;
  return typeof datePublished === "string" || (!!publisher && typeof publisher === "object" && typeof publisher.name === "string");
};

/** A JSON-LD document can be one object, a top-level array of nodes, or an object with an `@graph`
 * array — takes the first node (in whichever shape) that actually carries a date or a publisher. */
function jsonLdNode(data: unknown): JsonLdNode | undefined {
  if (!data || typeof data !== "object") return undefined;
  if (Array.isArray(data)) return data.find(hasJsonLdFields);
  const graph = (data as { "@graph"?: unknown })["@graph"];
  if (Array.isArray(graph)) return graph.find(hasJsonLdFields);
  return hasJsonLdFields(data) ? data : undefined;
}

/**
 * `datePublished`/`publisher.name` from the page's own JSON-LD, read across every
 * `application/ld+json` script (type matched case-insensitively, with or without a `; charset=...`
 * suffix) and merged (first value found wins per field). Some sites (Substack) set no
 * `article:published_time` meta and rely on JSON-LD alone — and that JSON-LD can live in the body,
 * so this must run before `cleanDocument` strips `<script>` tags. Never throws: a malformed or
 * unrecognised script is simply skipped.
 */
function readJsonLd(document: Document): { datePublished?: string; siteName?: string } {
  let datePublished: string | undefined;
  let siteName: string | undefined;
  for (const script of document.querySelectorAll("script")) {
    if (!/^application\/ld\+json(;|$)/i.test((script.getAttribute("type") ?? "").trim())) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const node = jsonLdNode(parsed);
    if (!node) continue;
    datePublished ??= typeof node.datePublished === "string" ? node.datePublished : undefined;
    siteName ??= typeof node.publisher?.name === "string" ? node.publisher.name : undefined;
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
    published: content('meta[property="article:published_time"]'),
    jsonLdPublished: jsonLd.datePublished,
    robots: robotsMetaValues(document),
  };
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

  // First *valid* date wins — meta, then JSON-LD, then Readability's own detection — so a garbage
  // JSON-LD date (e.g. "yesterday") can't shadow a genuinely valid one further down the chain the
  // way a plain `??` merge would (any truthy string, garbage or not, stops a `??` chain cold).
  const publishedAt = publishedDate(page.published) ?? publishedDate(page.jsonLdPublished) ?? publishedDate(parsed?.publishedTime);
  return {
    blocks,
    title: parsed?.title?.trim() || page.title || finalUrl,
    author: trimByline(parsed?.byline),
    siteName: page.siteName ?? parsed?.siteName ?? hostOf(finalUrl),
    publishedAt,
    meta: hasNoarchive(...page.robots, robotsHeader) ? { noarchive: true } : {},
    text,
  };
}

export const extractArticle: Extractor = async (db, url, note) => {
  const response = await ensureOk(await safeFetch(url, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" }), "fetch");
  if ((response.headers.get("content-type") ?? "").includes("application/pdf")) return extractPdfResponse(db, url, response, note);
  return articleFromHtml(await readText(response, MAX_HTML), response.url || url, response.headers.get("x-robots-tag"));
};
