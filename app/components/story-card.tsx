import Link from "next/link";
import { BookOpen, Check, Clock3, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailyBrief, DigestItem, Language } from "@/data/digest-types";
import { nextCardIndex } from "@/lib/keymap";
import { SHORT_MINUTES } from "@/lib/pipeline/daily-top";
import { parseSubmittedUrl } from "@/lib/pipeline/util";
import type { RatingValue } from "@/lib/ratings";
import type { Flag, ItemState } from "@/lib/reader-store";
import { PendingDot } from "./nav-parts";
import { CardToolbar } from "./card-toolbar";
import { dislikedClass, pressedClass } from "./rating-classes";
import { Tag } from "./tag";

const copy = {
  hu: {
    score: "PONT",
    min: "PERC",
    why: "MIÉRT FONTOS",
    open: "Forrás, új lapon",
    readHere: "Olvasd itt",
    read: "Olvasott",
    short: "RÖVID",
    dayTop: "NAP TOP",
    keyPoints: "FŐ PONTOK",
    briefPending: "A részletes összefoglaló készül…",
  },
  en: {
    score: "SCORE",
    min: "MIN",
    why: "WHY IT MATTERS",
    open: "Source, in a new tab",
    readHere: "Read here",
    read: "Read",
    short: "SHORT",
    dayTop: "DAY TOP",
    keyPoints: "KEY POINTS",
    briefPending: "The full brief is being written…",
  },
};

export type CardActions = {
  /** The Open link was followed: marks the item read. */
  onOpen: (item: DigestItem) => void;
  onToggle: (itemId: string, flag: Flag) => void;
  onAddTodo: (item: DigestItem) => void;
  /** "Olvasd itt" with no Library post yet: the link chat sends the item's URL (read-here spec 1).
   *  `opener` gets the focus back when the chat closes. */
  onReadHere: (item: DigestItem, opener: HTMLButtonElement) => void;
};

export type CardProps = {
  item: DigestItem;
  state: ItemState;
  hasTodo: boolean;
  language: Language;
  actions: CardActions;
  /** The Library post already made from the item's URL (readHerePosts): "Olvasd itt" opens it. */
  postId?: number;
  /** The reader's rating of the item, from the page's render (getRatings). */
  rating: RatingValue | null;
  /** The daily view's long text for the card (daily news spec N8); the weekly cards have none. */
  brief?: DailyBrief;
  /** The card's place in the daily Top 10: its number, its #daily-N anchor and the SHORT mark. */
  rank?: number;
};


/** Makes a card a j/k stop: focusable from script (not by Tab) and findable by id. */
const cardFocus = (itemId: string) => ({ tabIndex: -1, "data-card-id": itemId });

