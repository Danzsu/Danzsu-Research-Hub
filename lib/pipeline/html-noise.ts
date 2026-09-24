import { blockIdentity, blockText, inlineText, type BlockDraft } from "../blocks.ts";
import { isIconOrAvatarImage } from "./html-images.ts";
import { hostOf, videoFromUrl } from "./util.ts";

// The noise rules around the DOM-to-blocks conversion in html-to-blocks.ts, tuned separately from it.
// Layer 1 strips page chrome from the DOM before conversion; layer 2 drops blocks after it. Layer 3
// (a model pass over what is left) lives in cleanup.ts.

// ── Layer 1: structural and named noise, removed before conversion ──────────

const DROP = [
  "script", "style", "noscript", "template", "form", "button", "input", "select", "textarea",
  "nav", "aside", "footer", "svg", "canvas",
  "[role=navigation]", "[role=banner]", "[role=complementary]", "[aria-hidden=true]",
].join(", ");

// Generic single-purpose noise keywords: safe as a substring with a delimiter on both sides.
const NOISE_NAME = /(^|[-_])(ad|ads|adv|advert\w*|sponsor\w*|promo\w*|newsletter\w*|subscribe\w*|cookie\w*|popup\w*|banner\w*|paywall\w*|outbrain|taboola)([-_]|$)/i;
// share/sharing/sharedaddy/related/relatedposts/comment(s) as whole delimited tokens: catches
// "post-share", "social-sharing", "yarpp-related", "jp-relatedposts", "related-posts", but not
// "shared-weights" ("shared" isn't in the list) or "social-proof" (bare "social" isn't a noise
// token — only "social-share"/"social-sharing" match, via share/sharing). "related" excludes a
// "-work"/"_work" suffix via a negative lookahead, so "related-work" (as a class, e.g.
// <section class="related-work">) is never noise by name — independent of the id exemptions
// below, which separately protect "related-work" when it's used as an id on/under a heading.
const SHARE_RELATED_COMMENT = /(^|[-_])(share|sharing|sharedaddy|related(?![-_]work)|relatedposts|comments?)([-_]|$)/i;
// "modal" only at the token's start, so "multi-modal" is not caught.
const MODAL_NAME = /^modal(-\w*)?$/i;
const AD_DATA_ATTR = /^data-ads?(-|$)/i;
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

// Known main-content containers: never removed by name/ad-attribute matching, and neither is
// any ancestor of one (removing the ancestor would take the real content down with it).
const CONTENT_CLASS_TOKENS = new Set([
  "entry-content", "post-content", "article-body", "article-content", "post-body", "story-body", "markdown-body",
]);
const CONTENT_CONTAINER_SELECTOR =
  "article, main, [role=main], [itemprop=articleBody], .entry-content, .post-content, .article-body, .article-content, .post-body, .story-body, .markdown-body";

function isContentContainer(el: Element): boolean {
  if (el.localName === "article" || el.localName === "main") return true;
  if (el.getAttribute("role") === "main" || el.getAttribute("itemprop") === "articleBody") return true;
  return (el.getAttribute("class") ?? "").split(/\s+/).some((token) => CONTENT_CLASS_TOKENS.has(token));
}

/** Replaces a blunt size-ratio guard: protects real content by what it *is*, not how big it is. */
function isProtectedContainer(el: Element, rootTextLength: number): boolean {
  if (isContentContainer(el) || el.querySelector(CONTENT_CONTAINER_SELECTOR)) return true;
  return rootTextLength > 0 && (el.textContent ?? "").length >= rootTextLength * 0.5;
}

// Exact, well-known noise ids that are removed even when the element contains a heading
// (<section id="comments"><h2>3 comments</h2>...) — overrides the heading/section exemptions
// below (which exist for content sections, e.g. pandoc's div.section), except on a heading
// itself (<h2 id="comments">) or a pandoc-style section, where the id is more likely to name
// real content than a comments/related-posts widget. Pandoc needs both class tokens, "section"
// and "levelN": a bare "section" class is common on real comment wrappers too.
const NOISE_ID_DENYLIST = new Set(["comments", "respond", "disqus_thread", "related-posts", "jp-relatedposts"]);
const PANDOC_LEVEL_CLASS = /^level\d+$/;

function isNoiseElement(el: Element, rootTextLength: number): boolean {
  const rawId = el.getAttribute("id") ?? "";
  const classTokens = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("tag-") && !token.startsWith("category-"));
  const isHeadingSelf = HEADING_TAGS.has(el.localName);
  const isPandocSection = classTokens.includes("section") && classTokens.some((t) => PANDOC_LEVEL_CLASS.test(t));

  // Cheapest check first: the exact-id denylist, checked before the (expensive) protection
  // check below, so a denylisted id is removed even if it holds ≥50% of the page (a comments
  // section can dwarf a short post).
  if (NOISE_ID_DENYLIST.has(rawId.toLowerCase()) && !isHeadingSelf && !isPandocSection) return !el.closest("pre, code");

  const classNamed = classTokens.some((name) => NOISE_NAME.test(name) || SHARE_RELATED_COMMENT.test(name) || MODAL_NAME.test(name));
  // The id only needs the (expensive, subtree-scanning) heading-descendant check when it would
  // otherwise match a noise keyword at all — most ids don't, so this keeps that query off the
  // common path. An id is skipped for a heading itself, an actual <section> tag, or a wrapper
  // that contains a heading (pandoc/R Markdown/bookdown: <div id="ad-hoc-evaluation" class=
  // "section level2"><h2>...</h2> — a generic "ad"/"promo" keyword would otherwise false-positive
  // on the slug).
  const idLooksNoisy = !!rawId && (NOISE_NAME.test(rawId) || SHARE_RELATED_COMMENT.test(rawId) || MODAL_NAME.test(rawId));
  const idNamed = idLooksNoisy && !(isHeadingSelf || el.localName === "section" || el.querySelector(HEADING_SELECTOR));
  const adData = el.getAttributeNames().some((attr) => AD_DATA_ATTR.test(attr));
  if (!classNamed && !idNamed && !adData) return false; // nothing matched: skip the expensive checks below entirely
  // Never strip syntax-highlighted spans (class="token comment"). Checked only after a match:
  // closest() on every element was the converter's main remaining cost.
  if (el.closest("pre, code")) return false;

  // Only elements that already look like noise pay for the protection check (subtree query + textContent).
  return !isProtectedContainer(el, rootTextLength);
}

