import { parseHTML } from "linkedom";
import { assignIds, blockIdentity, blockText, inlineText, safeHref, type Block, type BlockDraft, type Inline } from "../blocks.ts";
import { hostOf, youtubeId } from "./util.ts";

export type HtmlToBlocksOptions = { baseUrl: string; imageBaseUrl?: string };

// ── Layer 1: structural and named noise, removed before conversion ──────────

const DROP = [
  "script", "style", "noscript", "template", "form", "button", "input", "select", "textarea",
  "nav", "aside", "footer", "svg", "canvas",
  "[role=navigation]", "[role=banner]", "[role=complementary]", "[aria-hidden=true]",
].join(", ");

// Generic single-purpose noise keywords: safe as a substring with a delimiter on both sides.
const NOISE_NAME = /(^|[-_])(ad|ads|adv|advert\w*|sponsor\w*|promo\w*|newsletter\w*|subscribe\w*|comments?|cookie\w*|popup\w*|banner\w*|paywall\w*|outbrain|taboola)([-_]|$)/i;
// Share/social widgets, narrowed to known widget names so "shared-weights" and "social-proof" survive.
const SHARE_NAME = /^(share|sharing|share-(buttons?|bar|this|box|links?|icons?|panel|widget|tools?)|sharedaddy\w*|social-share|social-(icons?|buttons?|links?|widget))$/i;
// "modal" only at the token's start, so "multi-modal" is not caught.
const MODAL_NAME = /^modal(-\w*)?$/i;
// Enumerated related-content widgets, not "related-work".
const RELATED_NAME = /^related(-(posts|articles|links))?$/i;
const AD_DATA_ATTR = /^data-ads?(-|$)/i;
const HEADING_OR_SECTION = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "section"]);
/** Noise boxes are small relative to the page; keep an absolute floor so tiny pages still work. */
const NOISE_TEXT_FLOOR = 1500;
const NOISE_TEXT_RATIO = 0.25;

function isNoiseElement(el: Element, rootTextLength: number): boolean {
  if (el.closest("pre, code")) return false; // never strip syntax-highlighted spans, e.g. class="token comment"
  const classTokens = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("tag-") && !token.startsWith("category-"));
  const idToken = HEADING_OR_SECTION.has(el.localName) ? "" : (el.getAttribute("id") ?? "");
  const names = [...classTokens, idToken].filter(Boolean);
  const named = names.some((name) => NOISE_NAME.test(name) || SHARE_NAME.test(name) || MODAL_NAME.test(name) || RELATED_NAME.test(name));
  const adData = el.getAttributeNames().some((attr) => AD_DATA_ATTR.test(attr));
  const maxNoiseText = Math.max(NOISE_TEXT_FLOOR, rootTextLength * NOISE_TEXT_RATIO);
  return (named || adData) && (el.textContent ?? "").length < maxNoiseText;
}

/** A `<noscript><img></noscript>` fallback is the real image when JS-driven lazy loading never fires. */
function hoistNoscriptImages(root: Element): void {
  root.querySelectorAll("noscript").forEach((noscript) => {
    const img = noscript.querySelector("img");
    if (!img) return;
    const placeholder = noscript.previousElementSibling;
    if (placeholder && placeholder.localName === "img") placeholder.remove();
    noscript.replaceWith(img);
  });
}

function isVideoEmbedSrc(src: string, baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(src, baseUrl);
  } catch {
    return false;
  }
  if (youtubeId(url)) return true;
  return /(^|\.)player\.vimeo\.com$/.test(url.hostname) && /^\/video\/\d+/.test(url.pathname);
}

/** Strips page chrome and named noise. Mutates `root`; run it before Readability too. */
export function cleanDocument(root: Element, baseUrl: string): void {
  hoistNoscriptImages(root);
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  root.querySelectorAll("iframe").forEach((el) => {
    if (!isVideoEmbedSrc(el.getAttribute("src") ?? "", baseUrl)) el.remove();
  });
  const rootTextLength = (root.textContent ?? "").length;
  root.querySelectorAll("*").forEach((el) => {
    if (el.isConnected && isNoiseElement(el, rootTextLength)) el.remove();
  });
}

// ── Conversion ───────────────────────────────────────────────────────────────

type Marks = { href?: string; bold?: true; italic?: true };
type Ctx = { base: string; imageBase: string; out: BlockDraft[]; pending: Element[] };

const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd",
  "label", "mark", "math", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);
