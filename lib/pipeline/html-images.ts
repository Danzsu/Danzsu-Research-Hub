import { safeHref } from "../blocks.ts";

const SRCSET_WHITESPACE = /[ \t\n\f\r]/;

/**
 * HTML spec "parse a srcset attribute": splits on whitespace only and tolerates a comma
 * directly after a descriptor with no following space, and commas inside the URL itself
 * (Substack/Cloudinary transform URLs). Returns candidate URLs sorted by descriptor size, largest first.
 */
export function parseSrcset(srcset: string): string[] {
  const candidates: { url: string; size: number }[] = [];
  let pos = 0;
  const len = srcset.length;
  while (pos < len) {
    while (pos < len && (SRCSET_WHITESPACE.test(srcset[pos]) || srcset[pos] === ",")) pos++;
    if (pos >= len) break;
    const urlStart = pos;
    while (pos < len && !SRCSET_WHITESPACE.test(srcset[pos])) pos++;
    let url = srcset.slice(urlStart, pos);
    let size = 1;
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, ""); // URL ends in commas: no descriptor follows
    } else {
      while (pos < len && SRCSET_WHITESPACE.test(srcset[pos])) pos++;
      const descStart = pos;
      let depth = 0;
      while (pos < len && (srcset[pos] !== "," || depth > 0)) {
        if (srcset[pos] === "(") depth++;
        else if (srcset[pos] === ")") depth--;
        pos++;
      }
      const descriptor = srcset.slice(descStart, pos).trim();
      if (pos < len) pos++; // consume the comma
      const match = /^(\d+(?:\.\d+)?)[wx]$/.exec(descriptor);
      if (match) size = Number.parseFloat(match[1]) || 1;
    }
    if (url) candidates.push({ url, size });
  }
  return candidates.sort((a, b) => b.size - a.size).map((c) => c.url);
}

/** Resolves the best available image URL for an <img>, trying srcset/lazy-load fallbacks in order. */
export function imageUrl(img: Element, imageBase: string, resolveImage?: (raw: string) => string | undefined): string | undefined {
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
    const href = safeHref(resolveImage?.(candidate) ?? candidate, imageBase);
    if (href) return href;
  }
  return undefined;
}

// Filenames only (last path segment): real figures like "silicon-photonics.jpg" or
// "avatar-generation-demo.png" must survive. Badges and avatars are caught by host/path instead.
const ICON_FILENAME = /(^|[-_.])(icon|logo|emoji|badge|sprite|spacer)s?([-_.]|$)/i;
const BADGE_HOST = /(^|\.)img\.shields\.io$/i;
const AVATAR_HOST = /((^|\.)gravatar\.com$)|(avatars\d*\.githubusercontent\.com$)/i;

/** Icons/logos/badges/avatars, not real figures. */
export function isIconOrAvatarImage(url: URL): boolean {
  if (BADGE_HOST.test(url.hostname) || url.pathname.split("/").includes("badge")) return true;
  if (AVATAR_HOST.test(url.hostname)) return true;
  const filename = url.pathname.split("/").pop() ?? "";
  return ICON_FILENAME.test(filename);
}
