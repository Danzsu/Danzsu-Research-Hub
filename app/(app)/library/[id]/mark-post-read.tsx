"use client";

import { useEffect } from "react";
import { postState, postStateKey } from "@/lib/reader-store";
import { markPostOpened } from "../opened-posts";

/** Opening a post marks it read (item_states `post:<id>`); the Library list dims it from then on. `preview` sends nothing. */
export function MarkPostRead({ postId, preview = false }: { postId: number; preview?: boolean }) {
  useEffect(() => {
    markPostOpened(postId);
    if (preview) return;
    // Not a click the reader made, so no error toast: a missed mark only leaves the card undimmed after a reload.
    postState({ action: "set_read", itemId: postStateKey(postId), value: true }).catch(() => undefined);
  }, [postId, preview]);
  return null;
}
