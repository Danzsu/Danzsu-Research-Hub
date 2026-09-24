import { parseBlocks, plainText, type Block, type ImageBlock } from "./blocks.ts";
import { isMediaKey, mediaUrl, variantPath } from "./media.ts";
import type { SourceKind } from "./pipeline/util.ts";

// Pure helpers for the post page and its renderer. Kept framework-free (no React, no
// server-only imports) so `node --test` can load them directly and post-blocks.tsx stays thin.

const WORDS_PER_MINUTE = 220;
/** Below this word count there isn't enough real text for a read-time estimate to mean anything
 * (an extraction failure or a title-only fallback can leave a handful of stray words). */
const MIN_WORDS_FOR_READ_TIME = 10;

/** Null for kinds with no reading body (youtube) and for posts with ~no extracted text. */
export function readMinutes(blocks: Block[], kind: SourceKind): number | null {
  if (kind === "youtube") return null;
  const words = plainText(blocks).trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_FOR_READ_TIME) return null;
  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
}

/** `blocks_hu` as `[]` or unparseable jsonb both mean "not translated yet", not "translated to nothing". */
export function parseTranslatedBlocks(raw: unknown): Block[] | null {
  const parsed = parseBlocks(raw);
  return parsed.length > 0 ? parsed : null;
}

export const isValidYoutubeId = (id: string): boolean => /^[A-Za-z0-9_-]{11}$/.test(id);
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
