"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Localized } from "@/data/digest-types";
import { useLanguage } from "./language-context";
import { PendingDot } from "./nav-parts";

export type FilterChip = { href: string; label: ReactNode; current: boolean };

/** A row of links on an ink page, the current one marked: the archive's tabs and the filters of the GitHub
 *  tab and the collection (G1 spec 4, 5). Each waits on the server, so each carries the pending dot. */
export function FilterChips({ label, chips }: { label: Localized; chips: FilterChip[] }) {
  const { language } = useLanguage();
  return (
    <nav aria-label={label[language]} className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={chip.current ? "page" : undefined}
          className="press-ink focus-ring flex min-h-10 items-center gap-1.5 border-2 border-paper/30 px-3 font-mono text-xs aria-[current=page]:border-signal aria-[current=page]:text-signal [&_svg]:size-3.5"
        >
          {chip.label}
          <PendingDot />
        </Link>
      ))}
    </nav>
  );
}
