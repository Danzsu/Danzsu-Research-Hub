import { z } from "zod/v4";
import { localizedSchema } from "./blocks.ts";

// `overrides` and `hidden_blocks` are written by the `update_post_overrides` RPC, which any
// authenticated user can call directly with arbitrary jsonb — bypassing the app entirely. A
// malformed value must never break the page for other members, so every read goes through here.

export const overridesSchema = z.object({
  title: localizedSchema.optional(),
  summary: localizedSchema.optional(),
});
export type Overrides = z.infer<typeof overridesSchema>;

export const MAX_HIDDEN_BLOCKS = 400; // the same cap as limitBlocks' maxBlocks in lib/blocks.ts
export const hiddenBlocksSchema = z.array(z.string()).max(MAX_HIDDEN_BLOCKS);

/** Each field is validated independently, so one malformed field doesn't drop a valid sibling. */
export function readOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: Overrides = {};
  const title = localizedSchema.safeParse(source.title);
  if (title.success) out.title = title.data;
  const summary = localizedSchema.safeParse(source.summary);
  if (summary.success) out.summary = summary.data;
  return out;
}

export function readHiddenBlocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string").slice(0, MAX_HIDDEN_BLOCKS);
}
