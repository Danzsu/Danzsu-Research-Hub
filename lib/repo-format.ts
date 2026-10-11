// "152K" reads the same in both languages, so a server view can render it without knowing the reader's.
const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** A repo's stars for a card: compact, or "—" before G1 (no count stored). */
export const formatStars = (stars: number | null): string => (stars === null ? "—" : compact.format(stars));

/** The line under a repo's name on both lists: language, stars, score, each "—" when unknown. */
export const repoStats = (language: string | null, stars: number | null, score: number | null): string =>
  `${language ?? "—"} · ★ ${formatStars(stars)} · ${score === null ? "—" : `${score}/100`}`;

const weekLabel = (week: string) => week.slice(5);

/** "W36–W39", or "W38" for a repo that was up one week. */
export const weekSpan = (first: string, last: string): string => (first === last ? weekLabel(last) : `${weekLabel(first)}–${weekLabel(last)}`);
