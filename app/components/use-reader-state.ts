"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReaderStore, loadState, memorySend, postState, type ReaderData } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

/** The offline preview (app/dev/preview): seeded state and no network; `failWrites` acts like being offline. */
export type ReaderPreview = { data: ReaderData; failWrites: boolean };

const showFailed = () => toasts.show({ kind: "failed" });

/**
 * The reader's flags and to-dos. `seed` is the server render's copy (null when its query failed), so the first
 * paint already has the final order; a GET /api/state on mount still refreshes it, because Back restores a
 * stale copy from the router cache. Every failed write rolls back and raises the error toast.
 */
export function useReaderState(seed: ReaderData | null | undefined, preview?: ReaderPreview) {
  const [store] = useState(() =>
    preview
      ? createReaderStore(memorySend(preview.failWrites), showFailed, preview.data)
      : createReaderStore(postState, showFailed, seed ?? undefined, true),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const offline = preview !== undefined;

  useEffect(() => {
    if (offline) return;
    let live = true;
    loadState().then(
      (data) => {
        if (live) store.hydrate(data);
      },
      () => {
        if (live) store.hydrateFailed();
      },
    );
    return () => {
      live = false;
    };
  }, [store, offline]);

  return { store, ...snapshot };
}