/** An INLINE-tagged wrapper containing one of these is visited as a block, not inline-collected. */
const BLOCK_DESCENDANT_SELECTOR = "h1, h2, h3, h4, h5, h6, p, ul, ol, pre, table, blockquote, figure";

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Per the HTML spec: split on whitespace (URLs can't contain literal whitespace), not on every comma. */
function parseSrcset(srcset: string): string[] {
  const tokens = srcset.trim().split(/\s+/).filter(Boolean);
  const candidates: { url: string; size: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const url = tokens[i].replace(/,$/, "");
    if (!url) continue;
    let size = 1;
    const next = tokens[i + 1];
    if (next && /^\d+(\.\d+)?[wx],?$/.test(next)) {
      size = Number.parseFloat(next) || 1;
      i++;
    }
    candidates.push({ url, size });
  }
  return candidates.sort((a, b) => b.size - a.size).map((c) => c.url);
}

function imageUrl(img: Element, ctx: Ctx): string | undefined {
  const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset");
  const candidates = [
    ...(srcset ? parseSrcset(srcset) : []),
    img.getAttribute("data-src"),
    img.getAttribute("data-lazy-src"),
    img.getAttribute("data-original"),
    img.getAttribute("src"),
  ];
  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith("data:")) continue;
    const href = safeHref(candidate, ctx.imageBase);
    if (href) return href;
  }
  return undefined;
}

function pushImage(img: Element, caption: string | undefined, ctx: Ctx) {
  const url = imageUrl(img, ctx);
  if (!url) return;
  const width = Number(img.getAttribute("width"));
  const height = Number(img.getAttribute("height"));
  if ((width && width < 64) || (height && height < 64)) return; // icons and tracking pixels
  ctx.out.push({ type: "image", originalUrl: url, alt: collapse(img.getAttribute("alt")), caption: caption || undefined, path: null });
}

function pushVideo(el: Element, ctx: Ctx) {
  let url: URL;
  try {
    url = new URL(el.getAttribute("src") ?? "", ctx.base);
  } catch {
    return;
  }
  const yt = youtubeId(url);
  if (yt) {
    ctx.out.push({ type: "video", provider: "youtube", videoId: yt });
    return;
  }
  const vimeo = /(^|\.)player\.vimeo\.com$/.test(url.hostname) && /^\/video\/(\d+)/.exec(url.pathname)?.[1];
  if (vimeo) ctx.out.push({ type: "video", provider: "vimeo", videoId: vimeo });
}

function preText(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    if (child.localName === "br") {
      out += "\n";
      return;
    }
    for (const c of [...child.childNodes]) walk(c);
  };
  for (const c of [...el.childNodes]) walk(c);
  return out;
}

function pushPre(el: Element, ctx: Ctx) {
  const code = preText(el).replace(/^\n/, "").replace(/\n+$/, "");
  if (code.trim()) ctx.out.push({ type: "code", language: languageOf(el), code });
}

function flushPending(ctx: Ctx) {
  const pending = ctx.pending;
  ctx.pending = [];
  for (const el of pending) {
    switch (el.localName) {
      case "img":
        pushImage(el, undefined, ctx);
        break;
      case "iframe":
        pushVideo(el, ctx);
        break;
      case "pre":
        pushPre(el, ctx);
        break;
      case "table":
        pushTable(el, ctx);
        break;
    }
  }
}

function collectInline(nodes: Node[], ctx: Ctx, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ text, ...marks });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    switch (el.localName) {
      case "br":
        out.push({ text: " ", ...marks });
        break;
      case "img":
      case "iframe":
      case "pre":
      case "table":
        // Deferred: these aren't inline text, but a run inside a p/li/blockquote shouldn't
        // lose them either. flushPending turns each into its own block afterwards.
        ctx.pending.push(el);
        break;
      case "picture": {
        const img = el.querySelector("img");
        if (img) ctx.pending.push(img);
        break;
      }
      case "math": {
        const alt = collapse(el.getAttribute("alttext") ?? el.textContent);
        if (alt) out.push({ text: alt, ...marks, code: true });
        break;
      }
      case "a":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, href: safeHref(el.getAttribute("href"), ctx.base) }));
        break;
      case "strong":
      case "b":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, bold: true }));
        break;
      case "em":
      case "i":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, italic: true }));
        break;
      case "code":
      case "kbd":
      case "samp":
        out.push({ text: collapse(el.textContent), ...marks, code: true });
        break;
      default: {
        const blockish = !INLINE.has(el.localName);
        if (blockish) out.push({ text: " ", ...marks });
        out.push(...collectInline([...el.childNodes], ctx, marks));
        if (blockish) out.push({ text: " ", ...marks });
      }
    }
  }
  return out;
}

