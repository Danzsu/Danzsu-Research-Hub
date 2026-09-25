"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BookOpen, ChartColumn, FolderOpen, LogOut, MessageSquare, Radar, Search, UserRound, type LucideIcon } from "lucide-react";
import { SOON_NAV, type NavId, type NavItem } from "@/lib/nav";
import { useLanguage } from "./language-context";

// What every navigation variant shares: the icon per lib/nav.ts item, one nav entry, the "soon"
// list, the account row, and the rail's hover/focus tooltip. A new desktop variant reuses these
// instead of copying them.

const copy = {
  hu: { soonGroup: "Hamarosan", soon: "hamarosan", signOut: "Kijelentkezés" },
  en: { soonGroup: "Coming soon", soon: "soon", signOut: "Sign out" },
};

export const navIcons: Record<NavId, LucideIcon> = {
  radar: Radar,
  library: BookOpen,
  search: Search,
  archive: Archive,
  collection: FolderOpen,
  stats: ChartColumn,
  chat: MessageSquare,
};

/** A page link (aria-current when it is the active one) or, for the search slot, a button. */
export function NavEntry({ item, active, onSearch, className, children }: {
  item: NavItem;
  active: boolean;
  onSearch: () => void;
  className: string;
  children: ReactNode;
}) {
  return item.href ? (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onSearch} className={className}>
      {children}
    </button>
  );
}

/** The future views: dimmed, labelled "soon", not clickable. */
export function SoonList({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ul aria-label={t.soonGroup} className={`space-y-1 ${className}`}>
      {SOON_NAV.map((item) => {
        const Icon = navIcons[item.id];
        return (
          <li key={item.id} className="flex min-h-10 items-center gap-3 font-mono text-sm opacity-40">
            <Icon className="size-4" />
            <span className="flex-1">{item.label[language]}</span>
            <span className="text-[10px] tracking-[0.12em]">{t.soon}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Wraps an icon-only control with its name as a small popup, shown on hover and on keyboard focus
 * (house style: paper background, 2px ink border, hard shadow). Used by every icon in the rail
 * (desktop-nav.tsx): the menu entries, language, help, sign-out and expand. The accessible name
 * itself comes from the child's own aria-label or sr-only text, not from this.
 */
export function NavTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative flex">
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap border-2 border-ink bg-paper px-2 py-1 font-mono text-xs text-ink opacity-0 shadow-[3px_3px_0_var(--ink)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

/** The signed-in address and the sign-out button. `iconOnly` is the rail's ~40px sign-out-only version. */
export function AccountActions({ email, iconOnly = false }: { email: string; iconOnly?: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  if (iconOnly) {
    return (
      <form action="/auth/signout" method="post" className="flex justify-center">
        <NavTooltip label={t.signOut}>
          <button type="submit" aria-label={t.signOut} className="focus-ring grid size-10 place-items-center text-paper/70 hover:text-signal">
            <LogOut className="size-4" />
          </button>
        </NavTooltip>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <UserRound className="size-4 shrink-0 opacity-60" />
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] opacity-70">{email}</p>
      <form action="/auth/signout" method="post">
        <button type="submit" className="focus-ring min-h-10 font-mono text-[11px] opacity-70 hover:text-signal hover:opacity-100">
          {t.signOut} →
        </button>
      </form>
    </div>
  );
}
