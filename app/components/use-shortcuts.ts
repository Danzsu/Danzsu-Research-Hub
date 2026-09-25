"use client";

import { useEffect, useEffectEvent } from "react";
import { isEditableTarget, shortcutFor, type ShortcutAction } from "@/lib/keymap";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/** Runs the handler for a shortcut pressed anywhere on the page; a key without a handler here is left alone. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    const action = shortcutFor(event, {
      editable: isEditableTarget(element),
      inDialog: Boolean(element?.closest('[role="dialog"], [role="alertdialog"]')),
    });
    const handler = action ? handlers[action] : undefined;
    if (!handler) return;
    event.preventDefault();
    handler();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
