"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

// Posts opened in this tab (MarkPostRead adds them). Back to the Library restores its cached server
// payload, whose read ids predate the visit, so a card also dims when its post is in here.

let opened: ReadonlySet<number> = new Set();
const none: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();

export function markPostOpened(postId: number) {
  if (opened.has(postId)) return;
  opened = new Set(opened).add(postId);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A Library card, dimmed once read: `read` from the server, or opened in this tab since. */
export function PostCardLink({ postId, read, className, children }: { postId: number; read: boolean; className: string; children: ReactNode }) {
  const openedHere = useSyncExternalStore(subscribe, () => opened, () => none).has(postId);
  return (
    <Link href={`/library/${postId}`} className={`${className} ${read || openedHere ? "story-read" : ""}`}>
      {children}
    </Link>
  );
}
