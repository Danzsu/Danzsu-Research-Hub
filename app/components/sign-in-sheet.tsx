"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "./language-context";
import { liftSurface } from "./lift-classes";
import { SignInCard, signInCopy, SignInForms } from "./sign-in-forms";

const copy = {
  hu: {
    signIn: "Belépés",
    note: "Csak meghívással lehet belépni. Nincs regisztráció: a meghívott címeddel jelentkezz be Google-lel vagy e-mailes linkkel.",
    close: "Bezárás",
  },
  en: {
    signIn: "Sign in",
    note: "Entry is by invitation only. There is no sign-up: use your invited address, with Google or an email link.",
    close: "Close",
  },
};

/** A visitor still on the landing page after a minute is shown the way in once (the owner's call, 2026-10-11). */
export const AUTO_OPEN_MS = 60_000;
const SHOWN_KEY = "sign-in-sheet-shown";

/** True only the first time in this visit (sessionStorage), and marks it; false when storage is blocked, so a
 *  private window never gets the pop-up on every page. */
export function claimAutoOpen(getStorage: () => Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    const storage = getStorage();
    if (storage.getItem(SHOWN_KEY)) return false;
    storage.setItem(SHOWN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** The public header's sign-in: a cream button that slides the sign-in card up from the bottom. With `autoOpen`
 *  the card also comes up by itself after AUTO_OPEN_MS, once per visit; opening it by hand counts as that once. */
export function SignInSheet({ autoOpen }: { autoOpen: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    const timer = setTimeout(() => {
      if (claimAutoOpen(() => window.sessionStorage)) setOpen(true);
    }, AUTO_OPEN_MS);
    return () => clearTimeout(timer);
  }, [autoOpen]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) claimAutoOpen(() => window.sessionStorage);
        setOpen(next);
      }}
    >
      <SheetTrigger className={`${liftSurface} flex min-h-10 items-center whitespace-nowrap px-4 font-mono text-xs shadow-[3px_3px_0_var(--signal)]`}>{t.signIn}</SheetTrigger>
      <SheetContent side="bottom" closeLabel={t.close} className="max-h-[90dvh] overflow-y-auto border-t-2 border-signal bg-ink px-4 pt-14 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))] sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <SignInCard>
            <SheetTitle className="font-display text-4xl leading-[0.9] tracking-[-0.04em]">
              {signInCopy.title[language]}
              <span className="text-signal">{"//"}</span>
            </SheetTitle>
            <SheetDescription className="mt-4 text-sm leading-6 text-ink/70">{t.note}</SheetDescription>
            <SignInForms next="/" />
          </SignInCard>
        </div>
      </SheetContent>
    </Sheet>
  );
}
