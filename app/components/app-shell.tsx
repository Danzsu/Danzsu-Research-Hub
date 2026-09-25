"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Language } from "@/data/digest-types";
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { DesktopNav } from "./desktop-nav";
import { LanguageProvider, useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { AccountActions, NavEntry, navIcons, SoonList } from "./nav-parts";
import { SearchSoon } from "./shell-dialogs";
import { UndoToast } from "./undo-toast";

const copy = {
  hu: { nav: "Menü", more: "Több", language: "Nyelv", close: "Bezárás" },
  en: { nav: "Menu", more: "More", language: "Language", close: "Close" },
};

/** Mirrors persistLanguage (language-context.tsx): same cookie shape, read back on the server by getNavMode (lib/language.ts). */
function persistNavMode(mode: NavMode) {
  document.cookie = `nav=${mode}; path=/; max-age=31536000; samesite=lax`;
}

/** Every signed-in page: the desktop nav or the mobile bottom bar around the page, plus the shell-wide dialogs. */
export function AppShell({
  language,
  email,
  initialNavMode,
  children,
}: {
  language: Language;
  email: string;
  initialNavMode: NavMode;
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(initialNavMode);
  const openSearch = () => setSearchOpen(true);
  const toggleNav = () => {
    const next: NavMode = navMode === "rail" ? "full" : "rail";
    persistNavMode(next);
    setNavMode(next);
  };
  return (
    <LanguageProvider initial={language}>
      <DesktopNav email={email} onSearch={openSearch} mode={navMode} onToggle={toggleNav}>
        {/* Room for the fixed bottom bar, so it never covers the end of the page. */}
        <div className="pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </DesktopNav>
      <MobileNav email={email} onSearch={openSearch} />
      <SearchSoon open={searchOpen} onOpenChange={setSearchOpen} />
      <UndoToast />
    </LanguageProvider>
  );
}

const slotClass =
  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 font-mono text-[10px] aria-[current=page]:text-signal data-[state=open]:text-signal";

/** Below md: five slots in thumb reach. "Több" holds the language, sign-out and the coming views. */
function MobileNav({ email, onSearch }: { email: string; onSearch: () => void }) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const t = copy[language];
  return (
    <nav
      id="mobile-nav"
      aria-label={t.nav}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-signal bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = navIcons[item.id];
        return (
          <NavEntry key={item.id} item={item} active={active === item.id} onSearch={onSearch} className={slotClass}>
            <Icon className="size-5" />
            <span>{item.label[language]}</span>
          </NavEntry>
        );
      })}
      <Sheet>
        <SheetTrigger className={slotClass}>
          <Menu className="size-5" />
          <span>{t.more}</span>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          closeLabel={t.close}
          className="max-h-[85dvh] gap-5 overflow-y-auto border-t-2 border-ink bg-cream p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] text-ink"
        >
          <SheetHeader className="p-0 pr-12">
            <SheetTitle className="font-display text-2xl">
              {t.more}
              <span className="text-signal">{"//"}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-between border-b-2 border-ink pb-4">
            <span className="font-mono text-xs tracking-[0.14em]">{t.language}</span>
            <LanguageToggle />
          </div>
          <SoonList />
          <div className="border-t-2 border-ink pt-4">
            <AccountActions email={email} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
