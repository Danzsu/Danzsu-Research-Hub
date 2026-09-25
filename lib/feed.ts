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
    filter === "all" ? !item.mustRead : filter === "saved" ? states[item.id]?.saved : item.category === filter,
  );
  return sortUnreadFirst(visible, loadedStates);
}
