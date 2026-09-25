"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, Radar } from "lucide-react";
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { AccountActions, NavEntry, NavTooltip, navIcons, SoonList } from "./nav-parts";

// Desktop navigation, variant A: a sidebar, collapsible to a ~56px icon rail (spec 1.2). Variants B
// (top bar) and C (icon rail as the default) replace this one file: same props, the same items from
// lib/nav.ts, and each lays out `children` (the page) itself.

const copy = {
  hu: { nav: "Fő navigáció", collapse: "Oldalsáv összecsukása", expand: "Oldalsáv kinyitása" },
  en: { nav: "Main navigation", collapse: "Collapse sidebar", expand: "Expand sidebar" },
};

const itemClassFull =
  "focus-ring flex min-h-10 w-full items-center gap-3 border-l-2 border-transparent px-3 font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

const itemClassRail =
  "focus-ring flex min-h-10 w-full items-center justify-center border-l-2 border-transparent text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

export type DesktopNavProps = {
  email: string;
  onSearch: () => void;
  mode: NavMode;
  onToggle: () => void;
  children: ReactNode;
};

export function DesktopNav({ email, onSearch, mode, onToggle, children }: DesktopNavProps) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const t = copy[language];
  const rail = mode === "rail";
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!rail}
      aria-label={rail ? t.expand : t.collapse}
      className="focus-ring flex min-h-10 w-full items-center justify-center gap-2 border-t border-paper/15 pt-3 font-mono text-[11px] text-paper/55 hover:text-signal"
    >
      {rail ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
      {!rail && t.collapse}
    </button>
  );
  return (
    <div className="md:flex">
      {/* z-30: the rail's tooltips paint above the Radar's sticky header (z-20) and chip bar (z-10). */}
      {/* On short md+ viewports (landscape phones) the rail's bottom controls would sit below the fold; below 30rem tall, the whole column scrolls instead. */}
      <aside
        className={`sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-paper/15 bg-ink text-paper [@media(max-height:30rem)]:overflow-y-auto md:flex ${rail ? "w-14" : "w-64"}`}
      >
        {/* Named explicitly: in the rail only the icon is left. */}
        <Link
          href="/"
          aria-label="NEON NEWS RADAR"
          className={`focus-ring flex items-center gap-3 border-b border-paper/15 ${rail ? "justify-center p-3" : "p-5"}`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-signal bg-signal text-ink">
            <Radar className="size-5" />
          </span>
          {!rail && (
            <span className="font-display text-2xl leading-none tracking-tight">
              NEON
              <br />
              NEWS
              <br />
              <span className="text-signal">RADAR</span>
            </span>
          )}
        </Link>
        {/* No overflow in the rail: a scroll container would clip the tooltips (the few items fit). */}
        <nav aria-label={t.nav} className={rail ? "flex-1 px-1 py-4" : "flex-1 overflow-y-auto px-3 py-4"}>
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const Icon = navIcons[item.id];
              const entry = (
                <NavEntry item={item} active={active === item.id} onSearch={onSearch} className={rail ? itemClassRail : itemClassFull}>
                  <Icon className="size-4 shrink-0" />
                  <span className={rail ? "sr-only" : "flex-1 text-left"}>{item.label[language]}</span>
                </NavEntry>
              );
              return <li key={item.id}>{rail ? <NavTooltip label={item.label[language]}>{entry}</NavTooltip> : entry}</li>;
            })}
          </ul>
          {!rail && <SoonList className="mt-6 px-3" />}
        </nav>
        <div className={`space-y-3 border-t border-paper/15 ${rail ? "px-2 py-3" : "p-4"}`}>
          {rail ? <LanguageToggle iconOnly /> : <LanguageToggle />}
          {rail ? <AccountActions email={email} iconOnly /> : <AccountActions email={email} />}
          {rail ? <NavTooltip label={t.expand}>{toggle}</NavTooltip> : toggle}
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
