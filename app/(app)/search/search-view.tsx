import Link from "next/link";
import { BookOpen, ExternalLink, GitFork, Newspaper, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, type SearchHit, type SearchKind } from "@/lib/search";

const copy = {
  lead: {
    hu: "A Radar-hírekben, a Library-posztok teljes szövegében és a GitHub-repókban, elgépelés-tűrően.",
    en: "Across the Radar's stories, the full text of Library posts and the GitHub repos, typo-tolerant.",
  },
  go: { hu: "Keresés", en: "Search" },
  hint: { hu: `Írj be legalább ${SEARCH_MIN_LENGTH} karaktert.`, en: `Type at least ${SEARCH_MIN_LENGTH} characters.` },
  none: { hu: "Nincs találat. Próbálj rövidebb szót, vagy más írásmódot.", en: "No match. Try a shorter word or another spelling." },
  original: { hu: "Eredeti", en: "Original" },
  newTab: { hu: "új lapon", en: "in a new tab" },
  item: { hu: "HÍR", en: "STORY" },
  post: { hu: "POSZT", en: "POST" },
  repo: { hu: "REPÓ", en: "REPO" },
};

const ICONS: Record<SearchKind, LucideIcon> = { item: Newspaper, post: BookOpen, repo: GitFork };

/** The search page body (`/search?q=`); the offline preview renders it with fixtures. */
export function SearchView({ query, hits }: { query: string; hits: SearchHit[] }) {
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="SEARCH / KERESÉS" title="SEARCH" lead={<LocalizedText value={copy.lead} />} />
      <section className="mx-auto grid max-w-[1600px] gap-6 px-4 py-10 sm:px-10">
        <form action="/search" role="search" className="flex max-w-2xl gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            aria-label="Search / Keresés"
            className="focus-ring min-h-10 min-w-0 flex-1 border-2 border-paper/40 bg-ink px-3 font-mono text-sm text-paper placeholder:text-paper/40"
          />
          <button type="submit" className="press-ink focus-ring min-h-10 border-2 border-paper/40 px-4 font-mono text-xs">
            <LocalizedText value={copy.go} />
          </button>
        </form>
        {query.length < SEARCH_MIN_LENGTH || hits.length === 0 ? (
          <EmptyState tone="ink">
            <LocalizedText value={query.length < SEARCH_MIN_LENGTH ? copy.hint : copy.none} />
          </EmptyState>
        ) : (
          <ol className="grid max-w-3xl gap-3">
            {hits.map((hit) => {
              const Icon = ICONS[hit.kind];
              return (
                <li key={`${hit.kind}:${hit.id}`} className="border-2 border-paper/30 bg-[#1c1c1c] p-4">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-signal">
                    <Icon className="size-3.5" aria-hidden="true" />
                    <LocalizedText value={copy[hit.kind]} />
                    <span className="text-paper/55">{hit.meta}</span>
                  </p>
                  <h2 className="mt-1 font-display text-2xl leading-tight [overflow-wrap:anywhere]">
                    <Link href={hit.href} className="focus-ring hover:text-signal">
                      {hit.title}
                    </Link>
                  </h2>
                  {hit.snippet && <p className="mt-2 max-w-[75ch] text-sm leading-6 text-paper/70">{hit.snippet}</p>}
                  {hit.url && (
                    <a href={hit.url} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-flex min-h-10 items-center gap-1 font-mono text-xs text-paper/70 underline hover:text-signal">
                      <ExternalLink className="size-3.5" aria-hidden="true" /> <LocalizedText value={copy.original} />
                      <span className="sr-only">
                        (<LocalizedText value={copy.newTab} />)
                      </span>
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
