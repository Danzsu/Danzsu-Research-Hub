"use client";

import { Keyboard, LogOut, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Language } from "@/data/digest-types";
import { Kbd } from "./kbd";
import { useLanguage } from "./language-context";
import { LanguageToggle, useSwitchLanguage } from "./language-toggle";
import { NavTooltip } from "./nav-parts";

const copy = {
  hu: { account: "Fiók", language: "Nyelv", shortcuts: "Billentyűparancsok", signOut: "Kijelentkezés" },
  en: { account: "Account", language: "Language", shortcuts: "Keyboard shortcuts", signOut: "Sign out" },
};

// Each language is named in itself, so a reader on the wrong one can still find theirs.
const LANGUAGES: [Language, string][] = [
  ["hu", "Magyar"],
  ["en", "English"],
];
const SIGNOUT_FORM = "account-signout";

const rowClass = "flex min-h-10 w-full items-center justify-between gap-3 font-mono text-[11px]";
const itemClass = `${rowClass} cursor-pointer rounded-none focus:bg-transparent focus:text-signal`;

function RowLabel({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4" aria-hidden="true" /> {children}
    </span>
  );
}

/** The e-mail wraps rather than truncates: it is the one line that says who is signed in. */
function Email({ email }: { email: string }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[11px] opacity-70 [overflow-wrap:anywhere]">
      <UserRound className="size-4 shrink-0" aria-hidden="true" /> {email}
    </p>
  );
}

/** The three rows every account surface shows (2a spec D5): the language, the shortcuts help, sign out. This
 *  is the Több sheet's form, where Tab reaches each control; the desktop menu renders them as menu items. */
export function AccountRows({ email, onHelp }: { email: string; onHelp: () => void }) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <div className="space-y-2">
      <Email email={email} />
      <div className={rowClass}>
        <span className="tracking-[0.14em]">{t.language}</span>
        <LanguageToggle />
      </div>
      <button type="button" onClick={onHelp} className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
        <RowLabel Icon={Keyboard}>{t.shortcuts}</RowLabel>
        <Kbd>?</Kbd>
      </button>
      <form action="/auth/signout" method="post">
        <button type="submit" className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
          <RowLabel Icon={LogOut}>{t.signOut}</RowLabel>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  );
}

/** The same rows as real menu items: arrows move between them, Enter picks one, Esc closes. A Radix menu
 *  swallows Tab, so nothing here is a control nested inside an item. The language is a radio group; the
 *  sign-out item is the submit button of the POST form beside it (a GET link could be prefetched). */
export function AccountMenuItems({ email, onHelp }: { email: string; onHelp: () => void }) {
  const { language } = useLanguage();
  const switchLanguage = useSwitchLanguage();
  const t = copy[language];
  return (
    <>
      <DropdownMenuLabel className="px-0 font-display text-xl">
        {t.account}
        <span className="text-signal">{"//"}</span>
      </DropdownMenuLabel>
      <Email email={email} />
      <DropdownMenuSeparator className="bg-ink/20" />
      <DropdownMenuRadioGroup value={language} onValueChange={(next) => switchLanguage(next as Language)} aria-label={t.language}>
        {LANGUAGES.map(([value, name]) => (
          <DropdownMenuRadioItem key={value} value={value} className={`${itemClass} pr-0 pl-6`}>
            {name}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator className="bg-ink/20" />
      <DropdownMenuItem onSelect={onHelp} className={`${itemClass} px-0`}>
        <RowLabel Icon={Keyboard}>{t.shortcuts}</RowLabel>
        <Kbd>?</Kbd>
      </DropdownMenuItem>
      <form id={SIGNOUT_FORM} action="/auth/signout" method="post" />
      <DropdownMenuItem asChild className={`${itemClass} px-0`}>
        <button type="submit" form={SIGNOUT_FORM}>
          <RowLabel Icon={LogOut}>{t.signOut}</RowLabel>
          <span aria-hidden="true">→</span>
        </button>
      </DropdownMenuItem>
    </>
  );
}

/** The sidebar's foot: the avatar (the e-mail's first letter in a signal circle) and the whole address open the
 *  menu in a cream dropdown; in the rail only the avatar shows, named in a tooltip. */
export function AccountMenu({ email, onHelp, iconOnly = false }: { email: string; onHelp: () => void; iconOnly?: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  const trigger = (
    <DropdownMenuTrigger
      aria-label={`${t.account}: ${email}`}
      className={`press-ink focus-ring flex min-h-10 w-full items-center gap-3 text-left font-mono text-[11px] text-paper/70 hover:text-paper data-[state=open]:text-signal ${iconOnly ? "justify-center" : ""}`}
    >
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-signal font-display text-sm text-ink">
        {(email[0] ?? "?").toUpperCase()}
      </span>
      {!iconOnly && <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{email}</span>}
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {iconOnly ? <NavTooltip label={t.account}>{trigger}</NavTooltip> : trigger}
      <DropdownMenuContent side="top" align="start" className="w-72 rounded-none border-2 border-ink bg-cream p-4 text-ink shadow-[6px_6px_0_var(--signal)]">
        <AccountMenuItems email={email} onHelp={onHelp} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
