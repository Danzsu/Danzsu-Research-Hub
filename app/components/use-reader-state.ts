"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReaderStore, loadState, memorySend, postState, type ReaderData } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

/** The offline preview (app/dev/preview): seeded state and no network; `failWrites` acts like being offline. */
export type ReaderPreview = { data: ReaderData; failWrites: boolean };

/** The reader's flags and to-dos, loaded once per mount. Every failed write rolls back and raises the error toast. */
export function useReaderState(preview?: ReaderPreview) {
  const [store] = useState(() =>
    createReaderStore(preview ? memorySend(preview.failWrites) : postState, () => toasts.show({ kind: "failed" }), preview?.data),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const seeded = preview !== undefined;

  useEffect(() => {
    if (seeded) return;
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
  }, [store, seeded]);

  return { store, ...snapshot };
}
