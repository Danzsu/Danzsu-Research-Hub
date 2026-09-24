import { z } from "zod/v4";
import { fnv1a } from "./pipeline/util.ts";

// The one content model every source is converted into and every post is rendered from.

export const inlineSchema = z.object({
  text: z.string(),
  href: z.string().optional(),
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  code: z.literal(true).optional(),
});
export type Inline = z.infer<typeof inlineSchema>;

/** Text that exists in both site languages; the zod twin of `Localized` in data/digest-types.ts. */
export const localizedSchema = z.object({ hu: z.string(), en: z.string() });

const id = z.string();

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string() }),
  z.object({ id, type: z.literal("paragraph"), content: z.array(inlineSchema) }),
  z.object({ id, type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(inlineSchema)) }),
  z.object({ id, type: z.literal("quote"), content: z.array(inlineSchema), cite: z.string().optional() }),
  z.object({ id, type: z.literal("code"), language: z.string().optional(), code: z.string() }),
  z.object({
    id,
    type: z.literal("image"),
    originalUrl: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
    /** Storage key without width/extension; null when the image could not be mirrored. */
    path: z.string().nullable(),
    format: z.enum(["avif", "webp", "svg"]).optional(),
    widths: z.array(z.number()).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    placeholder: z.string().optional(),
  }),
  z.object({ id, type: z.literal("video"), provider: z.enum(["youtube", "vimeo"]), videoId: z.string(), start: z.number().optional() }),
  z.object({ id, type: z.literal("chapters"), items: z.array(z.object({ seconds: z.number(), title: z.string() })) }),
  z.object({
    id,
    type: z.literal("repo"),
    fullName: z.string(),
    url: z.string(),
    stars: z.number(),
    language: z.string().optional(),
    topics: z.array(z.string()),
    license: z.string().optional(),
  }),
  z.object({ id, type: z.literal("divider") }),
]);
export const blocksSchema = z.array(blockSchema);

export type Block = z.infer<typeof blockSchema>;
export type ImageBlock = Extract<Block, { type: "image" }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A block before `assignIds`; extractors build these. */
export type BlockDraft = DistributiveOmit<Block, "id">;

/** Stored JSON → blocks. Validates each block independently; drops malformed blocks and keeps valid ones. */
export function parseBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((block) => (blockSchema.safeParse(block).success ? [blockSchema.parse(block)] : []));
}

export function safeHref(raw: string | null | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const inlineText = (spans: Inline[]) => spans.map((span) => span.text).join("");

export function blockText(block: BlockDraft): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
    case "quote":
      return inlineText(block.content);
    case "list":
      return block.items.map(inlineText).join("\n");
    case "code":
      return block.code;
    case "image":
      return [block.alt, block.caption].filter(Boolean).join(" ");
    case "chapters":
      return block.items.map((item) => item.title).join("\n");
    case "repo":
      return block.fullName;
    default:
      return "";
  }
}

export const plainText = (blocks: BlockDraft[]) => blocks.map(blockText).filter(Boolean).join("\n\n");

function identity(block: BlockDraft): string {
  if (block.type === "image") return block.originalUrl;
  if (block.type === "video") return `${block.provider}:${block.videoId}`;
  return blockText(block).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Ids come from type + content, not position, so re-extraction keeps them:
 * hidden blocks and (in M2) highlights reference these.
 */
export function assignIds(drafts: BlockDraft[]): Block[] {
  const seen = new Map<string, number>();
  return drafts.map((draft) => {
    const typePrefix = draft.type.slice(0, 1);
    const content = draft.type + "\u0000" + identity(draft);
    const base = typePrefix + fnv1a(content);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...draft, id: count === 1 ? base : `${base}-${count}` } as Block;
  });
}

export const withoutIds = (blocks: Block[]): BlockDraft[] =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  blocks.map(({ id, ...draft }) => draft as BlockDraft);

export function sectionsToBlocks(sections: { heading: string; points: string[] }[]): BlockDraft[] {
  return sections.flatMap((section): BlockDraft[] => [
    { type: "heading", level: 2, text: section.heading },
    { type: "list", ordered: false, items: section.points.map((point) => [{ text: point }]) },
  ]);
}

export function limitBlocks(blocks: Block[], maxBlocks = 400, maxChars = 200_000): { blocks: Block[]; clipped: boolean } {
  const kept: Block[] = [];
  let chars = 0;
  for (const block of blocks) {
    chars += blockText(block).length;
    if (kept.length >= maxBlocks || (chars > maxChars && kept.length > 0)) return { blocks: kept, clipped: true };
    kept.push(block);
  }
  return { blocks: kept, clipped: false };
}