const sameMarks = (a: Inline, b: Inline) => a.href === b.href && a.bold === b.bold && a.italic === b.italic && a.code === b.code;

function normalizeInline(spans: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const span of spans) {
    const clean: Inline = { text: span.text };
    if (span.href) clean.href = span.href;
    if (span.bold) clean.bold = true;
    if (span.italic) clean.italic = true;
    if (span.code) clean.code = true;
    const last = merged.at(-1);
    if (last && sameMarks(last, clean)) last.text += clean.text;
    else merged.push(clean);
  }
  let afterSpace = true;
  for (const span of merged) {
    if (!span.code) {
      span.text = span.text.replace(/\s+/g, " ");
      if (afterSpace) span.text = span.text.replace(/^ /, "");
    }
    if (span.text) afterSpace = span.text.endsWith(" ");
  }
  const nonEmpty = merged.filter((span) => span.text.length > 0);
  const last = nonEmpty.at(-1);
  if (last && !last.code) last.text = last.text.replace(/ $/, "");
  return nonEmpty.filter((span) => span.text.length > 0);
}

function pushParagraph(nodes: Node[], ctx: Ctx) {
  const content = normalizeInline(collectInline(nodes, ctx));
  if (inlineText(content).trim()) ctx.out.push({ type: "paragraph", content });
  flushPending(ctx);
}

function pushList(el: Element, ctx: Ctx) {
  const items: Inline[][] = [];
  const nested: Element[] = [];
  for (const li of [...el.children].filter((child) => child.localName === "li")) {
    const own = [...li.childNodes].filter((node) => {
      const isList = node.nodeType === 1 && ["ul", "ol"].includes((node as Element).localName);
      if (isList) nested.push(node as Element);
      return !isList;
    });
    const content = normalizeInline(collectInline(own, ctx));
    if (inlineText(content).trim()) items.push(content);
  }
  if (items.length) ctx.out.push({ type: "list", ordered: el.localName === "ol", items });
  flushPending(ctx);
  // Nested <ul>/<ol> inside a <li> becomes its own following list block, not a nested
  // sub-list — accepted simplification, not a full outline structure.
  for (const list of nested) pushList(list, ctx);
}

