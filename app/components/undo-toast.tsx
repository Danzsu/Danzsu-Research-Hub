"use client";

import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { createToastQueue } from "@/lib/undo-queue";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    markedRead: "Olvasottnak jelölve",
    todoAdded: "Hozzáadva a teendőkhöz",
    todoDeleted: "Teendő törölve",
    failed: "Nem sikerült menteni, a változást visszaállítottuk.",
    undo: "Visszavonás",
  },
  en: {
    markedRead: "Marked read",
    todoAdded: "Added to your to-dos",
    todoDeleted: "To-do deleted",
    failed: "Couldn't save; the change was undone.",
    undo: "Undo",
  },
};

export type ToastKind = "markedRead" | "todoAdded" | "todoDeleted" | "failed";

/** The app's one toast queue: `toasts.show({ kind, undo?, commit? })` from any event handler. */
export const toasts = createToastQueue<ToastKind>();

const VISIBLE_MS = 5000;
const noToast = () => null;

/** True for a click on the toast: a panel open underneath must not treat it as a click outside. */
export const isUndoToast = (target: EventTarget | null) => target instanceof Element && target.closest("[data-undo-toast]") !== null;

/** Mounted once by the app shell, above any open panel. Below md it sits above the bottom bar and the
 *  taiyaki raised out of it; from md up its lane stops short of the taiyaki's corner (`md:right-24`).
 *  The toast slides in from 8px and fades out in 160ms (2a spec D7: `AnimatePresence` keeps the leaving one
 *  for its exit, and needs no animationend bookkeeping). Under reduced motion it appears and leaves at once: the
 *  shell's MotionConfig stops only transforms, so the fade's duration goes to 0 here. */
export function UndoToast() {
  const { language } = useLanguage();
  const toast = useSyncExternalStore(toasts.subscribe, toasts.getSnapshot, noToast);
  const reduceMotion = useReducedMotionConfig();
  // Paused while the pointer or focus is on it, so the Undo button can be reached in time.
  const [paused, setPaused] = useState(false);
  const [prevToastId, setPrevToastId] = useState(toast?.id);
  if (toast?.id !== prevToastId) {
    // Browsers don't reliably fire pointerleave/blur on a removed node, so a toast that goes away clears the pause.
    setPrevToastId(toast?.id);
    setPaused(false);
  }
  const toastId = toast?.id;

  useEffect(() => {
    if (toastId === undefined || paused) return;
    const timer = setTimeout(() => toasts.dismiss(toastId), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toastId, paused]);

  useEffect(() => {
    // A delete that waits for its toast to run out must still happen if the tab closes first.
    window.addEventListener("pagehide", toasts.flush);
    return () => window.removeEventListener("pagehide", toasts.flush);
  }, []);

  const t = copy[language];
  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-presence
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem_+_env(safe-area-inset-bottom))] z-[60] flex justify-center md:right-24 md:bottom-6"
    >
      {/* popLayout: a toast that replaces another pops the leaving one out of the lane's flow, so the two never share the width. */}
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            data-undo-toast
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            // The leaving toast is out of reach: its action is already final.
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(event) => {
              // Only unpause if focus moved outside the toast's container
              if (
                !(event.currentTarget instanceof Element) ||
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              ) {
                setPaused(false);
              }
            }}
            className={`pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 border-2 border-ink px-4 py-1 font-mono text-xs ${
              toast.kind === "failed" ? "bg-signal text-ink shadow-[5px_5px_0_var(--ink)]" : "bg-ink text-paper shadow-[5px_5px_0_var(--signal)]"
            }`}
          >
            <span className="min-w-0 flex-1">{t[toast.kind]}</span>
            {toast.undo && (
              <Button
                variant="signal"
                className="min-h-10"
                onClick={() => {
                  setPaused(false);
                  toasts.undo(toast.id);
                }}
              >
                {t.undo}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
