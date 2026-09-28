import type { Localized } from "../data/digest-types.ts";
import type { Block, ImageBlock } from "./blocks.ts";
import { isMediaKey, mediaUrl, variantPath } from "./media.ts";
import type { Overrides } from "./overrides.ts";
import { isValidYoutubeId, type SourceKind } from "./pipeline/util.ts";

// Pure helpers for the post page and its renderer. Kept framework-free (no React, no
// server-only imports) so `node --test` can load them directly and post-blocks.tsx stays thin, and
// zod-free, because the editor and post-blocks.tsx bring it into the browser (lib/client-bundle.test.ts):
// blocks.ts and overrides.ts come in as types only. Parsing a posts row is lib/post-row.ts's job.

export type PostMeta = {
  mirrored?: boolean;
  noarchive?: boolean;
  extractionFailed?: boolean;
  truncated?: boolean;
  clipped?: boolean;
};

export type Post = {
  id: number;
  sourceId: number;
  kind: SourceKind;
  url: string;
  author: string | null;
  siteName: string | null;
  publishedAt: string | null;
  title: Localized;
  summary: Localized;
  /** The model's own text, before any submitter override — the editor's "reset" target and the
   *  baseline `editPayload` (below) diffs a draft against to decide what to save. */
  generatedTitle: Localized;
  generatedSummary: Localized;
  keyPoints: Record<"hu" | "en", string[]>;
  tags: string[];
  blocks: Block[];
  blocksHu: Block[] | null;
  meta: PostMeta;
  hiddenBlocks: string[];
  submittedBy: string | null;
  /** The source's last extraction error: a re-extraction failed and the post kept its content. A good run clears it. */
  lastError: string | null;
  extractedAt: string | null;
  createdAt: string;
};

/** The title readers see: the submitter's override (already through `readOverrides`) wins over the
 *  model's `title` (the post page, the link chat). */
export const shownTitle = (title: unknown, overrides: Overrides): Localized => overrides.title ?? (title as Localized);

/**
 * The PATCH body for a save: `title`/`summary` are included only when `draft` differs from the
 * model's own text (`post.generatedTitle`/`generatedSummary`) — an unchanged or reset field must
 * not freeze the model's text as a permanent override, and omitting a field that currently has one
 * clears it (the RPC replaces `overrides` wholesale, it doesn't merge). Compared trimmed: the
 * server trims on save (`localizedField` in overrides.ts), so an untrimmed comparison here would
 * treat "Model " as a real edit and send a same-content override just for the trailing space.
 */
export function editPayload(
  post: { generatedTitle: Localized; generatedSummary: Localized },
  draft: { title: Localized; summary: Localized },
  hidden: string[],
): { title?: Localized; summary?: Localized; hidden: string[] } {
  const sameAs = (a: Localized, b: Localized) => a.hu.trim() === b.hu.trim() && a.en.trim() === b.en.trim();
  const title = sameAs(draft.title, post.generatedTitle) ? undefined : draft.title;
  const summary = sameAs(draft.summary, post.generatedSummary) ? undefined : draft.summary;
  return { ...(title && { title }), ...(summary && { summary }), hidden };
}

export const isValidVimeoId = (id: string): boolean => /^\d+$/.test(id);

/** Only a data: URL of an image the pipeline itself produces — never `svg` (stored-XSS risk elsewhere in the pipeline). */
export const isValidPlaceholder = (value: string): boolean => /^data:image\/(avif|webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);

export type MediaSources = { src: string; srcSet: string };

/**
 * `path` only ever comes from `imageKey` (pipeline/images.ts) — neither the RPC nor the
 * translation path can set or touch it. Null unless `path`/`format`/every declared width together
 * still form a real `/media` key (the same shape `isMediaKey` guards on the route itself); that
 * render-time check is defense in depth, not the only thing keeping a crafted path from smuggling
 * an off-origin URL into the srcset.
 */
export function mediaSources(block: ImageBlock): MediaSources | null {
  const { path, format, widths } = block;
  if (!path || !format || !widths?.length) return null;
  if (!widths.every((width) => isMediaKey(variantPath(path, width, format)))) return null;
  return {
    src: mediaUrl(path, Math.max(...widths), format),
    srcSet: widths.map((width) => `${mediaUrl(path, width, format)} ${width}w`).join(", "),
  };
}

type VideoBlock = Extract<Block, { type: "video" }>;

/** Null when the id fails validation — the caller renders nothing rather than an iframe pointed at an unvalidated string. */
export function videoEmbedSrc(block: VideoBlock, opts: { start?: number; autoplay?: boolean } = {}): string | null {
  const start = opts.start ?? block.start;
  if (block.provider === "youtube") {
    if (!isValidYoutubeId(block.videoId)) return null;
    const params = new URLSearchParams();
    if (start) params.set("start", String(start));
    if (opts.autoplay && start) params.set("autoplay", "1");
    const qs = params.toString();
    return `https://www.youtube-nocookie.com/embed/${block.videoId}${qs ? `?${qs}` : ""}`;
  }
  if (!isValidVimeoId(block.videoId)) return null;
  const params = new URLSearchParams({ dnt: "1" });
  const hash = start ? `#t=${start}s` : "";
  return `https://player.vimeo.com/video/${block.videoId}?${params.toString()}${hash}`;
}

/**
 * The id of the block that gets the `#video` anchor, the `?t=` override and autoplay: the first
 * *visible* block (already filtered for hidden/showHidden by the caller) whose embed actually
 * validates — an invalid video block must not claim the anchor and leave a later, valid one
 * without it. Null if there's no such block.
 */
export function primaryVideoId(visibleBlocks: Block[]): string | null {
  for (const block of visibleBlocks) {
    if (block.type === "video" && videoEmbedSrc(block) !== null) return block.id;
  }
  return null;
}

/**
 * Whether a block should render at all: a block that isn't hidden always does; a hidden one only
 * renders when the caller asked to see hidden blocks (`showHidden`) or is in edit mode
 * (`controlsMode`, dimmed rather than skipped). The one rule `PostBlocks` needs in two places —
 * building its `visibleBlocks` list and deciding whether to skip a block in its render loop.
 */
export function isBlockVisible(blockId: string, hiddenSet: Set<string>, showHidden: boolean, controlsMode: boolean): boolean {
  return showHidden || controlsMode || !hiddenSet.has(blockId);
}

/** The post page's own query params: kept as one shape so every in-page link (chapters, hidden-blocks) can carry all of them forward. */
export type PostQuery = { text?: string; hidden?: string; t?: string; edit?: string };
const POST_QUERY_KEYS: (keyof PostQuery)[] = ["text", "hidden", "t", "edit"];

/** `current`, overlaid with `updates`, serialized back to a `?a=b&c=d` string (or `""`). */
export function withQuery(current: PostQuery, updates: Partial<PostQuery>): string {
  const merged: PostQuery = { ...current, ...updates };
  const params = new URLSearchParams();
  for (const key of POST_QUERY_KEYS) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
