import type { KeyboardEvent } from "react";

/** Where Tab can land, as the browser sees it, less Radix's invisible focus guards at either end of <body>. */
function tabStops(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([data-radix-focus-guard])")].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible" &&
      !element.closest("[inert]"),
  );
}

/**
 * For a non-modal panel (the link chat on desktop, the Radar's reader panel): Radix's FocusScope loops Tab
 * inside it even when it isn't modal, which would keep a keyboard reader from the page behind it. Instead
 * the panel sits right after its opener in tab order: Shift+Tab off its first stop goes back to the opener,
 * and Tab off its last goes on to the first stop after the opener outside the panel or, with nothing after
 * it, to the page's first stop, as the browser would after its own UI. The key is cancelled only once the
 * focus has really moved; a target that takes no focus leaves it to Radix, which wraps it inside the panel.
 * `getOpener` is called only on Tab, since it may read layout and every key typed in the panel passes here.
 */
export function tabPastPanel(event: KeyboardEvent<HTMLDivElement>, getOpener: () => HTMLElement | null) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const panel = event.currentTarget;
  const stops = tabStops(panel);
  if (event.target !== (event.shiftKey ? stops[0] : stops.at(-1))) return;
  const opener = getOpener();
  if (!opener) return;
  const outside = tabStops(document).filter((element) => !panel.contains(element));
  const next = event.shiftKey
    ? opener
    : (outside.find((element) => opener.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) ?? outside[0] ?? opener);
  next.focus();
  if (document.activeElement === next) event.preventDefault();
}
