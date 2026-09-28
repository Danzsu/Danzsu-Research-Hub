"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReaderStore, createSeededStore, memorySend, postState, revalidateSeed, type ReaderData, type ReaderSeed } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

/** The offline preview (app/dev/preview): seeded state and no network; `failWrites` acts like being offline. */
export type ReaderPreview = { data: ReaderData; failWrites: boolean };

/** How a Radar page's reader state starts: a real page always has a seed; the offline preview always
 *  has its own data instead, and never a seed — never both, never neither. */
export type ReaderSource = { seed: ReaderSeed; preview?: never } | { preview: ReaderPreview; seed?: never };

const showFailed = () => toasts.show({ kind: "failed" });

/**
 * The reader's flags and to-dos. `source.seed` is the server render's copy, so the first paint already
 * has the final order. A GET /api/state follows only when the seed needs it (seedNeedsLoad: it failed, or
 * Back restored it from the router cache). Every failed write rolls back and raises the error toast.
 */
export function useReaderState(source: ReaderSource) {
  const [store] = useState(() =>
    source.preview ? createReaderStore(memorySend(source.preview.failWrites), showFailed, source.preview.data) : createSeededStore(postState, showFailed, source.seed),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    if (source.preview) return;
    return revalidateSeed(store, source.seed);
  }, [store, source.preview, source.seed]);

  return { store, ...snapshot };
}
