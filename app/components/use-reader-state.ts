"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReaderStore, memorySend, postState, revalidateSeed, seedNeedsLoad, type ReaderData, type ReaderSeed } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

/** The offline preview (app/dev/preview): seeded state and no network; `failWrites` acts like being offline. */
export type ReaderPreview = { data: ReaderData; failWrites: boolean };

const showFailed = () => toasts.show({ kind: "failed" });

/**
 * The reader's flags and to-dos. `seed` is the server render's copy, so the first paint already has the
 * final order. A GET /api/state follows only when the seed needs it (seedNeedsLoad: it failed, or Back
 * restored it from the router cache). Every failed write rolls back and raises the error toast.
 */
export function useReaderState(seed: ReaderSeed | undefined, preview?: ReaderPreview) {
  const [store] = useState(() =>
    preview
      ? createReaderStore(memorySend(preview.failWrites), showFailed, preview.data)
      : createReaderStore(postState, showFailed, seed?.data ?? undefined, seed ? seedNeedsLoad(seed) : false),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const offline = preview !== undefined;

  useEffect(() => {
    if (offline || !seed) return;
    return revalidateSeed(store, seed);
  }, [store, offline, seed]);

  return { store, ...snapshot };
}
