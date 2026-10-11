"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Archive, BookOpen, Building2, FolderOpen, GitFork, Radar, Search, type LucideIcon } from "lucide-react";
import type { NavId, NavItem } from "@/lib/nav";
import { useLanguage } from "./language-context";

// What every navigation variant shares: the icon per lib/nav.ts item, one nav entry, the "soon"
// list, the account row, and the rail's hover/focus tooltip. A new desktop variant reuses these
// instead of copying them.

export const navIcons: Record<NavId, LucideIcon> = {
  radar: Radar,
  companies: Building2,
  library: BookOpen,
  github: GitFork,
  search: Search,
  archive: Archive,
  collection: FolderOpen,
};

/**
 * A Link's pending navigation (spec 2.1): the live dot, always laid out at its 9px so nothing shifts,
 * visible only while this Link's navigation waits, and only from 100ms on (`.pending-dot`, globals.css).
 * It must sit inside the Link, whose status useLinkStatus reads.
 */
export function PendingDot({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending || undefined} className={`pending-dot live-pulse shrink-0 text-signal ${className}`} />;
}

/** A page link (aria-current when it is the active one) or, for the search slot, a button, holding the
 *  item's icon and label; `children` go after the label (the sidebar's ⌘K hint). `onClick` runs when
 *  the link is followed: the mobile "Több" sheet closes itself with it. A link carries the PendingDot:
 *  at the row's end, or with `dotOnIcon` (the rail, the bottom bar) on its icon's top-right corner. */
export function NavEntry({ item, active, onSearch, onClick, className, iconClass, labelClass, dotOnIcon = false, children }: {
  item: NavItem;
  active: boolean;
  onSearch: () => void;
  onClick?: () => void;
  className: string;
  iconClass: string;
  /** The rail's is `sr-only`: the icon alone shows, and the entry keeps its name. */
  labelClass?: string;
  dotOnIcon?: boolean;
  children?: ReactNode;
}) {
  const { language } = useLanguage();
  const Icon = navIcons[item.id];
  const label = <span className={labelClass}>{item.label[language]}</span>;
  if (!item.href) {
    return (
      <button type="button" onClick={onSearch} className={className}>
        <Icon className={iconClass} />
        {label}
        {children}
      </button>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onClick} className={className}>
      <span className="relative flex shrink-0">
        <Icon className={iconClass} />
        {dotOnIcon && <PendingDot className="absolute -top-1 -right-1.5" />}
      </span>
      {label}
      {children}
      {!dotOnIcon && <PendingDot className="ml-auto" />}
    </Link>
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
