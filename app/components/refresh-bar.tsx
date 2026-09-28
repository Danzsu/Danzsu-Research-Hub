"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";

// The five refreshes a reader starts (spec 2.3: Save, Translate, the language toggle, a Library
// submission, the link chat's send) share one transition, so the bar shows while any of them waits and
// React does the counting. The Library's background refresh (refresh-while-processing.tsx) calls
// router.refresh() itself, outside it, so it never lights the bar.

type Refresh = (pushTo?: string) => void;

const RefreshContext = createContext<Refresh | null>(null);

/** Mounted once by the app shell, inside its LanguageProvider. */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh: Refresh = (pushTo) =>
    startTransition(() => {
      if (pushTo) router.push(pushTo);
      router.refresh();
    });
  return (
    <RefreshContext value={refresh}>
      <RefreshBar pending={pending} />
      {children}
    </RefreshContext>
  );
}

/** `refresh(pushTo?)`: navigates to `pushTo` first when given, then refreshes, inside the shell's transition. */
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
