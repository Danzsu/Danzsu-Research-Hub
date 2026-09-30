import { Skeleton } from "@/components/ui/skeleton";
import { LocalizedText } from "./language-context";
import { HeroBand } from "./page-header";

// The loading.tsx fallbacks, one per page shape (spec 2.2). The page's surface and its bands paint at
// once, so a prefetched click lands on the right colours in its first frame, with no ink-to-cream flash.
// The placeholders fade in only after 150ms (`.skeleton-fill`, globals.css), so a fast load flashes none.

const loading = { hu: "Betöltés…", en: "Loading…" };

/** The one live-region line every skeleton carries; nothing visible says "loading". */
function Busy() {
  return (
    <p role="status" className="sr-only">
      <LocalizedText value={loading} />
    </p>
  );
}

/** `/`, `/companies` and `/archive/[week]`: the cream column, the header and chip bands, the ink hero, the Top 3 and
 *  three stories. `/companies` has no category bar, so it leaves the chip band out (`chips={false}`). */
export function RadarSkeleton({ chips = true }: { chips?: boolean }) {
  return (
    <div className="min-h-dvh min-w-0 bg-cream text-ink" aria-busy="true">
      <Busy />
      <div className="h-16 border-b-2 border-ink" />
      {chips && <div className="h-14 border-b-2 border-ink" />}
      <div className="px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
        <div className="h-56 border-2 border-ink bg-ink sm:h-64" />
        <div className="skeleton-fill mt-9 space-y-4 @container">
          <div className="grid gap-4 @3xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="border-2 border-ink bg-paper p-5">
                <Skeleton className="h-10 w-12 rounded-none" />
                <Skeleton className="mt-5 h-6 rounded-none" />
                <Skeleton className="mt-2 h-6 w-2/3 rounded-none" />
              </div>
            ))}
          </div>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-28 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** `/library` (with `form`, the submit form's block) and `/archive`: the ink page, the cream title band, the card grid. */
export function ListSkeleton({ form = false }: { form?: boolean }) {
  return (
    <main className="min-h-dvh bg-ink text-paper" aria-busy="true">
      <Busy />
      <HeroBand
        aside={
          form && (
            <div className="skeleton-fill">
              <Skeleton className="h-40 rounded-none border-2 border-ink bg-paper" />
            </div>
          )
        }
      >
        <div className="skeleton-fill">
          <Skeleton className="h-3 w-48 rounded-none" />
          <Skeleton className="mt-4 h-16 w-3/4 rounded-none sm:h-24" />
          <Skeleton className="mt-7 h-5 max-w-2xl rounded-none" />
          <Skeleton className="mt-2 h-5 w-2/3 max-w-xl rounded-none" />
        </div>
      </HeroBand>
      <div className="skeleton-fill mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-10 lg:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-56 rounded-none bg-paper/10" />
        ))}
      </div>
    </main>
  );
}

/** `/library/[id]`: the ink page and the cream article, its badge row, title, toolbar, summary and blocks, 75ch at most. */
export function PostSkeleton() {
  return (
    <main className="min-h-dvh bg-ink text-paper" aria-busy="true">
      <Busy />
      <article className="bg-cream text-ink">
        <div className="skeleton-fill mx-auto max-w-6xl px-4 py-10 sm:px-10 sm:py-16">
          <div className="border-b-2 border-ink pb-6">
            <Skeleton className="h-5 w-56 max-w-full rounded-none" />
            <Skeleton className="mt-4 h-12 w-4/5 rounded-none" />
            <Skeleton className="mt-2 h-12 w-3/5 rounded-none" />
            <Skeleton className="mt-6 h-10 w-64 max-w-full rounded-none" />
          </div>
          <div className="mt-8 max-w-[75ch] space-y-3">
            <Skeleton className="h-6 rounded-none" />
            <Skeleton className="h-6 w-5/6 rounded-none" />
          </div>
          <div className="mt-12 max-w-[75ch] space-y-3">
            {[0, 1, 2, 3, 4].map((line) => (
              <Skeleton key={line} className="h-4 rounded-none" />
            ))}
          </div>
        </div>
      </article>
    </main>
  );
}
