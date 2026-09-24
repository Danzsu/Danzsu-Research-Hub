import Link from "next/link";
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
        className="flex min-h-9 items-center gap-2 font-mono text-xs text-paper/65 hover:text-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
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
