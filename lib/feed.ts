import type { DigestCategory, DigestItem } from "../data/digest-types.ts";
import type { ItemState } from "./reader-store.ts";

export type Filter = "all" | DigestCategory | "saved";

/** Unread before read, within the must-read group and within the rest; otherwise the server's must-read/score order. */
export function sortUnreadFirst<T extends { id: string; mustRead?: boolean }>(items: T[], states: Record<string, ItemState>): T[] {
  const rank = (item: T) => (item.mustRead ? 0 : 2) + (states[item.id]?.read ? 1 : 0);
  return [...items].sort((a, b) => rank(a) - rank(b)); // Array.prototype.sort is stable
}

/**
 * The cards under the Top 3. "all" leaves the must-read items out (they are the Top 3 above it); a
 * category or "saved" view has no Top 3, so its must-read items stay in. Sorted by `loadedStates`,
 * not the live states, so marking a card read doesn't move it until the next visit.
 */
export function feedItems(
  items: DigestItem[],
  filter: Filter,
  states: Record<string, ItemState>,
  loadedStates: Record<string, ItemState>,
): DigestItem[] {
  const visible = items.filter((item) =>
    filter === "all"
      ? !item.mustRead
      : filter === "saved"
        ? states[item.id]?.saved || loadedStates[item.id]?.saved // stays until the next load: its own undo (m14) needs the card to not vanish
        : item.category === filter,
  );
  return sortUnreadFirst(visible, loadedStates);
}

// A daily run lands at 07:00 Budapest time, so the day is Budapest's, not UTC's.
const budapestDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }); // 2026-09-29
const budapestLabel = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit" });

/** The Budapest day an item was added on, as the Radar writes its dates: `09. 29.` */
export const addedDayLabel = (addedAt: string) => budapestLabel.format(new Date(addedAt));

/** The AI companies page's Top 5: the latest day's items (by the Budapest day they were added on), highest score first. */
export function dailyTop(items: DigestItem[], count = 5): DigestItem[] {
  const day = (item: DigestItem) => budapestDay.format(new Date(item.addedAt));
  const latest = items.map(day).sort().at(-1);
  return items.filter((item) => day(item) === latest).sort((a, b) => b.score - a.score).slice(0, count);
}
