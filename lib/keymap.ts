import type { Localized } from "../data/digest-types.ts";

// Desktop keyboard shortcuts as data plus pure functions; app/components/use-shortcuts.ts binds them to the window.

export type ShortcutAction = "next" | "previous" | "open" | "read" | "later" | "undo" | "search" | "help" | "toggleNav";

/** What the help dialog lists. Single-character keys are also what shortcutFor matches; longer ones are display only. */
export const SHORTCUTS: readonly { keys: readonly string[]; action: ShortcutAction; label: Localized }[] = [
  { keys: ["j"], action: "next", label: { hu: "Következő kártya", en: "Next card" } },
  { keys: ["k"], action: "previous", label: { hu: "Előző kártya", en: "Previous card" } },
  { keys: ["o"], action: "open", label: { hu: "Megnyitás (olvasottnak is jelöli)", en: "Open (also marks it read)" } },
  { keys: ["r"], action: "read", label: { hu: "Olvasott ki/be", en: "Toggle read" } },
  { keys: ["l"], action: "later", label: { hu: "Későbbre ki/be", en: "Toggle later" } },
  { keys: ["z"], action: "undo", label: { hu: "Visszavonás", en: "Undo" } },
  { keys: ["⌘K", "Ctrl K", "/"], action: "search", label: { hu: "Keresés (hamarosan)", en: "Search (coming soon)" } },
  { keys: ["["], action: "toggleNav", label: { hu: "Oldalsáv össze/kinyitása", en: "Collapse/expand the sidebar" } },
  { keys: ["?"], action: "help", label: { hu: "Ez a lista", en: "This list" } },
];

const BY_KEY = new Map(
  SHORTCUTS.flatMap(({ keys, action }) => keys.filter((key) => key.length === 1).map((key) => [key, action] as const)),
);

export type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean };
export type KeyTarget = { editable: boolean; inDialog: boolean };

/** True for anything that takes typing: input, textarea, select, or a contenteditable element (and its children). */
export function isEditableTarget(element: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!element) return false;
  return element.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName ?? "");
}

/**
 * The action a key press asks for, or null. Nothing fires while typing, inside an open dialog, or
 * mid-composition. Letters take no modifier, so Ctrl+R (reload) and the like stay the browser's.
 * `/` and `?` ignore Shift, which the Hungarian layout needs to type them. Ctrl/⌘+K is search; AltGr (Ctrl+Alt) is not.
 * A symbol also counts with Alt or AltGr, never with ⌘: on the Hungarian layout `[` is AltGr+F
 * (Ctrl+Alt on Windows, Option on macOS).
 */
export function shortcutFor(press: KeyPress, target: KeyTarget): ShortcutAction | null {
  if (press.isComposing || target.editable || target.inDialog) return null;
  const letter = /^[a-z]$/i.test(press.key);
  if (!letter && !press.metaKey && (press.altKey || !press.ctrlKey)) return BY_KEY.get(press.key) ?? null;
  if (press.ctrlKey || press.metaKey) return !press.altKey && press.key.toLowerCase() === "k" ? "search" : null;
  if (press.altKey) return null;
  return BY_KEY.get(press.key) ?? null;
}

/** The card j/k moves to: the first one while none has focus, clamped at both ends; null when there are none. */
export function nextCardIndex(current: number, count: number, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (current < 0) return 0;
  return Math.min(count - 1, Math.max(0, current + step));
}