function languageOf(el: Element): string | undefined {
  const classes = [el, el.querySelector("code"), el.parentElement]
    .map((node) => node?.getAttribute("class") ?? "")
    .join(" ");
  return /(?:language|lang|highlight-source)-([\w+#-]+)/.exec(classes)?.[1];
}

const isLtxEquation = (el: Element) => /\bltx_equation\b/.test(el.getAttribute("class") ?? "");

function pushTable(el: Element, ctx: Ctx) {
  if (isLtxEquation(el)) {
    const math = el.querySelector("math");
    const alt = math ? collapse(math.getAttribute("alttext") ?? math.textContent) : "";
    if (alt) ctx.out.push({ type: "paragraph", content: [{ text: alt, code: true }] });
    return;
  }
  const rows = [...el.querySelectorAll("tr")]
    .map((tr) =>
      [...tr.children]
        .map((cell) => inlineText(normalizeInline(collectInline([...cell.childNodes], ctx))).trim())
        .filter(Boolean)
        .join(" · "),
    )
    .filter(Boolean)
    .map((row): Inline[] => [{ text: row }]);
  if (rows.length) ctx.out.push({ type: "list", ordered: false, items: rows });
  flushPending(ctx); // images found in cells become their own image blocks
}

function visitChildren(parent: Element, ctx: Ctx) {
  let run: Node[] = [];
  const flush = () => {
    if (run.length) pushParagraph(run, ctx);
    run = [];
  };
  for (const node of [...parent.childNodes]) {
    const isInlineTag = node.nodeType === 3 || (node.nodeType === 1 && INLINE.has((node as Element).localName));
    const inline = isInlineTag && !(node.nodeType === 1 && (node as Element).querySelector(BLOCK_DESCENDANT_SELECTOR));
    if (inline) {
      run.push(node);
      continue;
    }
    if (node.nodeType !== 1) continue;
    flush();
    visitElement(node as Element, ctx);
  }
  flush();
}

function visitElement(el: Element, ctx: Ctx) {
  switch (el.localName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = collapse(el.textContent);
      const level = el.localName === "h3" ? 3 : ["h4", "h5", "h6"].includes(el.localName) ? 4 : 2;
      if (text) ctx.out.push({ type: "heading", level, text });
      return;
    }
    case "ul":
    case "ol":
      return pushList(el, ctx);
    case "p":
      // A paragraph is atomic: keep its children as one inline run so a stray <img>
      // (block-level per INLINE, but handled specially by collectInline) is hoisted
      // via ctx.pending instead of splitting the paragraph in visitChildren.
      return pushParagraph([...el.childNodes], ctx);
    case "blockquote": {
      const content = normalizeInline(collectInline([...el.childNodes], ctx));
      if (inlineText(content).trim()) ctx.out.push({ type: "quote", content, cite: safeHref(el.getAttribute("cite"), ctx.base) });
      return flushPending(ctx);
    }
    case "pre":
      return pushPre(el, ctx);
    case "figure": {
      const table = el.querySelector("table");
      if (table) return pushTable(table, ctx);
      const images = [...el.querySelectorAll("img")];
      if (images.length === 1) return pushImage(images[0], collapse(el.querySelector("figcaption")?.textContent), ctx);
      if (images.length > 1) {
        for (const img of images) pushImage(img, undefined, ctx);
        return;
      }
      return visitChildren(el, ctx);
    }
    case "img":
      return pushImage(el, undefined, ctx);
    case "picture": {
      const img = el.querySelector("img");
      if (img) pushImage(img, undefined, ctx);
      return;
    }
    case "iframe":
      return pushVideo(el, ctx);
    case "hr":
      ctx.out.push({ type: "divider" });
      return;
    case "table":
      return pushTable(el, ctx);
    default:
      return visitChildren(el, ctx);
  }
}

// ── Layer 2: block-level noise, after conversion ────────────────────────────

const SHARE_LINK = /(twitter\.com\/intent|x\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share|reddit\.com\/submit|news\.ycombinator\.com\/submitlink|t\.me\/share|wa\.me\/)/i;
// Call-to-action phrasing only, so real sentences that merely contain "sponsored" or "subscribe" survive.
const BOILERPLATE_PHRASE = /\b(subscribe to (our|the) newsletter|sign up for (our|the) newsletter|share this (post|article)|follow us|you might also like)\b/i;
// Short standalone labels: must be the block's *entire* text, not a substring of a real sentence.
const BOILERPLATE_EXACT = /^(advertisement|sponsored|related (posts|articles|stories)|iratkozz fel|hírlevél|kapcsolódó cikkek|hirdetés|oszd meg)$/i;
const isBoilerplate = (text: string) => BOILERPLATE_PHRASE.test(text) || BOILERPLATE_EXACT.test(text.trim());
// Filenames only: real figures like "silicon-photonics.jpg" or "avatar-generation-demo.png" must survive.
// "pixel"/"tracking"/"1x1" are dropped from the list — the width/height guard in pushImage already catches pixels.
const ICON_PATH = /(^|[-_./])(icon|logo|emoji|badge|sprite|spacer|gravatar)s?([-_./]|$)/i;

function isNoiseBlock(block: BlockDraft, baseHost: string): boolean {
  if (block.type === "image") return ICON_PATH.test(new URL(block.originalUrl).pathname);
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

export function filterNoise(blocks: BlockDraft[], baseUrl: string): BlockDraft[] {
  const baseHost = hostOf(baseUrl);
  const kept: BlockDraft[] = [];
  for (const block of blocks) {
    if (isNoiseBlock(block, baseHost)) continue;
    const previous = kept.at(-1);
    if (block.type === "divider" && (!previous || previous.type === "divider")) continue;
    if (previous && previous.type === block.type && blockIdentity(block) && blockIdentity(previous) === blockIdentity(block)) continue;
    kept.push(block);
  }
  while (kept.at(-1)?.type === "divider") kept.pop();
  return kept;
}

export function htmlToDrafts(html: string, options: HtmlToBlocksOptions): BlockDraft[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = document.body as unknown as Element;
  cleanDocument(body, options.baseUrl);
  const ctx: Ctx = { base: options.baseUrl, imageBase: options.imageBaseUrl ?? options.baseUrl, out: [], pending: [] };
  visitChildren(body, ctx);
  return filterNoise(ctx.out, options.baseUrl);
}

export const htmlToBlocks = (html: string, options: HtmlToBlocksOptions): Block[] => assignIds(htmlToDrafts(html, options));
