import { z } from "zod/v4";
import { assignIds, type BlockDraft } from "../../blocks.ts";
import { generate } from "../../llm.ts";
import { cancelBody } from "../fetch.ts";
import { SUMMARY_INSTRUCTIONS, summarySchema } from "../summary.ts";
import { youtubeId } from "../util.ts";
import type { Extractor } from "./types.ts";

const videoSchema = summarySchema.extend({
  chapters: z.array(z.object({ seconds: z.int().min(0), title: z.string() })).max(40),
});

// One model call writes the summary and the chapters; the video itself is only embedded.
export const extractYoutube: Extractor = async (db, url, note) => {
  const id = youtubeId(new URL(url));
  if (!id) throw new Error("not a YouTube video URL");
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, { signal: AbortSignal.timeout(15_000) });
  let info: { title?: string; author_name?: string } = {};
  if (oembed.ok) info = (await oembed.json()) as { title?: string; author_name?: string };
  else await cancelBody(oembed);
  const title = info.title ?? watchUrl;

  const { chapters, ...generated } = await generate(
    db,
    "ingest_video",
    videoSchema,
    `${SUMMARY_INSTRUCTIONS}\n- chapters: the video's sections in order, each with its start time in whole seconds (empty if it has no clear sections).\nThe source is the attached YouTube video "${title}".${note}`,
    { youtubeUrl: watchUrl },
  );

  const drafts: BlockDraft[] = [{ type: "video", provider: "youtube", videoId: id }];
  if (chapters.length) drafts.push({ type: "chapters", items: chapters });
  return {
    blocks: assignIds(drafts),
    title,
    author: info.author_name ?? null,
    siteName: "YouTube",
    publishedAt: null,
    meta: { videoId: id },
    text: "",
    generated,
  };
};
