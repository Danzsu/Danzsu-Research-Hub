import Link from "next/link";
import type { ReactNode } from "react";
import type { Language, Localized } from "@/data/digest-types";
import { BrandMark } from "./brand-mark";
import { LanguageProvider, LocalizedText } from "./language-context";
import { PublicLanguageSwitch } from "./public-language-switch";
import { SignInSheet } from "./sign-in-sheet";

const copy = {
  about: { hu: "Az oldalról", en: "About" },
  privacy: { hu: "Adatkezelés", en: "Privacy" },
  footer: { hu: "Privát, meghívásos kutatási hub.", en: "A private, invite-only research hub." },
  madeBy: { hu: "Made by Danzsu", en: "Made by Danzsu" },
};

const linkClass = "focus-ring inline-flex min-h-10 items-center hover:text-signal";

/** The frame of the public pages (/about, /privacy, /login): an ink page with the logo and wordmark, the cream sign-in
 *  and language buttons and the footer links, in the visitor's language cookie but switchable in place. No app shell:
 *  nobody is signed in. `signIn`: "auto" also slides the sign-in sheet up after a minute (the landing page), "none"
 *  leaves the button out (/login, which is the sign-in itself). */
export function PublicPage({
  language,
  notice,
  signIn = "button",
  children,
}: {
  language: Language;
  /** A one-line status under the header: "You're signed out." */
  notice?: Localized;
  signIn?: "button" | "auto" | "none";
  children: ReactNode;
}) {
  return (
    <LanguageProvider initial={language}>
      <div className="min-h-dvh bg-ink text-paper">
        <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-10">
          <Link href="/about" className="focus-ring flex min-h-10 items-center gap-2 font-display text-lg sm:text-2xl">
            <BrandMark className="size-8 sm:size-10" /> NEON NEWS RADAR
          </Link>
          <div className="flex items-center gap-3">
            {signIn !== "none" && <SignInSheet autoOpen={signIn === "auto"} />}
            <PublicLanguageSwitch />
          </div>
        </header>
        {notice && (
          <p role="status" className="mx-auto max-w-[1600px] px-4 pb-2 font-mono text-xs text-signal sm:px-10">
            <LocalizedText value={notice} />
          </p>
        )}
        {children}
        <footer className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 border-t border-paper/20 px-4 py-6 font-mono text-xs text-paper/60 sm:px-10">
          <span><LocalizedText value={copy.footer} /></span>
          <Link href="/about" className={linkClass}><LocalizedText value={copy.about} /></Link>
          <Link href="/privacy" className={linkClass}><LocalizedText value={copy.privacy} /></Link>
          <span className="sm:ml-auto"><LocalizedText value={copy.madeBy} /></span>
        </footer>
      </div>
    </LanguageProvider>
  );
}
