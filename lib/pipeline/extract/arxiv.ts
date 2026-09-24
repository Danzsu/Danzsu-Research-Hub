import { XMLParser } from "fast-xml-parser";
import { assignIds, withoutIds, type Block, type BlockDraft } from "../../blocks.ts";
import { cancelBody, readText, safeFetch } from "../fetch.ts";
import { arxivId } from "../util.ts";
import { articleFromHtml } from "./article.ts";
import { extractPdf } from "./pdf.ts";
import type { Extractor } from "./types.ts";

export type ArxivMeta = { title: string; summary: string; published: string | null; authors: string[] };

const xml = new XMLParser();
const squash = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();

export function parseArxivAtom(body: string): ArxivMeta {
  const entry = (xml.parse(body) as { feed?: { entry?: Record<string, unknown> } }).feed?.entry ?? {};
  const authors = ([] as { name?: string }[]).concat((entry.author as { name?: string }[] | { name?: string }) ?? []);
  const published = squash(entry.published);
  return {
    title: squash(entry.title),
    summary: squash(entry.summary),
    published: published ? published.slice(0, 10) : null,
    authors: authors.map((author) => squash(author.name)).filter(Boolean),
  };
}

export const isArxivHtml = (html: string) => html.includes("ltx_page_main") || html.includes("ltx_document");

async function metadata(id: string): Promise<ArxivMeta> {
  const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    await cancelBody(response);
    throw new Error(`arxiv api ${response.status}`);
  }
  return parseArxivAtom(await response.text());
}

const byline = (authors: string[]) => (authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ")) || null;

export const extractArxiv: Extractor = async (db, url, note) => {
  const id = arxivId(new URL(url));
  if (!id) throw new Error("not an arXiv URL");
  const info = await metadata(id);
  const meta = { arxivId: id, authors: info.authors };

  try {
    const response = await safeFetch(`https://arxiv.org/html/${id}`, { accept: "text/html" });
    const html = response.ok ? await readText(response, 16 * 1024 * 1024) : "";
    if (!response.ok) await cancelBody(response);
    if (isArxivHtml(html)) {
      // Figures are relative to the paper's directory, so the base needs a trailing slash.
      const base = (response.url || `https://arxiv.org/html/${id}`).replace(/\/?$/, "/");
      const article = articleFromHtml(html, base);
      return { ...article, title: info.title || article.title, author: byline(info.authors), siteName: "arXiv", publishedAt: info.published, meta };
    }
  } catch (error) {
    console.warn(`arxiv html ${id}: ${error instanceof Error ? error.message : error}`);
  }

  // No HTML version: the abstract always, the full text from the PDF when it can be read.
  const abstract: BlockDraft[] = [
    { type: "heading", level: 2, text: "Abstract" },
    { type: "paragraph", content: [{ text: info.summary }] },
  ];
  let body: Block[] = [];
  try {
    body = (await extractPdf(db, `https://arxiv.org/pdf/${id}`, note)).blocks;
  } catch (error) {
    console.warn(`arxiv pdf ${id}: ${error instanceof Error ? error.message : error}`);
  }
  const blocks = assignIds([...abstract, ...withoutIds(body)]);
  return {
    blocks,
    title: info.title,
    author: byline(info.authors),
    siteName: "arXiv",
    publishedAt: info.published,
    meta,
    text: [info.summary, ...body.map((block) => (block.type === "paragraph" ? block.content.map((s) => s.text).join("") : ""))].join("\n\n"),
  };
};
