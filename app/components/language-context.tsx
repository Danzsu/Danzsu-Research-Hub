"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Language } from "@/data/digest-types";

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
  const setLanguage = (next: Language) => {
    persistLanguage(next);
    setState(next);
  };
  return <LanguageContext value={{ language, setLanguage }}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  const state = useContext(LanguageContext);
  if (!state) throw new Error("useLanguage must be used inside LanguageProvider (app/components/app-shell.tsx)");
  return state;
}
