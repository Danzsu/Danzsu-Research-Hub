import { z } from "zod/v4";
import { assignIds, type BlockDraft } from "../../blocks.ts";
import { generate } from "../../llm.ts";
import { cancelBody, FetchError } from "../fetch.ts";
import { SUMMARY_INSTRUCTIONS, summarySchema } from "../summary.ts";
import { youtubeId } from "../util.ts";
import type { Extracted, Extractor } from "./types.ts";

const videoSchema = summarySchema.extend({
  chapters: z.array(z.object({ seconds: z.int().min(0), title: z.string() })).max(40),
});

type OembedInfo = { title?: string; author_name?: string };

/**
 * oEmbed's own signal for whether the video can be embedded at all. 400/404 mean the video doesn't
 * exist (or is private) — that's the whole submission failing, so it throws FetchError. Everything
 * else that isn't a clean 200 (a network error/timeout, or 401/403 for embedding disabled) just means
 * no title/author to enrich with; the Gemini call below still runs on the watch URL itself.
 */
async function fetchOembed(watchUrl: string): Promise<OembedInfo> {
  let response: Response;
  try {
    response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return {};
  }
  if (response.ok) return (await response.json()) as OembedInfo;
  await cancelBody(response);
  if (response.status === 400 || response.status === 404) throw new FetchError("youtube video not found");
  return {};
}

/** Gemini failed (or the video is otherwise un-transcribable): the embed and oEmbed's own metadata is
 * the best we can do. Never fetches the watch page — it's JS-rendered, so Readability on it is junk. */
function videoOnly(id: string, title: string, author: string | null): Extracted {
  return {
    blocks: assignIds([{ type: "video", provider: "youtube", videoId: id }]),
    title,
    author,
    siteName: "YouTube",
    publishedAt: null,
    meta: { extractionFailed: true, videoId: id },
    text: author ? `${title} — ${author}` : title,
  };
}

// One model call writes the summary and the chapters; the video itself is only embedded.
export const extractYoutube: Extractor = async (db, url, note) => {
  const id = youtubeId(new URL(url));
  if (!id) throw new Error("not a YouTube video URL");
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const info = await fetchOembed(watchUrl);
  const title = info.title ?? watchUrl;
  const author = info.author_name ?? null;

  let generated: z.infer<typeof videoSchema>;
  try {
    generated = await generate(
      db,
      "ingest_video",
      videoSchema,
      `${SUMMARY_INSTRUCTIONS}\n- chapters: the video's sections in order, each with its start time in whole seconds (empty if it has no clear sections).\nThe source is the attached YouTube video "${title}".${note}`,
      { youtubeUrl: watchUrl },
    );
  } catch {
    return videoOnly(id, title, author);
  }

  const { chapters, ...rest } = generated;
  const sortedChapters = [...chapters].sort((a, b) => a.seconds - b.seconds);
  const drafts: BlockDraft[] = [{ type: "video", provider: "youtube", videoId: id }];
  if (sortedChapters.length) drafts.push({ type: "chapters", items: sortedChapters });
  return {
    blocks: assignIds(drafts),
    title,
    author,
    siteName: "YouTube",
    publishedAt: null,
    meta: { videoId: id },
    text: "",
    generated: rest,
  };
};
