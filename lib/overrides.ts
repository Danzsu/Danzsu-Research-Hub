import { z } from "zod/v4";
import { MAX_BLOCKS } from "./blocks.ts";

// `overrides` and `hidden_blocks` are written by the `update_post_overrides` RPC. The RPC checks
// that only the post's submitter may call it, but nothing stops the submitter from calling it
// directly with malformed jsonb, bypassing the app's own validation. That must never break the
// page for other readers, so every read goes through here — and both schemas are exported so
// Task 13's PATCH handler validates against the exact same rules.

const localizedField = (max: number) => {
  const field = z.string().trim().min(1).max(max);
  return z.object({ hu: field, en: field });
};

export const overridesSchema = z.object({
  title: localizedField(300).optional(),
  summary: localizedField(2000).optional(),
});
export type Overrides = z.infer<typeof overridesSchema>;

export const hiddenBlocksSchema = z.array(z.string()).max(MAX_BLOCKS);

/** Each field is validated independently, so one malformed field doesn't drop a valid sibling. */
export function readOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: Overrides = {};
  const title = overridesSchema.shape.title.safeParse(source.title);
  if (title.success && title.data) out.title = title.data;
  const summary = overridesSchema.shape.summary.safeParse(source.summary);
  if (summary.success && summary.data) out.summary = summary.data;
  return out;
}

export function readHiddenBlocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => hiddenBlocksSchema.element.safeParse(value).success).slice(0, MAX_BLOCKS);
}
