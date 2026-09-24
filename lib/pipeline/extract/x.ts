import { parseHTML } from "linkedom";
import { assignIds, inlineText, type BlockDraft, type Inline } from "../../blocks.ts";
import { apiFetch, ensureOk, FetchError, readJsonObject } from "../fetch.ts";
import { inlineSpans } from "../html-to-blocks.ts";
import { errorMessage, publishedDate } from "../util.ts";
import type { Extractor } from "./types.ts";

/** Splits a node list at every run of one or more `<br>`, so `a<br><br>b` becomes two groups, not three. */
function splitOnBreaks(nodes: Node[]): Node[][] {
  const groups: Node[][] = [[]];
  for (const node of nodes) {
    if (node.nodeType === 1 && (node as Element).localName === "br") {
      if (groups.at(-1)!.length > 0) groups.push([]);
      continue;
    }
    groups.at(-1)!.push(node);
  }
  return groups.filter((group) => group.length > 0);
}

export function parseTweetHtml(html: string): { paragraphs: Inline[][]; text: string; date: string | null } {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  // Built with inlineSpans, not htmlToDrafts: the article pipeline's noise filter would drop a
  // hashtag-only line, a mention-only line, or "Follow us" as boilerplate — here it's the post itself.
  const paragraphs = [...document.querySelectorAll("blockquote p")]
    .flatMap((p) => splitOnBreaks([...p.childNodes]))
    .map((nodes) => inlineSpans(nodes, "https://x.com/"))
    .filter((content) => inlineText(content).trim().length > 0);
  const dateText = [...document.querySelectorAll("blockquote > a")].at(-1)?.textContent ?? "";
  return { paragraphs, text: paragraphs.map(inlineText).join("\n\n"), date: publishedDate(`${dateText} UTC`) };
}

// oEmbed returns a single post without login; threads and images are out of reach.
export const extractX: Extractor = async (_db, url) => {
  let response: Response;
  try {
    response = await apiFetch(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`, { timeoutMs: 15_000 });
  } catch (error) {
    // Every failure here must be a FetchError: extract() rethrows it for x (never falls back to a
    // metadata post scraped from the x.com login shell), and the source ends up retried later.
    throw new FetchError(`x oembed fetch failed: ${errorMessage(error)}`);
  }
  const parsed = await readJsonObject(await ensureOk(response, "x oembed"));
  if (!parsed) throw new FetchError("x oembed returned no post");
  const data = parsed as { author_name?: string; html?: string };
  const post = parseTweetHtml(data.html ?? "");
  if (!post.text) throw new FetchError("x post has no text");
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
