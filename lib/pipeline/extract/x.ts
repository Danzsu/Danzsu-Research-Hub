import { parseHTML } from "linkedom";
import { assignIds, inlineText, type BlockDraft, type Inline } from "../../blocks.ts";
import { cancelBody, FetchError } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import type { Extractor } from "./types.ts";

export function parseTweetHtml(html: string): { paragraphs: Inline[][]; text: string; date: string | null } {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const paragraphs = [...document.querySelectorAll("blockquote p")]
    .flatMap((p) => htmlToDrafts(p.outerHTML, { baseUrl: "https://x.com/" }))
    .filter((block): block is Extract<BlockDraft, { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.content);
  const dateText = [...document.querySelectorAll("blockquote > a")].at(-1)?.textContent ?? "";
  const parsed = Date.parse(`${dateText} UTC`);
  return {
    paragraphs,
    text: paragraphs.map(inlineText).join("\n\n"),
    date: Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10),
  };
}

// oEmbed returns a single post without login; threads and images are out of reach.
export const extractX: Extractor = async (_db, url) => {
  const response = await fetch(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await cancelBody(response);
    throw new FetchError(`x oembed ${response.status}`);
  }
  const data = (await response.json()) as { author_name?: string; html?: string };
  const post = parseTweetHtml(data.html ?? "");
  if (!post.text) throw new Error("empty post");
  const author = data.author_name ?? null;
  return {
    blocks: assignIds(post.paragraphs.map((content): BlockDraft => ({ type: "paragraph", content }))),
    title: `${author ?? "X"}: ${post.text.slice(0, 80)}${post.text.length > 80 ? "…" : ""}`,
    author,
    siteName: "X",
    publishedAt: post.date,
    meta: { truncated: true },
    text: post.text,
  };
};
