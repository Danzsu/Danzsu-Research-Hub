"use client";

import { Keyboard, LogOut, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { NavTooltip } from "./nav-parts";

const copy = {
  hu: { account: "Fiók", language: "Nyelv", shortcuts: "Billentyűparancsok", signOut: "Kijelentkezés" },
  en: { account: "Account", language: "Language", shortcuts: "Keyboard shortcuts", signOut: "Sign out" },
};

const rowClass = "flex min-h-10 w-full items-center justify-between gap-3 font-mono text-[11px]";

/** The three rows every account surface shows (2a spec D5): the language, the shortcuts help, sign out. The
 *  e-mail wraps rather than truncates: it is the one line that says who is signed in. */
export function AccountRows({ email, onHelp }: { email: string; onHelp: () => void }) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 font-mono text-[11px] opacity-70 [overflow-wrap:anywhere]">
        <UserRound className="size-4 shrink-0" aria-hidden="true" /> {email}
      </p>
      <div className={rowClass}>
        <span className="tracking-[0.14em]">{t.language}</span>
        <LanguageToggle />
      </div>
      <button type="button" onClick={onHelp} className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
        <span className="flex items-center gap-2">
          <Keyboard className="size-4" aria-hidden="true" /> {t.shortcuts}
        </span>
        <kbd className="border border-current/40 px-1.5 text-[11px]">?</kbd>
      </button>
      <form action="/auth/signout" method="post">
        <button type="submit" className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
          <span className="flex items-center gap-2">
            <LogOut className="size-4" aria-hidden="true" /> {t.signOut}
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  );
}

/** The sidebar's foot: the avatar (the e-mail's first letter in a signal circle) and the whole address open the rows
 *  in a cream dropdown; in the rail only the avatar shows, named in a tooltip. */
export function AccountMenu({ email, onHelp, iconOnly = false }: { email: string; onHelp: () => void; iconOnly?: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  const avatar = <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal font-display text-sm text-ink">{(email[0] ?? "?").toUpperCase()}</span>;
  const trigger = (
    <DropdownMenuTrigger
      aria-label={iconOnly ? t.account : undefined}
      className={`press-ink focus-ring flex min-h-10 w-full items-center gap-3 text-left font-mono text-[11px] text-paper/70 hover:text-paper data-[state=open]:text-signal ${iconOnly ? "justify-center" : ""}`}
    >
      {avatar}
      {!iconOnly && <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{email}</span>}
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {iconOnly ? <NavTooltip label={t.account}>{trigger}</NavTooltip> : trigger}
      <DropdownMenuContent side="top" align="start" className="w-72 rounded-none border-2 border-ink bg-cream p-4 text-ink shadow-[6px_6px_0_var(--signal)]">
        <DropdownMenuLabel className="px-0 font-display text-xl">
          {t.account}
          <span className="text-signal">{"//"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-ink/20" />
        {/* The rows handle their own keys and clicks; the menu only positions and dismisses them. */}
        <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()} className="block rounded-none p-0 focus:bg-transparent">
          <div>
            <AccountRows email={email} onHelp={onHelp} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
