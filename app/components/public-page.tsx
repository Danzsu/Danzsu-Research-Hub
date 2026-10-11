import Link from "next/link";
import type { ReactNode } from "react";
import { Radar } from "lucide-react";
import type { Language } from "@/data/digest-types";
import { LanguageProvider, LocalizedText } from "./language-context";
import { PublicLanguageSwitch } from "./public-language-switch";

const copy = {
  about: { hu: "Az oldalról", en: "About" },
  privacy: { hu: "Adatkezelés", en: "Privacy" },
  signIn: { hu: "Belépés", en: "Sign in" },
  footer: { hu: "Privát, meghívásos kutatási hub.", en: "A private, invite-only research hub." },
};

const linkClass = "focus-ring inline-flex min-h-10 items-center hover:text-signal";

/** The frame of the public pages (/about, /privacy): an ink page with the wordmark, the language pill and the
 *  footer links, in the visitor's language cookie but switchable in place. No app shell: nobody is signed in. */
export function PublicPage({ language, children }: { language: Language; children: ReactNode }) {
  return (
    <LanguageProvider initial={language}>
      <div className="min-h-dvh bg-ink text-paper">
        <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-10">
          <Link href="/about" className="focus-ring flex min-h-10 items-center gap-2 font-display text-lg sm:text-2xl">
            <Radar className="shrink-0 text-signal" /> NEON NEWS RADAR
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="press-ink focus-ring hidden min-h-10 items-center border-2 border-paper/30 px-4 font-mono text-xs sm:flex">
              <LocalizedText value={copy.signIn} />
            </Link>
            <PublicLanguageSwitch />
          </div>
        </header>
        {children}
        <footer className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 border-t border-paper/20 px-4 py-6 font-mono text-xs text-paper/60 sm:px-10">
          <span><LocalizedText value={copy.footer} /></span>
          <Link href="/about" className={linkClass}><LocalizedText value={copy.about} /></Link>
          <Link href="/privacy" className={linkClass}><LocalizedText value={copy.privacy} /></Link>
        </footer>
      </div>
    </LanguageProvider>
  );
}
