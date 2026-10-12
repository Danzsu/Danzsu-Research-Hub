import { z } from "zod/v4";

/** A post's 2–3 minute brief (daily news spec N5): 3–5 paragraphs per language; empty when only the page's description was available. */
export const briefSchema = z.object({ hu: z.array(z.string()).max(6), en: z.array(z.string()).max(6) });
export type Brief = z.infer<typeof briefSchema>;

/** `posts.brief` as stored: null for a post made before briefs, an empty brief, or anything that doesn't parse. */
export function readBrief(raw: unknown): Brief | null {
  const parsed = briefSchema.safeParse(raw);
  return parsed.success && parsed.data.hu.length > 0 && parsed.data.en.length > 0 ? parsed.data : null;
}
