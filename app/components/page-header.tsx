import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Radar } from "lucide-react";

/** Top bar of the secondary pages. Below `sm` the wordmark collapses to its icon so the bar fits 360px. */
export function PageHeader({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-paper/20 px-4 py-4 sm:px-10 sm:py-5">
      <Link
        href={backHref}
        className="focus-ring flex min-h-9 items-center gap-2 font-mono text-xs text-paper/65 hover:text-signal"
      >
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <div className="flex items-center gap-3 sm:gap-4">
        {children}
        <Link href="/" aria-label="NEON NEWS RADAR" className="flex items-center gap-2 font-display text-xl sm:text-2xl">
          <Radar className="text-signal" />
          <span className="hidden sm:inline">NEON NEWS RADAR</span>
        </Link>
      </div>
    </header>
  );
}

/** The cream title band of the secondary pages: eyebrow, `TITLE//`, lead text, optional side panel. */
export function PageHero({ eyebrow, title, lead, aside }: { eyebrow: string; title: string; lead: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b-2 border-signal bg-cream px-4 py-10 text-ink sm:px-10 sm:py-16">
      <div className={`mx-auto max-w-6xl ${aside ? "grid gap-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-end" : ""}`}>
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,11vw,8.8rem)] leading-[0.78] tracking-[-0.07em]">
            {title}
            <span className="text-signal">{"//"}</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">{lead}</p>
        </div>
        {aside}
      </div>
    </section>
  );
}
