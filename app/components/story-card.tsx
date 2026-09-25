import { Bookmark, BookmarkCheck, Check, Clock3, ExternalLink, ListChecks, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DigestItem, Language } from "@/data/digest-types";
import type { Flag, ItemState } from "@/lib/reader-store";
import { Tag } from "./tag";

const copy = {
  hu: {
    score: "PONT",
    min: "PERC",
    why: "MIÉRT FONTOS",
    open: "Megnyitás",
    later: "Később",
    addTodo: "Teendőhöz adás",
    hasTodo: "Már a teendők között",
    read: "Olvasott",
  },
  en: {
    score: "SCORE",
    min: "MIN",
    why: "WHY IT MATTERS",
    open: "Open source",
    later: "Later",
    addTodo: "Add to to-dos",
    hasTodo: "Already a to-do",
    read: "Read",
  },
};

export type CardActions = {
  /** The Open link was followed: marks the item read. */
  onOpen: (item: DigestItem) => void;
  onToggle: (itemId: string, flag: Flag) => void;
  onAddTodo: (item: DigestItem) => void;
};

export type CardProps = { item: DigestItem; state: ItemState; hasTodo: boolean; language: Language; actions: CardActions };

const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";

/** A feed card: meta (a 96px gutter from lg up), the text, then every action in one row at the bottom. */
export function StoryCard(props: CardProps) {
  const { item, state, language } = props;
  const t = copy[language];
  return (
    <article className={`story-card border-2 border-ink bg-paper p-5 sm:p-6 ${state.read ? "story-read" : ""}`}>
      <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-5">
        {/* A row of meta on narrow screens, the 96px gutter from lg up. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px] leading-5 text-ink/55 lg:block">
          <p className="text-signal">{item.publishedLabel}</p>
          <p className="lg:mt-2">
            {t.score} <span className="font-display text-xl text-ink lg:block lg:text-3xl">{item.score}</span>
          </p>
          <p className="flex items-center gap-1 lg:mt-2">
            <Clock3 className="size-3" /> {item.readMinutes} {t.min}
          </p>
        </div>
        <div className="min-w-0">
          <CardText {...props} titleClassName="max-w-3xl text-[clamp(1.5rem,3vw,2.6rem)] leading-[0.98] tracking-tight" />
          <CardFooter {...props} />
        </div>
      </div>
    </article>
  );
}

/** A Top 3 card: rank and score on top, then the same text and actions as a feed card. */
export function MustReadCard({ rank, ...props }: CardProps & { rank: number }) {
  const { item, state } = props;
  return (
    <article className={`must-card border-2 border-ink bg-paper p-5 ${state.read ? "story-read" : ""}`}>
      <div className="mb-6 flex items-start justify-between">
        <span className="font-display text-5xl text-signal">{String(rank).padStart(2, "0")}</span>
        <span className="border border-ink px-2 py-1 font-mono text-[10px]">{item.score}/100</span>
      </div>
      <CardText {...props} titleClassName="text-2xl leading-[1.02]" />
      <CardFooter {...props} />
    </article>
  );
}

function CardText({ item, language, titleClassName }: CardProps & { titleClassName: string }) {
  const t = copy[language];
  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.12em] text-signal [overflow-wrap:anywhere]">{item.source}</p>
      <h2 className={`mt-3 font-display [overflow-wrap:anywhere] ${titleClassName}`}>{item.title[language]}</h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-ink/72">{item.summary[language]}</p>
      <div className="mt-5 border-l-4 border-signal pl-4">
        <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.why}</p>
        <p className="mt-1 text-sm leading-6">{item.why[language]}</p>
      </div>
      {item.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Tag key={tag} tag={tag} />
          ))}
        </div>
      )}
    </>
  );
}

/** [Open] [rating: milestone B] [Later] [+ to-do] … [Read]: every action in one row at the bottom, in thumb reach. */
function CardFooter({ item, state, hasTodo, language, actions }: CardProps) {
  const t = copy[language];
  const todoLabel = hasTodo ? t.hasTodo : t.addTodo;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Button asChild variant="ink" className="min-h-10">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => actions.onOpen(item)}
          onAuxClick={(event) => {
            if (event.button === 1) actions.onOpen(item); // a middle click opens a tab too
          }}
        >
          {t.open} <ExternalLink />
        </a>
      </Button>
      {/* Milestone B puts the 👎 👍 ❤ RatingControl here, between Open and Later (spec 1.4.3). */}
      <Button
        variant="brutal"
        size="icon-lg"
        aria-pressed={state.saved}
        aria-label={t.later}
        title={t.later}
        onClick={() => actions.onToggle(item.id, "saved")}
        className={`size-10 sm:size-8 ${pressedClass}`}
      >
        {state.saved ? <BookmarkCheck /> : <Bookmark />}
      </Button>
      <Button
        variant="brutal"
        size="icon-lg"
        disabled={hasTodo}
        aria-label={todoLabel}
        title={todoLabel}
        onClick={() => actions.onAddTodo(item)}
        className="size-10 sm:size-8"
      >
        {hasTodo ? <ListChecks /> : <ListPlus />}
      </Button>
      <Button
        variant="brutal"
        aria-pressed={state.read}
        onClick={() => actions.onToggle(item.id, "read")}
        className={`ml-auto min-h-10 sm:min-h-8 ${pressedClass}`}
      >
        <Check /> {t.read}
      </Button>
    </div>
  );
}
