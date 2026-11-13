"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/keymap";
import { normalizeQuery, SEARCH_MIN_LENGTH, type SearchHit } from "@/lib/search";
import { Kbd } from "./kbd";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    search: "Keresés",
    placeholder: "Hírek, posztok, repók…",
    none: "Nincs találat.",
    failed: "A keresés most nem érhető el.",
    all: "Összes találat →",
    kinds: { item: "HÍR", post: "POSZT", repo: "REPÓ" },
    help: "Billentyűparancsok",
    helpNote: "A Radar kártyáin működnek; beviteli mezőben és nyitott ablakban nem.",
    close: "Bezárás",
  },
  en: {
    search: "Search",
    placeholder: "Stories, posts, repos…",
    none: "No match.",
    failed: "Search is unavailable right now.",
    all: "All results →",
    kinds: { item: "STORY", post: "POST", repo: "REPO" },
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

/** What the palette asks for: the matches of a query. The shell passes the real API, the preview its fixtures. */
export type FindHits = (query: string) => Promise<SearchHit[]>;

/** The real `GET /api/search`. */
export const findHitsOnServer: FindHits = async (query) => {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`search answered ${response.status}`);
  return ((await response.json()) as { hits: SearchHit[] }).hits;
};

/** The offline preview's: fixtures that contain the query, loaded only there, so the real bundle never holds them. */
export const findHitsInPreview: FindHits = async (query) => {
  const { previewSearchHits } = await import("@/lib/search-fixtures");
  return previewSearchHits.filter((hit) => `${hit.title} ${hit.snippet}`.toLowerCase().includes(query.toLowerCase()));
};

const DEBOUNCE_MS = 200;

/** ⌘K, `/` and the Keresés entry open it: a field, the best matches as you type, and the full list on /search. */
export function SearchPalette({ open, onOpenChange, findHits }: DialogProps & { findHits: FindHits }) {
  const { language } = useLanguage();
  const t = copy[language];
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState<{ query: string; hits: SearchHit[] | "failed" } | null>(null);
  const query = normalizeQuery(typed);
  const ready = query.length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    const timer = setTimeout(() => {
      findHits(query).then(
        (hits) => !stale && setAnswer({ query, hits }),
        () => !stale && setAnswer({ query, hits: "failed" }),
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, ready, findHits]);

  const current = ready && answer?.query === query ? answer.hits : null;
  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} title={t.search} closeLabel={t.close}>
      <DialogDescription className="sr-only">{t.placeholder}</DialogDescription>
      <input
        type="search"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        maxLength={100}
        autoComplete="off"
        aria-label={t.search}
        placeholder={t.placeholder}
        className="focus-ring min-h-10 w-full border-2 border-ink bg-paper px-3 font-mono text-sm"
      />
      <div aria-live="polite" className="max-h-[50dvh] overflow-y-auto">
        {current === "failed" && <p className="font-mono text-xs text-ink/70">{t.failed}</p>}
        {Array.isArray(current) && current.length === 0 && <p className="font-mono text-xs text-ink/70">{t.none}</p>}
        {Array.isArray(current) && current.length > 0 && (
          <>
            <ul className="divide-y divide-ink/15">
              {current.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`}>
                  <Link href={hit.href} onClick={() => onOpenChange(false)} className="focus-ring block py-2 hover:bg-signal/10">
                    <span className="font-mono text-[11px] tracking-[0.12em] text-ink/70">
                      {t.kinds[hit.kind]} · {hit.meta}
                    </span>
                    <span className="block font-display text-lg leading-tight [overflow-wrap:anywhere]">{hit.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => onOpenChange(false)} className="focus-ring mt-3 inline-flex min-h-10 items-center font-mono text-xs underline">
              {t.all}
            </Link>
          </>
        )}
      </div>
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
                <Kbd key={key} className="bg-paper">
                  {key}
                </Kbd>
              ))}
            </dt>
            <dd>{label[language]}</dd>
          </Fragment>
        ))}
      </dl>
    </ShellDialog>
  );
}