/** A feed card: meta (a 96px gutter from lg up), the text, then every action in one row at the bottom. */
export function StoryCard(props: CardProps) {
  const { item, state, language } = props;
  const t = copy[language];
  return (
    <article
      {...cardFocus(item.id)}
      id={props.rank ? `daily-${props.rank}` : undefined}
      data-saved={state.saved || undefined}
      // scroll-mt-20: the daily index jumps here, clear of the 64px sticky header.
      className={`focus-ring story-card max-w-[900px] scroll-mt-20 border-2 border-ink bg-paper p-5 sm:p-6 ${dislikedClass} ${state.read ? "story-read" : ""}`}
    >
      <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-5">
        {/* A row of meta on narrow screens, the 96px gutter from lg up. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] leading-5 text-ink/55 lg:block">
          {props.rank !== undefined && <p className="font-display text-4xl leading-none text-signal lg:mb-3">{String(props.rank).padStart(2, "0")}</p>}
          <p className="text-signal">{item.publishedLabel}</p>
          <p className="lg:mt-2">
            {t.score} <span className="font-display text-xl text-ink lg:block lg:text-3xl">{item.score}</span>
          </p>
          <p className="flex items-center gap-1 lg:mt-2">
            <Clock3 className="size-3" /> {item.readMinutes} {t.min}
          </p>
          {props.rank !== undefined && item.readMinutes <= SHORT_MINUTES && <p className="bg-signal px-1.5 font-bold text-ink lg:mt-2 lg:inline-block">{t.short}</p>}
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
    <article
      {...cardFocus(item.id)}
      data-saved={state.saved || undefined}
      className={`focus-ring must-card border-2 border-ink bg-paper p-5 ${dislikedClass} ${state.read ? "story-read" : ""}`}
    >
      <div className="mb-6 flex items-start justify-between">
        <span className="font-display text-5xl text-signal">{String(rank).padStart(2, "0")}</span>
        <span className="border border-ink px-2 py-1 font-mono text-[11px]">{item.score}/100</span>
      </div>
      <CardText {...props} titleClassName="text-2xl leading-[1.02]" />
      <CardFooter {...props} />
    </article>
  );
}

function CardText({ item, language, actions, rank, brief, titleClassName }: CardProps & { titleClassName: string }) {
  const t = copy[language];
  return (
    <>
      {rank === undefined && item.dailyRank !== undefined && (
        <p className="mb-1 inline-block border border-ink px-1.5 font-mono text-[11px] text-ink">
          {t.dayTop} · {item.dailyRank}.
        </p>
      )}
      {/* The source is the meta row's link (2a spec D1), and the `o` shortcut's target (data-card-open). */}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        data-card-open
        onClick={() => actions.onOpen(item)}
        onAuxClick={(event) => {
          if (event.button === 1) actions.onOpen(item); // a middle click opens a tab too
        }}
        className="focus-ring inline-flex min-h-10 items-center gap-1 font-mono text-[11px] tracking-[0.12em] text-signal [overflow-wrap:anywhere] hover:underline"
      >
        {item.source} <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">({t.open})</span>
      </a>
      <h2 className={`mt-3 font-display [overflow-wrap:anywhere] ${titleClassName}`}>{item.title[language]}</h2>
      <CardBody item={item} brief={brief} language={language} />
      <div className="mt-5 border-l-4 border-signal pl-4">
        <p className="font-mono text-[11px] tracking-[0.15em] text-signal">{t.why}</p>
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

/** The card's text under the title: the daily brief's paragraphs, the post's summary and key points, or the
 *  item's own summary, with a note while the brief is being written (daily news spec N8). */
function CardBody({ item, brief, language }: { item: DigestItem; brief?: DailyBrief; language: Language }) {
  const t = copy[language];
  const text = "mt-4 max-w-[75ch] text-base leading-7 text-ink/72";
  if (brief?.kind === "brief") {
    return (
      <div className="mt-4 max-w-[75ch] space-y-3 text-base leading-7 text-ink/80">
        {brief.paragraphs[language].map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    );
  }
  if (brief?.kind === "post") {
    return (
      <>
        <p className={text}>{brief.summary[language]}</p>
        {brief.keyPoints[language].length > 0 && (
          <div className="mt-4 max-w-[75ch]">
            <p className="font-mono text-[11px] tracking-[0.15em] text-ink/55">{t.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              {brief.keyPoints[language].map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <p className={text}>{item.summary[language]}</p>
      {brief?.kind === "pending" && <p className="mt-2 font-mono text-xs text-ink/55">{t.briefPending}</p>}
    </>
  );
}

/** [Olvasd itt] [👎 👍 ❤ 🔖 ☑] … [✓ Elolvastam] (2a spec D1): one primary action, one tool unit, the Read toggle
 *  last; the source link sits in the meta row above. */
function CardFooter({ item, state, hasTodo, language, actions, postId, rating }: CardProps) {
  const t = copy[language];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {/* Read-here spec 1: our own post when there is one; otherwise the chat sends the link, unless a submission would refuse it. */}
      {postId !== undefined ? (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}`} onClick={() => actions.onOpen(item)}>
            <BookOpen /> {t.readHere} <PendingDot />
          </Link>
        </Button>
      ) : (
        parseSubmittedUrl(item.url) && (
          <Button
            variant="brutal"
            className="min-h-10"
            onClick={(event) => {
              actions.onOpen(item);
              actions.onReadHere(item, event.currentTarget);
            }}
          >
            <BookOpen /> {t.readHere}
          </Button>
        )
      )}
      <CardToolbar
        itemId={item.id}
        saved={state.saved}
        hasTodo={hasTodo}
        rating={rating}
        language={language}
        onToggleSaved={() => actions.onToggle(item.id, "saved")}
        onAddTodo={() => actions.onAddTodo(item)}
      />
      <Button
        variant="brutal"
        aria-pressed={state.read}
        onClick={() => actions.onToggle(item.id, "read")}
        className={`ml-auto min-h-10 sm:pointer-fine:min-h-8 ${pressedClass}`}
      >
        <Check /> {t.read}
      </Button>
    </div>
  );
}

const CARD = "[data-card-id]";

/** The id of the card that has focus, or holds the focused button. */
export function focusedCardId(): string | null {
  return document.activeElement?.closest<HTMLElement>(CARD)?.dataset.cardId ?? null;
}

/** j/k: focus the next or previous card and scroll it to the middle, instantly under prefers-reduced-motion. */
export function moveCardFocus(step: 1 | -1) {
  const cards = [...document.querySelectorAll<HTMLElement>(CARD)];
  const index = nextCardIndex(cards.findIndex((card) => card.contains(document.activeElement)), cards.length, step);
  if (index === null) return;
  const card = cards[index];
  card.focus({ preventScroll: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
}

/** o: follows the focused card's Open link, which also marks it read. */
export function openFocusedCard() {
  document.activeElement?.closest(CARD)?.querySelector<HTMLAnchorElement>("[data-card-open]")?.click();
}
