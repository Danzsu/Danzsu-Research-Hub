"use client";

import { Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { createContext, useContext, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { Button } from "@/components/ui/button";
import { createRatingStore, ratingKey, type RatingStore, type RatingTarget, type RatingValue, type RatingWrite } from "@/lib/ratings";
import { useLanguage } from "./language-context";
import { toasts } from "./undo-toast";

const copy = {
  hu: { group: "Értékelés", down: "Nem hasznos", up: "Hasznos", heart: "Kedvenc" },
  en: { group: "Rating", down: "Not useful", up: "Useful", heart: "Favourite" },
};

/** A toggle's pressed state, in ink (DESIGN.md → Components → Button): the card toggles use it too. */
export const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";
/** A card or row that holds a 👎 rating dims and turns its frame dashed, unlike a read one (B spec 2.4). */
export const dislikedClass = "has-[[data-rating=down]]:opacity-60 has-[[data-rating=down]]:border-dashed";

const BUTTONS = [
  { value: -1, name: "down", Icon: ThumbsDown },
  { value: 1, name: "up", Icon: ThumbsUp },
  { value: 2, name: "heart", Icon: Heart },
] as const;
const buttonOf = (value: RatingValue) => BUTTONS.find((button) => button.value === value) ?? BUTTONS[2];

const RatingsContext = createContext<RatingStore | null>(null);

/** Mounted once by the app shell; the preview passes its in-memory sender, so nothing it rates is stored. */
export function RatingsProvider({ send, children }: PropsWithChildren<{ send: (write: RatingWrite) => Promise<unknown> }>) {
  const [store] = useState(() => createRatingStore(send, () => toasts.show({ kind: "failed" })));
  return <RatingsContext value={store}>{children}</RatingsContext>;
}

const noneRated: ReadonlyMap<string, RatingValue | null> = new Map();

/** The value the reader sees: what this tab set, else the page's render (G1 spec 3). */
function useRating(target: RatingTarget, initial: RatingValue | null) {
  const store = useContext(RatingsContext);
  if (!store) throw new Error("RatingControl must be used inside RatingsProvider (app/components/app-shell.tsx)");
  const rated = useSyncExternalStore(store.subscribe, store.getSnapshot, () => noneRated);
  const key = ratingKey(target);
  return { store, value: rated.has(key) ? (rated.get(key) ?? null) : initial };
}

/** 👎 👍 ❤ for one item, post or repo. Its data-rating lets the card around it dim for a 👎 (dislikedClass). */
export function RatingControl({ target, initial, className = "" }: { target: RatingTarget; initial: RatingValue | null; className?: string }) {
  const { language } = useLanguage();
  const { store, value } = useRating(target, initial);
  const t = copy[language];
  return (
    <div role="group" aria-label={t.group} data-rating={value === null ? undefined : buttonOf(value).name} className={`flex ${className}`}>
      {BUTTONS.map(({ value: pressed, name, Icon }, index) => (
        <Button
          key={name}
          variant="brutal"
          size="icon-lg"
          aria-pressed={value === pressed}
          aria-label={t[name]}
          title={t[name]}
          onClick={() => void store.press(target, initial, pressed)}
          className={`size-10 sm:pointer-fine:size-8 ${index ? "-ml-0.5" : ""} ${pressedClass}`}
        >
          <Icon className={name === "heart" && value === 2 ? "fill-current" : undefined} />
        </Button>
      ))}
    </div>
  );
}

/** A Library card's rating as a mark: the card is one link, so it can't hold buttons (G1 spec 3, deviation 1). */
export function RatingBadge({ target, initial }: { target: RatingTarget; initial: RatingValue | null }) {
  const { language } = useLanguage();
  const { value } = useRating(target, initial);
  if (value === null) return null;
  const { name, Icon } = buttonOf(value);
  return (
    <span data-rating={name} className="inline-flex items-center">
      <Icon aria-hidden="true" className={`size-4 ${name === "heart" ? "fill-current" : ""}`} />
      <span className="sr-only">{copy[language][name]}</span>
    </span>
  );
}
