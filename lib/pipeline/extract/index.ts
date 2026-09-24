import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import { cancelBody, ensureOk, FetchError, readText, safeFetch } from "../fetch.ts";
import { errorMessage, filenameOf, hostOf, type SourceKind } from "../util.ts";
import { extractArticle, readPageMeta } from "./article.ts";
import { extractArxiv } from "./arxiv.ts";
import { extractGithub } from "./github.ts";
import { extractPdf } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";
import { extractX } from "./x.ts";
import { extractYoutube } from "./youtube.ts";

const extractors: Record<SourceKind, Extractor> = {
  article: extractArticle,
  youtube: extractYoutube,
  arxiv: extractArxiv,
  github: extractGithub,
  x: extractX,
  pdf: extractPdf,
};

// The source is unreachable (or, for youtube/x, plain doesn't exist): no fallback can produce a
// better result, so the whole submission fails instead of silently downgrading to metadata-only.
const RETHROW_FETCH_ERROR: ReadonlySet<SourceKind> = new Set(["article", "x", "youtube"]);
// pdf: the article fallback would re-run the same Gemini transcription and blow maxDuration 300.
// youtube, x: both are JS-rendered and effectively login-walled, so Readability on the raw page yields junk.
const NO_ARTICLE_FALLBACK: ReadonlySet<SourceKind> = new Set(["pdf", "youtube", "x"]);

// A missing content-type still counts as HTML — the request itself asked for `Accept: text/html`.
// Whitespace before the `;` (a real server can send "text/html ; charset=...") is allowed too.
export const isHtml = (contentType: string) => !contentType || /^(text\/html|application\/xhtml\+xml)\s*(;|$)/i.test(contentType);

/**
 * Last resort: title and description only. Throws FetchError when the page itself is unreachable.
 * A non-HTML response (a PDF, an image, …) is never read — its content-type alone decides the title.
 * An HTML page is read only up to a bounded prefix: the og tags live in `<head>`, so a page over 2 MB
 * doesn't need to fail just because reading all of it would blow the limit meant for full extraction.
 */
export async function metadataOnly(url: string): Promise<Extracted> {
  const response = await ensureOk(await safeFetch(url, { accept: "text/html" }), "fetch");
  if (!isHtml(response.headers.get("content-type") ?? "")) {
    await cancelBody(response);
    const title = filenameOf(url) ?? url;
    return { blocks: [], title, author: null, siteName: hostOf(url), publishedAt: null, meta: { extractionFailed: true }, text: title };
  }
  const page = readPageMeta(parseHTML(await readText(response, 2 * 1024 * 1024, { truncate: true })).document as unknown as Document);
  const title = page.title ?? url;
  return {
    blocks: [],
    title,
    author: null,
    siteName: page.siteName ?? hostOf(url),
    publishedAt: null,
    meta: { extractionFailed: true },
    text: `${title}\n\n${page.description ?? ""}`,
  };
}

/** The source's own extractor, then the generic article one (skipped for pdf/youtube/x), then metadata only. */
export async function extract(db: SupabaseClient, kind: SourceKind, url: string, note: string): Promise<Extracted> {
  try {
    return await extractors[kind](db, url, note);
  } catch (error) {
    if (error instanceof FetchError && RETHROW_FETCH_ERROR.has(kind)) throw error;
    console.warn(`${kind} extractor failed for ${url}: ${errorMessage(error)}`);
  }
  if (!NO_ARTICLE_FALLBACK.has(kind) && kind !== "article") {
    try {
      return await extractArticle(db, url, note);
    } catch (error) {
      console.warn(`article fallback failed for ${url}: ${errorMessage(error)}`);
    }
  }
  return metadataOnly(url);
}
