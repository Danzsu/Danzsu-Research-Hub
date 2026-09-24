import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { plainText } from "../../blocks.ts";
import { cancelBody, FetchError, readText, safeFetch } from "../fetch.ts";
import { cleanDocument, htmlToBlocks } from "../html-to-blocks.ts";
import { hostOf } from "../util.ts";
import { extractPdfResponse } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_HTML = 8 * 1024 * 1024;

export type PageMeta = { title?: string; description?: string; siteName?: string; published?: string; robots: string };

/** The page's own metadata; also the last-resort content of `metadataOnly`. */
export function readPageMeta(document: Document): PageMeta {
  const content = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
  return {
    title: content('meta[property="og:title"]') ?? (document.querySelector("title")?.textContent?.trim() || undefined),
    description: content('meta[property="og:description"]') ?? content('meta[name="description"]'),
    siteName: content('meta[property="og:site_name"]'),
    published: content('meta[property="article:published_time"]'),
    robots: content('meta[name="robots"]') ?? "",
  };
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
    author: (parsed?.byline ?? null)?.slice(0, 120) ?? null,
    siteName: page.siteName ?? hostOf(finalUrl),
    publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null,
    meta: /noarchive/i.test(`${page.robots} ${robotsHeader ?? ""}`) ? { noarchive: true } : {},
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
