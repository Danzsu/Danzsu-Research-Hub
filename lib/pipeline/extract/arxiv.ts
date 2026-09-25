import { XMLParser } from "fast-xml-parser";
import { assignIds, plainText, withoutIds, type BlockDraft } from "../../blocks.ts";
import { apiFetch, cancelBody, ensureOk, readText, safeFetch } from "../fetch.ts";
import { collapse } from "../html-to-blocks.ts";
import { arxivId, errorMessage, list, xmlText } from "../util.ts";
import { articleFromHtml } from "./article.ts";
import { extractPdf } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";

export type ArxivMeta = { title: string; summary: string; published: string | null; authors: string[] };

const MAX_ARXIV_HTML = 16 * 1024 * 1024;

// parseTagValue: false — otherwise a purely numeric-looking title or summary ("0.10") is parsed as
// the JS number 0.1, silently dropping a trailing zero and changing its type.
const xml = new XMLParser({ parseTagValue: false });
const text = (value: unknown) => collapse(xmlText(value));

export function parseArxivAtom(body: string): ArxivMeta {
  const entry = (xml.parse(body) as { feed?: { entry?: Record<string, unknown> } }).feed?.entry;
  if (!entry) throw new Error("arxiv: no matching paper");
  // A malformed id can get an error-shaped entry in the body — <id> containing "/api/errors#",
  // title "Error", author "arXiv api core" — though live probing found arXiv actually serves that
  // case over HTTP 400 (metadata()'s !response.ok already throws first), and every id shape that
  // reaches here has already passed arxivId()'s own format gate. Kept as defense in depth in case
  // either of those holds less reliably than observed.
  if (text(entry.id).includes("/api/errors#")) throw new Error(`arxiv: ${text(entry.title) || "error"} — ${text(entry.summary)}`);
  const authors = list(entry.author as { name?: string }[] | { name?: string } | undefined);
  const published = text(entry.published);
  return {
    title: text(entry.title),
    summary: text(entry.summary),
    published: published ? published.slice(0, 10) : null,
    authors: authors.map((author) => text(author.name)).filter(Boolean),
  };
}

export const isArxivHtml = (html: string) => html.includes("ltx_page_main") || html.includes("ltx_document");

async function metadata(id: string): Promise<ArxivMeta> {
  const response = await ensureOk(await apiFetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`), "arxiv api");
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
    const html = response.ok ? await readText(response, MAX_ARXIV_HTML) : "";
    if (!response.ok) await cancelBody(response);
    if (isArxivHtml(html)) {
      // No <base> tag and no redirect: a real /html/<id> page's figures are plain paths like
      // "<id>v1/fig.png", meant to resolve against the page's own (unslashed) URL exactly as a
      // browser would — forcing a trailing slash here breaks that and 404s every figure.
      const base = response.url || `https://arxiv.org/html/${id}`;
      const article = articleFromHtml(html, base);
      // The page's own meta (its robots `noarchive`) survives; arXiv's ids are added to it.
      return { ...article, title: info.title || article.title, author: byline(info.authors), siteName: "arXiv", publishedAt: info.published, meta: { ...article.meta, ...meta } };
    }
  } catch (error) {
    console.warn(`arxiv html ${id}: ${errorMessage(error)}`);
  }

  // No HTML version: the abstract always, the full text from the PDF when it can be read.
  const abstract: BlockDraft[] = [
    { type: "heading", level: 2, text: "Abstract" },
    { type: "paragraph", content: [{ text: info.summary }] },
  ];
  let pdf: Pick<Extracted, "blocks" | "meta"> = { blocks: [], meta: {} };
  try {
    pdf = await extractPdf(db, `https://arxiv.org/pdf/${id}`, note);
  } catch (error) {
    console.warn(`arxiv pdf ${id}: ${errorMessage(error)}`);
  }
  const blocks = assignIds([...abstract, ...withoutIds(pdf.blocks)]);
  return {
    blocks,
    title: info.title,
    author: byline(info.authors),
    siteName: "arXiv",
    publishedAt: info.published,
    // The PDF's X-Robots-Tag `noarchive` survives the same way.
    meta: { ...pdf.meta, ...meta },
    text: [info.summary, plainText(pdf.blocks)].filter(Boolean).join("\n\n"),
  };
};
