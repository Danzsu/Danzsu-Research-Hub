import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Block, ImageBlock } from "../blocks.ts";
import { MEDIA_BUCKET, MEDIA_TYPES, variantPath, type MediaFormat } from "../media.ts";
import { cancelBody, readLimited, safeFetch } from "./fetch.ts";

const MAX_IMAGES = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const WIDTHS = [640, 1280];
const MIN_SIDE = 64;
const CONCURRENCY = 4;
const PIXEL_LIMIT = 40_000_000; // decompression-bomb guard
export const FETCH_TIMEOUT_MS = 10_000;
export const IMAGE_BUDGET_MS = 90_000;
// ponytail: fixed upscale ceiling for vector sources; raise if a submitted SVG's
// declared size is so small that even this still doesn't clear the 1280px target.
const MAX_SVG_DENSITY = 2400;
const HEIF_MAX_SIDE = 16_384; // libheif's per-dimension limit for the AVIF container we encode into

export type Encoded = {
  format: MediaFormat;
  width: number;
  height: number;
  placeholder?: string;
  variants: { width: number; data: Buffer }[];
};

/** Content-addressed to the downloaded bytes, not the URL — a re-download of the same image reuses the same key. */
export const imageKey = (sourceId: number, data: Buffer) =>
  `${sourceId}/${createHash("sha1").update(data).digest("hex").slice(0, 16)}`;

/**
 * AVIF at two widths (animated → animated WebP); null for images too small to be content.
 * SVGs are never stored or served as markup (a stored-XSS vector): they're rasterized
 * like any other image, decoded at a density high enough that the 1280px variant isn't an upscale.
 * EXIF orientation is applied before measuring, so a sideways photo reports its displayed size.
 */
export async function encodeImage(input: Buffer): Promise<Encoded | null> {
  const meta = await sharp(input, { autoOrient: true, limitInputPixels: PIXEL_LIMIT }).metadata();
  const animated = (meta.pages ?? 1) > 1;
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = animated ? (meta.pageHeight ?? meta.height ?? 0) : (meta.autoOrient?.height ?? meta.height ?? 0);
  if (width < MIN_SIDE || height < MIN_SIDE) return null;

  const largestTarget = WIDTHS.at(-1)!;
  let density = meta.format === "svg" ? Math.min(MAX_SVG_DENSITY, Math.max(72, Math.ceil((72 * largestTarget) / width))) : undefined;
  if (density) {
    // A narrow-but-tall SVG upscaled to hit the width target can overshoot the encoder's max side.
    const maxSide = Math.max(Math.round((width * density) / 72), Math.round((height * density) / 72));
    if (maxSide > HEIF_MAX_SIDE) density = Math.max(72, Math.floor((density * HEIF_MAX_SIDE) / maxSide));
  }
  const open = () => sharp(input, { autoOrient: true, animated, limitInputPixels: PIXEL_LIMIT, ...(density ? { density } : {}) });
  const decodedWidth = density ? Math.round((width * density) / 72) : width;

  const targets = [...new Set(WIDTHS.map((target) => Math.min(target, decodedWidth)))];
  const settled = await Promise.allSettled(
    targets.map(async (target) => {
      const resized = open().resize({ width: target, withoutEnlargement: true });
      const data = await (animated ? resized.webp({ quality: 75 }) : resized.avif({ quality: 50, effort: 4 })).toBuffer();
      return { width: target, data };
    }),
  );
  // A variant that still overshoots the encoder's limits is dropped, not fatal — the smaller ones survive.
  const variants = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (variants.length === 0) return null;

  const tiny = await open().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  const format: MediaFormat = animated ? "webp" : "avif";
  return { format, width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, variants };
}

async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

const isMirrored = (block: Block): block is ImageBlock => block.type === "image" && Boolean(block.path);

/**
 * Downloads, encodes and uploads image blocks. Images already mirrored in
 * `previous` are reused by URL, without fetching; too-small images and those
 * past the 30 limit are dropped; a failed download — or one that never got a
 * chance to start before `options.budgetMs` (default 90s) ran out — keeps the
 * block with `path: null`. Content type is not trusted: sharp sniffs the bytes.
 */
export async function mirrorImages(
  db: SupabaseClient,
  sourceId: number,
  blocks: Block[],
  previous: Block[] = [],
  options: { budgetMs?: number } = {},
): Promise<Block[]> {
  const deadline = Date.now() + (options.budgetMs ?? IMAGE_BUDGET_MS);
  const reuse = new Map(previous.filter(isMirrored).map((block) => [block.originalUrl, block]));
  const images = blocks.filter((block): block is ImageBlock => block.type === "image");
  const allowed = new Set(images.slice(0, MAX_IMAGES).map((image) => image.id));
  const results = new Map<string, ImageBlock | null>();

  await eachLimited(images.filter((image) => allowed.has(image.id)), CONCURRENCY, async (image) => {
    const old = reuse.get(image.originalUrl);
    if (old) {
      results.set(image.id, { ...image, path: old.path, format: old.format, widths: old.widths, width: old.width, height: old.height, placeholder: old.placeholder });
      return;
    }
    if (Date.now() > deadline) {
      results.set(image.id, { ...image, path: null });
      return;
    }
    try {
      const response = await safeFetch(image.originalUrl, { accept: "image/avif,image/webp,image/*;q=0.8", timeoutMs: FETCH_TIMEOUT_MS });
      if (!response.ok) {
        await cancelBody(response);
        throw new Error(`not an image (${response.status})`);
      }
      const raw = await readLimited(response, MAX_BYTES);
      const encoded = await encodeImage(raw);
      if (!encoded) {
        results.set(image.id, null);
        return;
      }
      const key = imageKey(sourceId, raw);
      for (const variant of encoded.variants) {
        const { error } = await db.storage
          .from(MEDIA_BUCKET)
          .upload(variantPath(key, variant.width, encoded.format), variant.data, { contentType: MEDIA_TYPES[encoded.format], upsert: true });
        if (error) throw error;
      }
      results.set(image.id, {
        ...image,
        path: key,
        format: encoded.format,
        widths: encoded.variants.map((variant) => variant.width),
        width: encoded.width,
        height: encoded.height,
        placeholder: encoded.placeholder,
      });
    } catch (error) {
      console.warn(`image ${image.originalUrl}: ${error instanceof Error ? error.message : error}`);
      results.set(image.id, { ...image, path: null });
    }
  });

  return blocks.flatMap((block): Block[] => {
    if (block.type !== "image") return [block];
    if (!allowed.has(block.id)) return [];
    const result = results.get(block.id);
    return result === null ? [] : [result ?? block];
  });
}

/** Stored objects no longer referenced by `blocks` (after a re-extraction). */
export function unusedMediaPaths(existing: string[], blocks: Block[]): string[] {
  const used = new Set(
    blocks.filter(isMirrored).flatMap((block) => (block.widths ?? []).map((width) => variantPath(block.path!, width, block.format ?? "avif"))),
  );
  return existing.filter((path) => !used.has(path));
}
