"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 5000;
// ponytail: a source stuck in `pending` until the daily cron retries it would poll forever; 120 × 5 s
// (10 min) is twice the ingest's maxDuration (300 s). A status endpoint could stop on "no change" instead.
const MAX_POLLS = 120;

/** Re-renders the Library every 5 s while a submitted link is still processing, and stops when none is. */
export function RefreshWhileProcessing({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let polls = 0;
    const timer = setInterval(() => {
      if (++polls > MAX_POLLS) clearInterval(timer);
      else if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
