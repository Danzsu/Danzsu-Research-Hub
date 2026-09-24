"use client";

import { useRouter } from "next/navigation";
import type { Language } from "@/data/digest-types";

/** Read back on the server by `getLanguage()` in lib/language.ts. */
export function persistLanguage(language: Language) {
  document.cookie = `lang=${language}; path=/; max-age=31536000; samesite=lax`;
}

/** For server-rendered pages: stores the choice, then re-renders the page in it. */
export function LanguageToggle({ language }: { language: Language }) {
  const router = useRouter();
  const next = language === "hu" ? "en" : "hu";

  return (
    <button
      type="button"
      onClick={() => {
        persistLanguage(next);
        router.refresh();
      }}
      aria-label={next === "en" ? "Switch to English" : "Váltás magyarra"}
      className="focus-ring min-h-9 rounded-full border border-paper/40 px-3 font-mono text-xs hover:border-signal hover:text-signal"
    >
      {language.toUpperCase()}
    </button>
  );
}
