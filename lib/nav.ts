import type { Localized } from "../data/digest-types.ts";

// The one list both navigations are built from: the mobile bottom bar and the desktop nav.

// Three sections (2026-11-01 review): the Radar's own views (Daily, AI companies, GitHub) are chips in its
// middle band, and the archive and the collection are Library tabs, so the menu repeats none of them.
export type NavId = "radar" | "search" | "library";

export type NavItem = {
  id: NavId;
  /** Null when it is not a page: search opens the palette slot (milestone C adds /search), soon items are inert. */
  href: string | null;
  label: Localized;
  /** Other pages that belong to this section, so its entry stays marked there. */
  section?: readonly string[];
  /** Dimmed with a "soon" badge, not clickable. No item carries it today (2a spec D5); the dashboard (2c) may bring one back. */
  soon?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "radar", href: "/", section: ["/daily", "/companies", "/github"], label: { hu: "Radar", en: "Radar" } },
  { id: "search", href: null, label: { hu: "Keresés", en: "Search" } },
  { id: "library", href: "/library", section: ["/archive", "/collection"], label: { hu: "Könyvtár", en: "Library" } },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => !item.soon);
/** The mobile bar's taiyaki goes after the first MOBILE_CHAT_SLOT entries; the account sheet comes last. */
export const MOBILE_CHAT_SLOT = 2;

/** True when `pathname` is `prefix` or under it, at a segment boundary. "/" matches only itself. */
const under = (pathname: string, prefix: string) => (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`));

/** The section a path belongs to: /archive/2026-W38 → library, /daily → radar. */
export function activeNavId(pathname: string): NavId | null {
  const match = NAV_ITEMS.find(({ href, section = [] }) => [...(href ? [href] : []), ...section].some((prefix) => under(pathname, prefix)));
  return match?.id ?? null;
}

/**
 * Pages that hold every text in both languages (client components, or LocalizedText): the toggle
 * switches them without a server round trip. Any other page is refreshed, so nothing stays in the old language.
 * /dev/preview renders the same list views on fixtures (development only); its post view, /dev/preview/post, is refreshed.
 */
const IN_PLACE_LANGUAGE = [/^\/$/, /^\/daily\/?$/, /^\/companies\/?$/, /^\/library\/?$/, /^\/archive(\/[^/]+)?\/?$/, /^\/collection\/?$/, /^\/github\/?$/, /^\/dev\/preview\/?$/];

export const switchesLanguageInPlace = (pathname: string) => IN_PLACE_LANGUAGE.some((pattern) => pattern.test(pathname));
