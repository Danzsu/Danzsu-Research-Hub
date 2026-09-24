import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Block, ImageBlock } from "../blocks.ts";
import { MEDIA_BUCKET, MEDIA_TYPES, variantPath, type MediaFormat } from "../media.ts";
import { readLimited, safeFetch } from "./fetch.ts";

const MAX_IMAGES = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const WIDTHS = [640, 1280];
const MIN_SIDE = 64;
const CONCURRENCY = 4;
const PIXEL_LIMIT = 40_000_000; // decompression-bomb guard

export type Encoded = {
  format: MediaFormat;
  width: number;
  height: number;
  placeholder?: string;
  variants: { width: number; data: Buffer }[];
};

export const imageKey = (sourceId: number, originalUrl: string) =>
  `${sourceId}/${createHash("sha1").update(originalUrl).digest("hex").slice(0, 16)}`;

/** AVIF at two widths (animated → animated WebP); null for images too small to be content. */
export async function encodeImage(input: Buffer): Promise<Encoded | null> {
  const meta = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).metadata();
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  if (meta.format === "svg") return { format: "svg", width, height, variants: [{ width, data: input }] };

  const animated = (meta.pages ?? 1) > 1;
  const format: MediaFormat = animated ? "webp" : "avif";
  const targets = [...new Set(WIDTHS.map((target) => Math.min(target, width)))];
  const variants = await Promise.all(
    targets.map(async (target) => {
      const resized = sharp(input, { animated, limitInputPixels: PIXEL_LIMIT }).resize({ width: target, withoutEnlargement: true });
      const data = await (animated ? resized.webp({ quality: 75 }) : resized.avif({ quality: 50, effort: 4 })).toBuffer();
      return { width: target, data };
    }),
  );
  const tiny = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
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
 * `previous` are reused by URL; too-small images and those past the 30 limit
 * are dropped; a failed download keeps the block with `path: null`.
 */
export async function mirrorImages(db: SupabaseClient, sourceId: number, blocks: Block[], previous: Block[] = []): Promise<Block[]> {
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
    try {
      const response = await safeFetch(image.originalUrl, { accept: "image/avif,image/webp,image/*;q=0.8" });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("image/")) throw new Error(`not an image (${response.status} ${type})`);
      const encoded = await encodeImage(await readLimited(response, MAX_BYTES));
      if (!encoded) {
        results.set(image.id, null);
        return;
      }
      const key = imageKey(sourceId, image.originalUrl);
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
