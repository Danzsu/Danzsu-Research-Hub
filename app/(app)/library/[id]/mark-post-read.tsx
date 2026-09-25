"use client";

import { useEffect } from "react";
import { postState, postStateKey } from "@/lib/reader-store";

/** Opening a post marks it read (item_states `post:<id>`); the Library list dims it from then on. */
export function MarkPostRead({ postId }: { postId: number }) {
  useEffect(() => {
    // Not a click the reader made, so no error toast: a missed mark only leaves the card undimmed.
    postState({ action: "set_read", itemId: postStateKey(postId), value: true }).catch(() => undefined);
  }, [postId]);
  return null;
}
