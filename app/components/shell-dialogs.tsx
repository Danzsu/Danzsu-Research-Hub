"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    search: "Keresés",
    soon: "Hamarosan. A Radar-hírek és a Library-posztok címében keres majd, elgépelés-tűrően és jelentés szerint is.",
    close: "Bezárás",
  },
  en: {
    search: "Search",
    soon: "Coming soon. It will search the titles of Radar stories and Library posts, typo-tolerant and by meaning.",
    close: "Close",
  },
};

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

function ShellDialog({ open, onOpenChange, title, closeLabel, children }: DialogProps & { title: string; closeLabel: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={closeLabel} className="border-2 border-ink bg-cream text-ink shadow-[8px_8px_0_var(--signal)]">
        <DialogHeader className="pr-10">
          <DialogTitle className="font-display text-3xl leading-none">
            {title}
            <span className="text-signal">{"//"}</span>
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Milestone A keeps the ⌘K palette's place; milestone C puts the search in it. */
export function SearchSoon({ open, onOpenChange }: DialogProps) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} title={t.search} closeLabel={t.close}>
      <DialogDescription className="text-sm leading-6 text-ink/70">{t.soon}</DialogDescription>
    </ShellDialog>
  );
}
