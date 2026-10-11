import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { FilterChips } from "@/app/components/filter-chips";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { RatingControl } from "@/app/components/rating-control";
import type { Favorite } from "@/lib/content";
import type { RatingKind } from "@/lib/ratings";

const copy = {
  lead: {
    hu: "Amit szívvel jelöltél: hírek, posztok és repók, hetektől függetlenül.",
    en: "What you marked with a heart: news, posts and repos, whatever the week.",
  },
  label: { hu: "Szűrés típus szerint", en: "Filter by kind" },
  all: { hu: "Mind", en: "All" },
  item: { hu: "Hírek", en: "News" },
  post: { hu: "Posztok", en: "Posts" },
  repo: { hu: "Repók", en: "Repos" },
  empty: {
    hu: "Még nincs kedvenced. A ❤ gombbal jelölhetsz híreket, posztokat és repókat.",
    en: "No favourites yet. Mark news, posts and repos with the ❤ button.",
  },
};

export const KINDS: RatingKind[] = ["item", "post", "repo"];
const linkClass = "focus-ring inline-flex min-h-10 items-center gap-2 font-bold [overflow-wrap:anywhere] hover:text-signal";

/** The collection (G1 spec 5): the reader's ❤ items, posts and repos; un-hearting one keeps it here until the next visit. */
export function CollectionView({ favorites, kind }: { favorites: Favorite[]; kind?: RatingKind }) {
  const chips = [undefined, ...KINDS].map((value) => ({
    href: value ? `/collection?kind=${value}` : "/collection",
    label: <LocalizedText value={copy[value ?? "all"]} />,
    current: value === kind,
  }));
  const shown = kind ? favorites.filter((favorite) => favorite.kind === kind) : favorites;
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="FAVOURITES / KEDVENCEK" title="GYŰJTEMÉNY" lead={<LocalizedText value={copy.lead} />} />
      <section className="mx-auto grid max-w-[1600px] gap-6 px-4 py-10 sm:px-10">
        <FilterChips label={copy.label} chips={chips} />
        {!shown.length && (
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />
          </p>
        )}
        <ul className="grid gap-3">
          {shown.map((favorite) => {
            const title = typeof favorite.title === "string" ? favorite.title : <LocalizedText value={favorite.title} />;
            return (
              <li key={`${favorite.kind}:${favorite.id}`} className="flex flex-wrap items-center gap-4 border-2 border-paper/30 bg-[#1c1c1c] p-4">
                <div className="min-w-48 flex-1">
                  {favorite.external ? (
                    <a href={favorite.href} target="_blank" rel="noreferrer" className={linkClass}>
                      {title}
                      <ExternalLink className="size-4 shrink-0" />
                    </a>
                  ) : (
                    <Link href={favorite.href} className={linkClass}>
                      {title}
                    </Link>
                  )}
                  <p className="mt-1 font-mono text-xs text-paper/55">
                    <LocalizedText value={copy[favorite.kind]} />
                    {favorite.detail && ` · ${favorite.detail}`}
                  </p>
                </div>
                <RatingControl target={{ kind: favorite.kind, id: favorite.id }} initial={2} />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
