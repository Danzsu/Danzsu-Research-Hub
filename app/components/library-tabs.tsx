import { FilterChips } from "./filter-chips";
import { LocalizedText } from "./language-context";

const copy = {
  label: { hu: "Könyvtár részei", en: "Library sections" },
  posts: { hu: "Posztok", en: "Posts" },
  archive: { hu: "Archívum", en: "Archive" },
  collection: { hu: "Gyűjtemény", en: "Collection" },
};

const TABS = [
  { id: "posts", href: "/library" },
  { id: "archive", href: "/archive" },
  { id: "collection", href: "/collection" },
] as const;

/** The Library's tabs, under each of its pages' hero: the archive and the collection live here, not in the menu
 *  (2026-11-01 review). */
export function LibraryTabs({ current }: { current: (typeof TABS)[number]["id"] }) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 sm:px-10">
      <FilterChips label={copy.label} chips={TABS.map(({ id, href }) => ({ href, current: id === current, label: <LocalizedText value={copy[id]} /> }))} />
    </div>
  );
}
