"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Language } from "@/data/digest-types";
import { activeNavId, inMobileMore, MOBILE_BAR_NAV, MOBILE_CHAT_SLOT, MOBILE_MORE_NAV, type NavItem } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { DesktopNav } from "./desktop-nav";
import { LanguageProvider, useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { LinkChat, TaiyakiButton, type ChatPreview } from "./link-chat";
import { AccountActions, NavEntry, SoonList } from "./nav-parts";
import { SearchSoon, ShortcutHelp } from "./shell-dialogs";
import { toasts, UndoToast } from "./undo-toast";
import { useShortcuts } from "./use-shortcuts";

const copy = {
  hu: { nav: "Menü", more: "Több", language: "Nyelv", close: "Bezárás" },
  en: { nav: "Menu", more: "More", language: "Language", close: "Close" },
};

/** Mirrors persistLanguage (language-context.tsx): same cookie shape, read back on the server by getNavMode (lib/language.ts). */
function persistNavMode(mode: NavMode) {
  document.cookie = `nav=${mode}; path=/; max-age=31536000; samesite=lax`;
}

/** Every signed-in page: the desktop nav or the mobile bottom bar around the page, the link chat, plus the shell-wide dialogs. */
export function AppShell({
  language,
  email,
  initialNavMode,
  chatPreview,
  children,
}: {
  language: Language;
  email: string;
  initialNavMode: NavMode;
  /** The offline preview's link chat: fixtures, no network. */
  chatPreview?: ChatPreview;
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(initialNavMode);
  const [chatOpen, setChatOpen] = useState(false);
  // Whichever taiyaki opened the panel gets the focus back when it closes.
  const chatOpener = useRef<HTMLButtonElement>(null);
  const toggleChat = (event: MouseEvent<HTMLButtonElement>) => {
    chatOpener.current = event.currentTarget;
    setChatOpen(!chatOpen);
  };
  const openSearch = () => setSearchOpen(true);
  const openHelp = () => setHelpOpen(true);
  const toggleNav = () => {
    const next: NavMode = navMode === "rail" ? "full" : "rail";
    persistNavMode(next);
    setNavMode(next);
  };
  // ⌘K and / are reserved for the search palette (milestone C); until then they open its placeholder.
  useShortcuts({
    search: openSearch,
    help: openHelp,
    toggleNav,
    // z: last in tab order and gone in 5s, so a keyboard user can't reliably Tab to the toast's Undo button.
    undo: () => {
      const toast = toasts.getSnapshot();
      if (toast?.undo) toasts.undo(toast.id);
    },
  });
  return (
    <LanguageProvider initial={language}>
      <DesktopNav email={email} onSearch={openSearch} onHelp={openHelp} mode={navMode} onToggle={toggleNav}>
        {/* Room for the fixed bottom bar and the taiyaki raised 16px above it, and from md for the corner taiyaki,
            so none of them covers the end of the page. The corner one's goes inside the page's own last element,
            so that page's surface runs on under it. */}
        <div className="pb-[calc(5.25rem_+_env(safe-area-inset-bottom))] md:pb-0 md:[&>:last-child]:pb-24">{children}</div>
      </DesktopNav>
      <MobileNav
        email={email}
        onSearch={openSearch}
        chat={
          <TaiyakiButton
            open={chatOpen}
            onClick={toggleChat}
            className="-mt-[18px] grid size-14 self-start justify-self-center shadow-[3px_3px_0_var(--signal)]"
          />
        }
      />
      <TaiyakiButton
        open={chatOpen}
        onClick={toggleChat}
        className="fixed right-6 bottom-6 z-40 hidden size-14 shadow-[4px_4px_0_var(--ink)] md:grid"
      />
      {/* Keyed so the preview's fail=1 and slow=1 switches get a fresh in-memory transport. */}
      <LinkChat key={`${chatPreview?.failWrites}:${chatPreview?.delayMs}`} open={chatOpen} onOpenChange={setChatOpen} opener={chatOpener} preview={chatPreview} />
      <SearchSoon open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <UndoToast />
    </LanguageProvider>
  );
}

const slotClass =
  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 font-mono text-[10px] aria-[current=page]:text-signal data-[active]:text-signal data-[state=open]:text-signal";

/** Below md: five slots in thumb reach, the taiyaki raised in the middle. "Több" holds Archívum, the
 *  language, the coming views and sign-out; on Archívum's pages its slot carries the active mark. */
function MobileNav({ email, onSearch, chat }: { email: string; onSearch: () => void; chat: ReactNode }) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const [moreOpen, setMoreOpen] = useState(false);
  const moreList = useRef<HTMLUListElement>(null);
  const t = copy[language];
  const slot = (item: NavItem) => (
    <NavEntry key={item.id} item={item} active={active === item.id} onSearch={onSearch} className={slotClass} iconClass="size-5" />
  );
  return (
    <nav
      id="mobile-nav"
      aria-label={t.nav}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-signal bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
    >
      {MOBILE_BAR_NAV.slice(0, MOBILE_CHAT_SLOT).map(slot)}
      {chat}
      {MOBILE_BAR_NAV.slice(MOBILE_CHAT_SLOT).map(slot)}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={slotClass} data-active={inMobileMore(active) || undefined}>
          <Menu className="size-5" />
          <span>{t.more}</span>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          closeLabel={t.close}
          // Radix skips links when it picks the first control, which would land on the language toggle.
          onOpenAutoFocus={(event) => {
            const first = moreList.current?.querySelector("a");
            if (!first) return;
            event.preventDefault();
            first.focus();
          }}
          className="max-h-[85dvh] gap-5 overflow-y-auto border-t-2 border-ink bg-cream p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] text-ink"
        >
          <SheetHeader className="p-0 pr-12">
            <SheetTitle className="font-display text-2xl">
              {t.more}
              <span className="text-signal">{"//"}</span>
            </SheetTitle>
          </SheetHeader>
          {/* The active entry is ink with a signal bar and wash, like the sidebar's: small signal text on cream
              is under 3:1 (DESIGN.md → Colors). The bar hangs in the sheet's padding, so the icons stay in line. */}
          <ul ref={moreList} className="border-b-2 border-ink pb-4">
            {MOBILE_MORE_NAV.map((item) => (
              <li key={item.id}>
                <NavEntry
                  item={item}
                  active={active === item.id}
                  onSearch={onSearch}
                  onClick={() => setMoreOpen(false)}
                  className="focus-ring -ml-3.5 flex min-h-10 items-center gap-3 border-l-2 border-transparent pl-3 font-mono text-sm aria-[current=page]:border-signal aria-[current=page]:bg-signal/10"
                  iconClass="size-4"
                />
              </li>
            ))}
          </ul>
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
