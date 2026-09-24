import { parseHTML } from "linkedom";
import { assignIds, blockText, inlineText, safeHref, type Block, type BlockDraft, type Inline } from "../blocks.ts";

export type HtmlToBlocksOptions = { baseUrl: string; imageBaseUrl?: string };

// ── Layer 1: structural and named noise, removed before conversion ──────────

const DROP = [
  "script", "style", "noscript", "template", "form", "button", "input", "select", "textarea",
  "nav", "aside", "footer", "svg", "canvas",
  "[role=navigation]", "[role=banner]", "[role=complementary]", "[aria-hidden=true]",
].join(", ");
const NOISE_NAME = /(^|[-_])(ad|ads|adv|advert\w*|sponsor\w*|promo\w*|newsletter\w*|subscribe\w*|share\w*|sharing|social\w*|related\w*|comments?|cookie\w*|popup\w*|modal\w*|banner\w*|paywall\w*|outbrain|taboola)([-_]|$)/i;
const VIDEO_IFRAME = /^https?:\/\/(www\.)?(youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/i;
/** Noise boxes are small; a container with this much text is the article itself (e.g. class="post-share-enabled"). */
const MAX_NOISE_TEXT = 1500;

function isNoiseElement(el: Element): boolean {
  const names = [...(el.getAttribute("class") ?? "").split(/\s+/), el.getAttribute("id") ?? ""].filter(Boolean);
  const named = names.some((name) => NOISE_NAME.test(name));
  const adData = el.getAttributeNames().some((attr) => attr.startsWith("data-ad"));
  return (named || adData) && (el.textContent ?? "").length < MAX_NOISE_TEXT;
}

/** Strips page chrome and named noise. Mutates `root`; run it before Readability too. */
export function cleanDocument(root: Element): void {
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  root.querySelectorAll("iframe").forEach((el) => {
    if (!VIDEO_IFRAME.test(el.getAttribute("src") ?? "")) el.remove();
  });
  root.querySelectorAll("*").forEach((el) => {
    if (el.isConnected && isNoiseElement(el)) el.remove();
  });
}

// ── Conversion ───────────────────────────────────────────────────────────────

type Marks = { href?: string; bold?: true; italic?: true };
type Ctx = { base: string; imageBase: string; out: BlockDraft[]; pending: Element[] };

const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd",
  "label", "mark", "math", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; size: number } | undefined;
  for (const candidate of srcset.split(",")) {
    const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
    const size = Number.parseFloat(descriptor) || 1;
    if (url && (!best || size > best.size)) best = { url, size };
  }
  return best?.url;
}

function imageUrl(img: Element, ctx: Ctx): string | undefined {
  const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
  const candidates = [
    srcset ? largestFromSrcset(srcset) : undefined,
    img.getAttribute("data-src"),
    img.getAttribute("data-original"),
    img.getAttribute("src"),
  ];
  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith("data:")) return safeHref(candidate, ctx.imageBase);
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

function flushPending(ctx: Ctx) {
  const images = ctx.pending;
  ctx.pending = [];
  for (const img of images) pushImage(img, undefined, ctx);
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
  for (const list of nested) pushList(list, ctx);
}

function languageOf(el: Element): string | undefined {
  const classes = [el, el.querySelector("code"), el.parentElement]
    .map((node) => node?.getAttribute("class") ?? "")
    .join(" ");
  return /(?:language|lang|highlight-source)-([\w+#-]+)/.exec(classes)?.[1];
}

function pushTable(el: Element, ctx: Ctx) {
  const rows = [...el.querySelectorAll("tr")]
    .map((tr) => [...tr.children].map((cell) => collapse(cell.textContent)).filter(Boolean).join(" · "))
    .filter(Boolean)
    .map((row): Inline[] => [{ text: row }]);
  if (rows.length) ctx.out.push({ type: "list", ordered: false, items: rows });
}

function pushVideo(el: Element, ctx: Ctx) {
  const src = el.getAttribute("src") ?? "";
  const youtube = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/.exec(src)?.[1];
  const vimeo = /player\.vimeo\.com\/video\/(\d+)/.exec(src)?.[1];
  if (youtube) ctx.out.push({ type: "video", provider: "youtube", videoId: youtube });
  else if (vimeo) ctx.out.push({ type: "video", provider: "vimeo", videoId: vimeo });
}

function visitChildren(parent: Element, ctx: Ctx) {
  let run: Node[] = [];
  const flush = () => {
    if (run.length) pushParagraph(run, ctx);
    run = [];
  };
  for (const node of [...parent.childNodes]) {
    const inline = node.nodeType === 3 || (node.nodeType === 1 && INLINE.has((node as Element).localName));
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
    case "pre": {
      const code = (el.textContent ?? "").replace(/\n+$/, "");
      if (code.trim()) ctx.out.push({ type: "code", language: languageOf(el), code });
      return;
    }
    case "figure": {
      const img = el.querySelector("img");
      if (img) return pushImage(img, collapse(el.querySelector("figcaption")?.textContent), ctx);
      if (el.querySelector("table")) return pushTable(el.querySelector("table")!, ctx);
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
const BOILERPLATE = /\b(subscribe|newsletter|sign up|share (this|on)|follow us|advertisement|sponsored|related (posts|articles|stories)|you might also like|iratkozz fel|hírlevél|kapcsolódó cikkek|hirdetés|oszd meg)\b/i;
const ICON_PATH = /(icon|logo|avatar|emoji|badge|sprite|pixel|tracking|spacer|gravatar|1x1)/i;

function isNoiseBlock(block: BlockDraft, baseHost: string): boolean {
  if (block.type === "image") return ICON_PATH.test(new URL(block.originalUrl).pathname);
  if (block.type === "list") return block.items.every((item) => !inlineText(item).trim() || item.some((s) => s.href && SHARE_LINK.test(s.href)));
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "quote") return false;
  const text = blockText(block).trim();
  if (!text) return true;
  if (text.length < 120 && BOILERPLATE.test(text)) return true;
  if (block.type === "heading") return false;
  const links = block.content.filter((span) => span.href);
  if (links.some((span) => SHARE_LINK.test(span.href!)) && text.length < 200) return true;
  // Short, link-only paragraphs pointing back into the same site are navigation ("Next post").
  const linkOnly = block.content.every((span) => span.href || !span.text.trim());
  return linkOnly && text.length < 40 && links.every((span) => new URL(span.href!).hostname === baseHost);
}

export function filterNoise(blocks: BlockDraft[], baseUrl: string): BlockDraft[] {
  const baseHost = new URL(baseUrl).hostname;
  const kept: BlockDraft[] = [];
  for (const block of blocks) {
    if (isNoiseBlock(block, baseHost)) continue;
    const previous = kept.at(-1);
    if (block.type === "divider" && (!previous || previous.type === "divider")) continue;
    if (previous && previous.type === block.type && blockText(block) && blockText(previous) === blockText(block)) continue;
    kept.push(block);
  }
  while (kept.at(-1)?.type === "divider") kept.pop();
  return kept;
}

export function htmlToDrafts(html: string, options: HtmlToBlocksOptions): BlockDraft[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = document.body as unknown as Element;
  cleanDocument(body);
  const ctx: Ctx = { base: options.baseUrl, imageBase: options.imageBaseUrl ?? options.baseUrl, out: [], pending: [] };
  visitChildren(body, ctx);
  return filterNoise(ctx.out, options.baseUrl);
}

export const htmlToBlocks = (html: string, options: HtmlToBlocksOptions): Block[] => assignIds(htmlToDrafts(html, options));
