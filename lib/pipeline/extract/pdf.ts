import { z } from "zod/v4";
import { assignIds, plainText, type BlockDraft } from "../../blocks.ts";
import { generate } from "../../llm.ts";
import { ensureOk, readLimited, safeFetch } from "../fetch.ts";
import { filenameOf, hasNoarchive, hostOf } from "../util.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_PDF = 20 * 1024 * 1024;

// Flat on purpose: one object shape is the most reliable structured output across models.
const llmBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "list", "quote", "code"]),
  text: z.string().optional(),
  level: z.int().optional(),
  ordered: z.boolean().optional(),
  items: z.array(z.string()).optional(),
  code: z.string().optional(),
  language: z.string().optional(),
});
type LlmBlock = z.infer<typeof llmBlockSchema>;

const pdfSchema = z.object({ title: z.string(), author: z.string().optional(), blocks: z.array(llmBlockSchema).max(400) });

export function fromLlmBlock(block: LlmBlock): BlockDraft | null {
  const text = block.text?.trim() ?? "";
  switch (block.type) {
    case "heading":
      return text ? { type: "heading", level: Math.min(4, Math.max(2, block.level ?? 2)) as 2 | 3 | 4, text } : null;
    case "paragraph":
      return text ? { type: "paragraph", content: [{ text }] } : null;
    case "quote":
      return text ? { type: "quote", content: [{ text }] } : null;
    case "list": {
      const items = (block.items ?? []).map((item) => item.trim()).filter(Boolean);
      return items.length ? { type: "list", ordered: Boolean(block.ordered), items: items.map((item) => [{ text: item }]) } : null;
    }
    case "code":
      return block.code?.trim() ? { type: "code", code: block.code, ...(block.language ? { language: block.language } : {}) } : null;
  }
}

// ponytail: a long PDF is truncated at ~12k words so one Gemini call fits inside post()'s 120s
// abort — upgrade path is chunked transcription by page range, stitched together after.
export const PDF_INSTRUCTIONS = `Transcribe the attached PDF into structured blocks, faithfully and in its original language.
- title: the document title. author: the authors, if stated.
- blocks: headings (level 2–4), paragraphs, lists, quotes and code, in reading order.
- Skip page headers, footers, page numbers and reference lists. Describe no figures.
- If the document is long, stop at a clean section boundary once you reach roughly 12,000 words.`;

export async function extractPdfResponse(db: Parameters<Extractor>[0], url: string, response: Response, note: string): Promise<Extracted> {
  const data = await readLimited(response, MAX_PDF);
  const result = await generate(db, "ingest_pdf", pdfSchema, `${PDF_INSTRUCTIONS}${note}`, { pdfBase64: data.toString("base64") });
  const blocks = assignIds(result.blocks.map(fromLlmBlock).filter((block): block is BlockDraft => block !== null));
  return {
    blocks,
    title: result.title || filenameOf(url) || url,
    author: result.author?.trim() || null,
    siteName: hostOf(url),
    publishedAt: null,
    meta: hasNoarchive(response.headers.get("x-robots-tag")) ? { noarchive: true } : {},
    text: plainText(blocks),
  };
}

export const extractPdf: Extractor = async (db, url, note) => {
  const response = await ensureOk(await safeFetch(url, { accept: "application/pdf" }), "fetch");
  return extractPdfResponse(db, url, response, note);
};
