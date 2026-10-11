import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { RatingTarget, RatingValue } from "@/lib/ratings";
import { dislikedClass } from "./rating-classes";
import { RatingControl } from "./rating-control";

/** A repo on paper: the Radar's Top 10 row and the GitHub page's row. The name is the link (a button can't sit
 *  in a link, so the card itself isn't one); the rating group sits inside, at the foot (spec 2.2). The card sets
 *  its own ink text (the GitHub page is an ink page with paper text) and has no press of its own: :active
 *  matches ancestors, so a press on a rating button would press the whole card. */
export function RepoCard({ rank, repo, url, focus, meta, target, initial, className = "" }: {
  rank?: number;
  repo: string;
  url: string;
  focus: string;
  /** The mono line at the foot: language, stars, score, weeks. */
  meta: ReactNode;
  target: RatingTarget;
  initial: RatingValue | null;
  className?: string;
}) {
  return (
    <article className={`min-w-0 border-2 border-ink bg-paper p-4 text-ink transition motion-safe:hover:-translate-y-0.5 ${dislikedClass} ${className}`}>
      <div className="flex items-start gap-4">
        {rank !== undefined && <span className="font-display text-3xl leading-none text-signal">{String(rank).padStart(2, "0")}</span>}
        <div className="min-w-0 flex-1">
          <a href={url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-2 font-mono text-sm font-bold [overflow-wrap:anywhere] hover:text-signal">
            {repo}
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          </a>
          {focus && <p className="text-sm text-ink/55">{focus}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="min-w-48 flex-1 font-mono text-[11px] text-ink/55">{meta}</p>
        <RatingControl target={target} initial={initial} />
      </div>
    </article>
  );
}
