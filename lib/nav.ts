import type { Localized } from "../data/digest-types.ts";

// The one list both navigations are built from: the mobile bottom bar and the desktop nav.

export type NavId = "radar" | "library" | "search" | "archive" | "collection" | "stats" | "chat";

export type NavItem = {
  id: NavId;
  /** Null when it is not a page: search opens the palette slot (milestone C adds /search), soon items are inert. */
  href: string | null;
  label: Localized;
  /** Dimmed with a "soon" badge, not clickable. */
  soon?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "radar", href: "/", label: { hu: "Radar", en: "Radar" } },
  { id: "library", href: "/library", label: { hu: "Könyvtár", en: "Library" } },
  { id: "search", href: null, label: { hu: "Keresés", en: "Search" } },
  { id: "archive", href: "/archive", label: { hu: "Archívum", en: "Archive" } },
  { id: "collection", href: null, soon: true, label: { hu: "Gyűjtemény", en: "Collection" } },
  { id: "stats", href: null, soon: true, label: { hu: "Statisztika", en: "Statistics" } },
  { id: "chat", href: null, soon: true, label: { hu: "Chat", en: "Chat" } },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => !item.soon);
export const SOON_NAV = NAV_ITEMS.filter((item) => item.soon);

/** The item a path belongs to, by prefix at a segment boundary: /archive/2026-W38 → archive. "/" matches only itself. */
export function activeNavId(pathname: string): NavId | null {
  const match = NAV_ITEMS.find(({ href }) =>
    href === "/" ? pathname === "/" : href !== null && (pathname === href || pathname.startsWith(`${href}/`)),
  );
  return match?.id ?? null;
}

/**
 * Pages that hold every text in both languages (client components, or LocalizedText): the toggle
 * switches them without a server round trip. Any other page is refreshed, so nothing stays in the old language.
 * /dev/preview renders the same list views on fixtures (development only); its post view, /dev/preview/post, is refreshed.
 */
const IN_PLACE_LANGUAGE = [/^\/$/, /^\/library\/?$/, /^\/archive(\/[^/]+)?\/?$/, /^\/dev\/preview\/?$/];

export const switchesLanguageInPlace = (pathname: string) => IN_PLACE_LANGUAGE.some((pattern) => pattern.test(pathname));
