"use client";

import { useLanguage } from "./language-context";
import { liftSurface } from "./lift-classes";

// Names the switch in the language it switches to, like the shell's toggle.
const label = { hu: "Switch to English", en: "Váltás magyarra" };

/** The public pages' HU/EN switch, a cream square like the sign-in button beside it: they hold both languages (LocalizedText), so it switches in place, no refresh. */
export function PublicLanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === "hu" ? "en" : "hu")}
      aria-label={label[language]}
      className={`${liftSurface} min-h-10 min-w-10 px-3 font-mono text-xs shadow-[3px_3px_0_var(--signal)]`}
    >
      {language.toUpperCase()}
    </button>
  );
}
