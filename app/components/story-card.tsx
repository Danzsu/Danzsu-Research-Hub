"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BookOpen, Check, Clock3, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailyBrief, DigestItem, Language, LibraryCopy } from "@/data/digest-types";
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
    original: "Eredeti",
    newTab: "új lapon",
    readHere: "Olvasd itt",
    saveHere: "Mentsd ide",
    saving: "Mentés…",
    preparing: "Készül…",
    unavailable: "Itt nem érhető el",
    savedReady: "Már megvan: olvasd itt.",
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
    original: "Original",
    newTab: "in a new tab",
    readHere: "Read here",
    saveHere: "Save here",
    saving: "Saving…",
    preparing: "Preparing…",
    unavailable: "Not available here",
    savedReady: "Already there: read it here.",
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
  /** Save here: submits the item's URL to the Library, and answers its copy, or null when it didn't go in. */
  onSaveHere: (item: DigestItem) => Promise<LibraryCopy | null>;
};

export type CardProps = {
  item: DigestItem;
  state: ItemState;
  hasTodo: boolean;
  language: Language;
  actions: CardActions;
  /** The item's Library copy (readHerePosts): Read here opens the post, or says it is being made. */
  library?: LibraryCopy;
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
      // scroll-mt: the daily index jumps here, clear of the sticky band (up to three rows below a 72rem column; 64px from it).
      className={`focus-ring story-card max-w-[900px] scroll-mt-44 border-2 @[72rem]:scroll-mt-20 border-ink bg-paper p-5 sm:p-6 ${dislikedClass} ${state.read ? "story-read" : ""}`}
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
      <div className="mb-4 flex items-start justify-between sm:mb-6">
        <span className="font-display text-4xl text-signal sm:text-5xl">{String(rank).padStart(2, "0")}</span>
        <span className="border border-ink px-2 py-1 font-mono text-[11px]">{item.score}/100</span>
      </div>
      <CardText {...props} titleClassName="text-2xl leading-[1.02]" />
      <CardFooter {...props} />
    </article>
  );
}

function CardText({ item, language, rank, brief, titleClassName }: CardProps & { titleClassName: string }) {
  const t = copy[language];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {rank === undefined && item.dailyRank !== undefined && (
          <p className="border border-ink px-1.5 font-mono text-[11px] text-ink">
            {t.dayTop} · {item.dailyRank}.
          </p>
        )}
        {/* The source's name; the card's Original button opens it. */}
        <span className="flex min-h-10 items-center font-mono text-[11px] tracking-[0.12em] text-signal [overflow-wrap:anywhere]">{item.source}</span>
      </div>
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

/** [Eredeti] [Olvasd itt] [👎 👍 ❤ 🔖 ☑] … [✓ Olvasott]: the two ways to read first, one tool unit, the Read toggle
 *  last (2a spec D1; the 2026-11-01 review brought the original out of the meta row). */
function CardFooter({ item, state, hasTodo, language, actions, library, rating }: CardProps) {
  const t = copy[language];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {/* The `o` shortcut's target (data-card-open). Opening is reading. */}
      <Button asChild variant="brutal" className="min-h-10">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          data-card-open
          onClick={() => actions.onOpen(item)}
          onAuxClick={(event) => {
            if (event.button === 1) actions.onOpen(item); // a middle click opens a tab too
          }}
        >
          <ExternalLink /> {t.original}
          <span className="sr-only">({t.newTab})</span>
        </a>
      </Button>
      <ReadHere item={item} language={language} actions={actions} library={library} />
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

/** Read here, by the item's Library copy: the post; a note while one is made, or once none will be; else Save here,
 *  which submits the URL and shows what came of it on the card. Nothing for a URL a submission would refuse. */
function ReadHere({ item, language, actions, library }: Pick<CardProps, "item" | "language" | "actions" | "library">) {
  const t = copy[language];
  const [saved, setSaved] = useState<LibraryCopy | "saving" | undefined>(undefined);
  // One region for the card's whole life: a region that mounts with its text is often not announced.
  const [announced, setAnnounced] = useState("");
  const shown = library ?? saved;
  const live = (
    <span aria-live="polite" className="sr-only">
      {announced}
    </span>
  );
  const note = (text: string) => (
    <span className="inline-flex min-h-10 items-center gap-2 border-2 border-dashed border-ink/40 px-3 font-mono text-xs text-ink/60">
      <BookOpen className="size-4" aria-hidden="true" /> {text}
    </span>
  );
  let control: ReactNode;
  if (typeof shown === "number") {
    control = (
      <Button asChild variant="brutal" className="min-h-10">
        {/* prefetch off: 25 cards would each fetch a post page on every visit; the post skeleton covers the wait. */}
        <Link href={`/library/${shown}`} prefetch={false} onClick={() => actions.onOpen(item)}>
          <BookOpen /> {t.readHere} <PendingDot />
        </Link>
      </Button>
    );
  } else if (shown === "pending") {
    control = note(t.preparing);
  } else if (shown === "unavailable") {
    control = note(t.unavailable);
  } else if (parseSubmittedUrl(item.url)) {
    control = (
      <Button
        variant="brutal"
        className="min-h-10"
        aria-disabled={shown === "saving"}
        onClick={async (event) => {
          if (shown === "saving") return;
          // The button goes when the answer lands: the focus then moves to the card, so j/k go on from here.
          const card = event.currentTarget.closest<HTMLElement>(CARD);
          setSaved("saving");
          const result = await actions.onSaveHere(item);
          setSaved(result ?? undefined);
          if (result === null) return;
          setAnnounced(typeof result === "number" ? t.savedReady : result === "pending" ? t.preparing : t.unavailable);
          requestAnimationFrame(() => card?.focus());
        }}
      >
        <BookOpen /> {shown === "saving" ? t.saving : t.saveHere}
      </Button>
    );
  }
  return (
    <>
      {control}
      {live}
    </>
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
