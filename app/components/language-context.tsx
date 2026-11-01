"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Language, Localized } from "@/data/digest-types";

/** Stores the choice for the server (`getLanguage()` in lib/language.ts) and relabels <html lang> for the page already shown. */
function persistLanguage(language: Language) {
  document.cookie = `lang=${language}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = language;
}

type LanguageState = { language: Language; setLanguage: (language: Language) => void };

const LanguageContext = createContext<LanguageState | null>(null);

/** The reader's language for every client component in the app shell, seeded from the `lang` cookie. */
export function LanguageProvider({ initial, children }: { initial: Language; children: ReactNode }) {
  const [language, setState] = useState(initial);
  // Stable until the language changes: every useLanguage() reader (each card's rating control among them)
  // would otherwise re-render whenever the shell does, on each chat or panel toggle.
  const value = useMemo(() => {
    const setLanguage = (next: Language) => {
      persistLanguage(next);
      setState(next);
    };
    return { language, setLanguage };
  }, [language]);
  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  const state = useContext(LanguageContext);
  if (!state) throw new Error("useLanguage must be used inside LanguageProvider (app/components/app-shell.tsx)");
  return state;
}

/**
 * One `{ hu, en }` text in the reader's language. Server components hand both languages to it, so
 * the language toggle switches the page without a round trip.
 */
export function LocalizedText({ value }: { value: Localized }) {
  const { language } = useLanguage();
  return value[language];
}
