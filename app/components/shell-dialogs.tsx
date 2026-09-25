"use client";

import { Fragment, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/keymap";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    search: "Keresés",
    soon: "Hamarosan. A Radar-hírek és a Library-posztok címében keres majd, elgépelés-tűrően és jelentés szerint is.",
    help: "Billentyűparancsok",
    helpNote: "A Radar kártyáin működnek; beviteli mezőben és nyitott ablakban nem.",
    close: "Bezárás",
  },
  en: {
    search: "Search",
    soon: "Coming soon. It will search the titles of Radar stories and Library posts, typo-tolerant and by meaning.",
    help: "Keyboard shortcuts",
    helpNote: "They work on Radar cards; not while typing or with a dialog open.",
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

/** `?` opens it: the list comes from lib/keymap.ts, so a new shortcut shows up here by itself. */
export function ShortcutHelp({ open, onOpenChange }: DialogProps) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} title={t.help} closeLabel={t.close}>
      <DialogDescription className="text-sm leading-6 text-ink/70">{t.helpNote}</DialogDescription>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 font-mono text-sm">
        {SHORTCUTS.map(({ action, keys, label }) => (
          <Fragment key={action}>
            <dt className="flex flex-wrap gap-1">
              {keys.map((key) => (
                <kbd key={key} className="border border-ink bg-paper px-1.5 py-0.5 text-xs">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{label[language]}</dd>
          </Fragment>
        ))}
      </dl>
    </ShellDialog>
  );
}
