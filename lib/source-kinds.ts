import type { Localized } from "../data/digest-types.ts";
import type { SourceKind } from "./pipeline/util.ts";

/** Each source kind's name: the post page's badge (upper-cased there) and the link chat's replies. */
export const SOURCE_KIND_LABELS: Record<SourceKind, Localized> = {
  article: { hu: "cikk", en: "article" },
  youtube: { hu: "YouTube-videó", en: "YouTube video" },
  arxiv: { hu: "arXiv-tanulmány", en: "arXiv paper" },
  github: { hu: "GitHub-repó", en: "GitHub repo" },
  x: { hu: "X-poszt", en: "X post" },
  pdf: { hu: "PDF", en: "PDF" },
};
