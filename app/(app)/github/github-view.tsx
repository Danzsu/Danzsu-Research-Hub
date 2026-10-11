import Link from "next/link";
import { FilterChips } from "@/app/components/filter-chips";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { RepoCard } from "@/app/components/repo-card";
import type { GithubRepo } from "@/lib/content";
import { RATING_FILTERS, type RatingFilter } from "@/lib/ratings";
import { repoStats, weekSpan } from "@/lib/repo-format";

const copy = {
  lead: {
    hu: "A heti Top 10 repói egy listában: mikor voltak fent, hányadikak lettek, és mit gondolsz róluk.",
    en: "Every weekly Top 10 repo in one list: when it was up, how high it ranked, and what you think of it.",
  },
  ratingLabel: { hu: "Szűrés értékelés szerint", en: "Filter by rating" },
  languageLabel: { hu: "Szűrés nyelv szerint", en: "Filter by language" },
  all: { hu: "Mind", en: "All" },
  heart: { hu: "❤ Kedvenc", en: "❤ Favourite" },
  up: { hu: "👍 Hasznos", en: "👍 Useful" },
  down: { hu: "👎 Nem hasznos", en: "👎 Not useful" },
  none: { hu: "Értékeletlen", en: "Unrated" },
  weeks: { hu: "hét", en: "weeks" },
  best: { hu: "legjobb", en: "best" },
  more: { hu: "Továbbiak →", en: "More →" },
  empty: { hu: "Ehhez a szűrőhöz nincs repó.", en: "No repo matches this filter." },
};

export type GithubFilters = { rating?: RatingFilter; language?: string; page: number };

/** The page's link with `filters` merged in; page 1 and an empty filter stay out of the URL. */
export function githubHref(filters: { rating?: RatingFilter; language?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (filters.rating) params.set("rating", filters.rating);
  if (filters.language) params.set("lang", filters.language);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/github?${query}` : "/github";
}

/** The GitHub page (G1 spec 4; its own menu item since the codebase-order spec): every repo the weekly Top 10s held, with the reader's rating. */
export function GithubView({ repos, more, languages, filters }: { repos: GithubRepo[]; more: boolean; languages: string[]; filters: GithubFilters }) {
  const { rating, language } = filters;
  const ratingChips = [undefined, ...(Object.keys(RATING_FILTERS) as RatingFilter[])].map((value) => ({
    href: githubHref({ rating: value, language }),
    label: <LocalizedText value={copy[value ?? "all"]} />,
    current: value === rating,
  }));
  const languageChips = [undefined, ...languages].map((value) => ({
    href: githubHref({ rating, language: value }),
    label: value ?? <LocalizedText value={copy.all} />,
    current: value === language,
  }));
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="REPOS / REPÓK" title="GITHUB" lead={<LocalizedText value={copy.lead} />} />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-10">
        <div className="grid gap-3">
          <FilterChips label={copy.ratingLabel} chips={ratingChips} />
          <FilterChips label={copy.languageLabel} chips={languageChips} />
        </div>
        {!repos.length && (
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />
          </p>
        )}
        <ul className="grid gap-3">
          {repos.map((repo) => (
            <li key={repo.key}>
              <RepoCard
                repo={repo.repo}
                url={repo.url}
                focus={repo.focus}
                meta={
                  <>
                    {repoStats(repo.language, repo.stars, repo.score)} · {weekSpan(repo.firstWeek, repo.lastWeek)} ·{" "}
                    {repo.weekCount} <LocalizedText value={copy.weeks} /> · <LocalizedText value={copy.best} /> #{repo.bestRank}
                  </>
                }
                target={{ kind: "repo", id: repo.key }}
                initial={repo.rating}
              />
            </li>
          ))}
        </ul>
        {more && (
          <Link href={githubHref({ ...filters, page: filters.page + 1 })} className="press-ink focus-ring flex min-h-10 items-center justify-self-start border-2 border-paper/30 px-4 font-mono text-xs">
            <LocalizedText value={copy.more} />
          </Link>
        )}
      </section>
    </main>
  );
}
