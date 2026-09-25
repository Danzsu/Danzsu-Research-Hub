"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLanguage } from "./language-context";
import { NavTooltip } from "./nav-parts";

// Each label names the switch in the language it switches to.
const copy = { hu: { label: "Switch to English" }, en: { label: "Váltás magyarra" } };

/** Switches the whole shell at once; the server-rendered page follows with one refresh. `iconOnly` is the rail's ~40px version (desktop-nav.tsx). */
export function LanguageToggle({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const label = copy[language].label;
  const toggle = (
    <button
      type="button"
      onClick={() => {
        setLanguage(language === "hu" ? "en" : "hu");
        router.refresh();
      }}
      aria-label={label}
      className={
        iconOnly
          ? "focus-ring grid size-10 place-items-center rounded-full border border-current/40 hover:border-signal hover:text-signal"
          : "focus-ring min-h-10 rounded-full border border-current/40 px-4 font-mono text-xs hover:border-signal hover:text-signal"
      }
    >
      {iconOnly ? <Languages className="size-4" /> : language.toUpperCase()}
    </button>
  );
  // The rail shows only the icon, so its name comes up as a tooltip on hover and focus (spec 1.2).
  return iconOnly ? <NavTooltip label={label}>{toggle}</NavTooltip> : toggle;
}
