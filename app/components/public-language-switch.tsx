"use client";

import { useLanguage } from "./language-context";

// Names the switch in the language it switches to, like the shell's toggle.
const label = { hu: "Switch to English", en: "Váltás magyarra" };

/** The public pages' HU/EN pill: they hold both languages (LocalizedText), so it switches in place, no refresh. */
export function PublicLanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === "hu" ? "en" : "hu")}
      aria-label={label[language]}
      className="press-shift focus-ring min-h-10 rounded-full border border-current/40 px-4 font-mono text-xs hover:border-signal hover:text-signal active:border-signal active:text-signal"
    >
      {language.toUpperCase()}
    </button>
  );
}
