"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSourceStore, revalidateSeed, type ReaderSource } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

const showFailed = () => toasts.show({ kind: "failed" });

/**
 * The reader's flags and to-dos. `source.seed` is the server render's copy, so the first paint already
 * has the final order. A GET /api/state follows only when the seed needs it (seedNeedsLoad: it failed, or
 * Back restored it from the router cache). Every failed write rolls back and raises the error toast.
 */
export function useReaderState(source: ReaderSource) {
  const [store] = useState(() => createSourceStore(source, showFailed));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    if (source.preview) return;
    return revalidateSeed(store, source.seed);
  }, [store, source.preview, source.seed]);

  return { store, ...snapshot };
}
