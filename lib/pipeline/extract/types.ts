import type { SupabaseClient } from "@supabase/supabase-js";
import type { Block } from "../../blocks.ts";
import type { Generated } from "../summary.ts";

export type ExtractedMeta = Record<string, unknown> & {
  noarchive?: boolean;
  truncated?: boolean;
  extractionFailed?: boolean;
};

export type Extracted = {
  blocks: Block[];
  title: string;
  author: string | null;
  siteName: string;
  /** YYYY-MM-DD */
  publishedAt: string | null;
  meta: ExtractedMeta;
  /** What the summarizer reads; for noarchive pages this is all that is used. */
  text: string;
  /** Set when the extractor already wrote the summary in the same model call (YouTube). */
  generated?: Generated;
};

export type Extractor = (db: SupabaseClient, url: string, note: string) => Promise<Extracted>;
