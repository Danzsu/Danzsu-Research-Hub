import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import { assignIds } from "../../blocks.ts";
import { cancelBody, FetchError, readText, safeFetch } from "../fetch.ts";
import { hostOf, youtubeId, type SourceKind } from "../util.ts";
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

// pdf: the article fallback would re-run the same Gemini transcription and blow maxDuration 300.
// youtube: the watch page is JS-rendered, so Readability on it yields junk.
const NO_ARTICLE_FALLBACK: ReadonlySet<SourceKind> = new Set(["pdf", "youtube"]);

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Last resort: title and description only. Throws FetchError when the page itself is unreachable. */
export async function metadataOnly(url: string): Promise<Extracted> {
  const response = await safeFetch(url, { accept: "text/html" });
  if (!response.ok) {
    await cancelBody(response);
    throw new FetchError(`fetch ${response.status}`);
  }
  const page = readPageMeta(parseHTML(await readText(response, 2 * 1024 * 1024)).document as unknown as Document);
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

/** The source's own extractor, then the generic article one (skipped for pdf/youtube), then metadata only. */
export async function extract(db: SupabaseClient, kind: SourceKind, url: string, note: string): Promise<Extracted> {
  try {
    return await extractors[kind](db, url, note);
  } catch (error) {
    if (error instanceof FetchError && kind === "article") throw error;
    console.warn(`${kind} extractor failed for ${url}: ${failure(error)}`);
  }
  if (kind !== "article" && !NO_ARTICLE_FALLBACK.has(kind)) {
    try {
      return await extractArticle(db, url, note);
    } catch (error) {
      console.warn(`article fallback failed for ${url}: ${failure(error)}`);
    }
  }
  const result = await metadataOnly(url);
  // The embed is worth more than "extraction failed": keep it even in the last-resort result.
  const videoId = kind === "youtube" ? youtubeId(new URL(url)) : null;
  return videoId ? { ...result, blocks: assignIds([{ type: "video", provider: "youtube", videoId }]) } : result;
}
