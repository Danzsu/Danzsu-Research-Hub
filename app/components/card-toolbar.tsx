"use client";

import { Bookmark, BookmarkCheck, ListChecks, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import type { RatingValue } from "@/lib/ratings";
import { pressedClass } from "./rating-classes";
import { RatingControl } from "./rating-control";

const copy = {
  hu: { later: "Később", addTodo: "Teendőhöz adás", hasTodo: "Már a teendők között" },
  en: { later: "Later", addTodo: "Add to to-dos", hasTodo: "Already a to-do" },
};

/** A card's tool row (2a spec D1): the three ratings, then Later and To-do in the same size, one flex unit
 *  so it wraps as a whole and the To-do icon never stands alone on a line. */
export function CardToolbar({ itemId, saved, hasTodo, rating, language, onToggleSaved, onAddTodo }: {
  itemId: string;
  saved: boolean;
  hasTodo: boolean;
  rating: RatingValue | null;
  language: Language;
  onToggleSaved: () => void;
  onAddTodo: () => void;
}) {
  const t = copy[language];
  const todoLabel = hasTodo ? t.hasTodo : t.addTodo;
  return (
    <div data-card-toolbar className="flex items-center gap-1">
      <RatingControl target={{ kind: "item", id: itemId }} initial={rating} />
      <Button
        variant="brutal"
        size="icon-lg"
        aria-pressed={saved}
        aria-label={t.later}
        title={t.later}
        onClick={onToggleSaved}
        className={`size-10 sm:pointer-fine:size-8 ${pressedClass}`}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
      </Button>
      <Button variant="brutal" size="icon-lg" disabled={hasTodo} aria-label={todoLabel} title={todoLabel} onClick={onAddTodo} className="size-10 sm:pointer-fine:size-8">
        {hasTodo ? <ListChecks /> : <ListPlus />}
      </Button>
    </div>
  );
}
