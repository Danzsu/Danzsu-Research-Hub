"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

// The five refreshes a reader starts (spec 2.3: Save, Translate, the language toggle, a Library
// submission, the link chat's send) share one transition, so the bar shows while any of them waits and
// React does the counting. The Library's background refresh (refresh-while-processing.tsx) calls
// router.refresh() itself, outside it, so it never lights the bar. A write that leads to the refresh (Save,
// Translate, a Library submission) lights the bar too, as `work`, from the click (R2 spec 1). It runs before
// the transition, never inside it: in React 19 every transition started while an async one is pending joins
// it, so a Translate inside the transition would hold back every nav click until the model answered.

/** `work`, when given, runs first and answers whether to go on; it reports its own failure. */
type Refresh = (pushTo?: string, work?: () => Promise<boolean>) => void;

/** One refresh: `work` (counted on the bar by `track`) outside any transition, then, unless it said no or
 *  threw, `navigate` inside one. A throw is logged here; the caller's own failure state reports it. */
export async function runRefresh(
  work: (() => Promise<boolean>) | undefined,
  track: (delta: 1 | -1) => void,
  navigate: () => void,
  startTransition: (navigate: () => void) => void,
): Promise<void> {
  if (work) {
    track(1);
    let goOn = false;
    try {
      goOn = await work();
    } catch (error) {
      console.error("refresh work failed", error);
    } finally {
      track(-1);
    }
    if (!goOn) return;
  }
  startTransition(navigate);
}

const RefreshContext = createContext<Refresh | null>(null);

/** Mounted once by the app shell, inside its LanguageProvider. */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Writes on their way, which light the bar outside the transition.
  const [working, setWorking] = useState(0);
  const refresh: Refresh = (pushTo, work) =>
    void runRefresh(
      work,
      (delta) => setWorking((count) => count + delta),
      () => {
        if (pushTo) router.push(pushTo);
        router.refresh();
      },
      startTransition,
    );
  return (
    <RefreshContext value={refresh}>
      <RefreshBar pending={pending || working > 0} />
      {children}
    </RefreshContext>
  );
}

/** `refresh(pushTo?, work?)`: runs `work` first when given and stops when it answers false; then navigates
 *  to `pushTo` when given, and refreshes, all inside the shell's transition. */
export function useRefresh(): Refresh {
  const refresh = useContext(RefreshContext);
  if (!refresh) throw new Error("useRefresh must be used inside RefreshProvider (app/components/app-shell.tsx)");
  return refresh;
}

/** 2px of signal across the top of the viewport, above the sheets (z-50) and the toast (z-[60]), from
 *  100ms into a refresh (`.refresh-bar`, globals.css) until the refreshed page is in. */
export function RefreshBar({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div aria-hidden="true" className="refresh-bar pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden">
      <span className="block h-full w-1/3 bg-signal" />
    </div>
  );
}