/**
 * A `<noscript><img></noscript>` fallback is the real image when JS-driven lazy loading never
 * fires. Only replaces the preceding placeholder <img> when it has no real src of its own
 * (missing or a data: URI) — a genuine image (or an unrelated tracking pixel) right before the
 * noscript must not be deleted just because a noscript happens to follow it.
 */
function hoistNoscriptImages(root: Element): void {
  root.querySelectorAll("noscript").forEach((noscript) => {
    const img = noscript.querySelector("img");
    if (!img) return;
    const placeholder = noscript.previousElementSibling;
    if (placeholder && placeholder.localName === "img") {
      const src = placeholder.getAttribute("src");
      if (!src || src.startsWith("data:")) placeholder.remove();
    }
    noscript.replaceWith(img);
  });
}

/** Strips page chrome and named noise. Mutates `root`; run it before Readability too. */
export function cleanDocument(root: Element, baseUrl: string): void {
  hoistNoscriptImages(root);
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  root.querySelectorAll("iframe").forEach((el) => {
    if (!videoFromUrl(el.getAttribute("src") ?? "", baseUrl)) el.remove();
  });
  const rootTextLength = (root.textContent ?? "").length;
  root.querySelectorAll("*").forEach((el) => {
    if (el.isConnected && isNoiseElement(el, rootTextLength)) el.remove();
  });
}

// ── Layer 2: block-level noise, after conversion ────────────────────────────

const SHARE_LINK = /(twitter\.com\/intent|x\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share|reddit\.com\/submit|news\.ycombinator\.com\/submitlink|t\.me\/share|wa\.me\/)/i;
// Call-to-action phrasing only, so real sentences that merely contain "sponsored" or "subscribe" survive.
const BOILERPLATE_PHRASE = /\b(subscribe to (our|the) newsletter|sign up for (our|the) newsletter|share this (post|article)|follow us|you might also like)\b/i;
// Short standalone labels: must be the block's *entire* text, not a substring of a real sentence.
const BOILERPLATE_EXACT = /^(advertisement|sponsored|related (posts|articles|stories)|hírlevél|kapcsolódó cikkek|hirdetés)$/i;
// Hungarian CTAs that lead a short sentence rather than standing alone, e.g. "Iratkozz fel a hírlevelünkre!".
const BOILERPLATE_PREFIX = /^(iratkozz fel|oszd meg)\b/i;
const isBoilerplate = (text: string) => BOILERPLATE_PHRASE.test(text) || BOILERPLATE_EXACT.test(text.trim()) || BOILERPLATE_PREFIX.test(text.trim());

function isNoiseBlock(block: BlockDraft, baseHost: string): boolean {
  if (block.type === "image") return isIconOrAvatarImage(new URL(block.originalUrl));
  if (block.type === "list") return block.items.every((item) => !inlineText(item).trim() || item.some((s) => s.href && SHARE_LINK.test(s.href)));
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "quote") return false;
  const text = blockText(block).trim();
  if (!text) return true;
  if (text.length < 120 && isBoilerplate(text)) return true;
  if (block.type === "heading") return false;
  const links = block.content.filter((span) => span.href);
  if (links.some((span) => SHARE_LINK.test(span.href!)) && text.length < 200) return true;
  // Short, link-only paragraphs pointing back into the same site are navigation ("Next post").
  const linkOnly = block.content.every((span) => span.href || !span.text.trim());
  return linkOnly && text.length < 40 && links.every((span) => hostOf(span.href!) === baseHost);
}

// Code is compared by its exact text, not the normalised identity: indentation/whitespace is
// meaningful in code, so two blocks differing only there are not duplicates.
const dedupeKey = (block: BlockDraft): string => (block.type === "code" ? block.code : blockIdentity(block));

export function filterNoise(blocks: BlockDraft[], baseUrl: string): BlockDraft[] {
  const baseHost = hostOf(baseUrl);
  const kept: BlockDraft[] = [];
  for (const block of blocks) {
    if (isNoiseBlock(block, baseHost)) continue;
    const previous = kept.at(-1);
    if (block.type === "divider" && (!previous || previous.type === "divider")) continue;
    if (previous && previous.type === block.type && dedupeKey(block) && dedupeKey(previous) === dedupeKey(block)) continue;
    kept.push(block);
  }
  while (kept.at(-1)?.type === "divider") kept.pop();
  return kept;
}
