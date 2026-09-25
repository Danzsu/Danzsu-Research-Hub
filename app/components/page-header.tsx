import type { ReactNode } from "react";
import { Radar } from "lucide-react";

// Hook-free, so server pages and the client error boundary can both use these.

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

/** A lone card on ink: sign-in, error and not-found, the pages outside the app shell. */
export function StatusCard({ eyebrow, title, brand = false, children }: {
  eyebrow: string;
  title: string;
  /** The NEON NEWS RADAR wordmark above the eyebrow (sign-in). */
  brand?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-paper">
      <section className="w-full max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">
        {brand && (
          <div className="mb-6 flex items-center gap-2 font-display text-xl sm:text-2xl">
            <Radar className="shrink-0 text-signal" /> NEON NEWS RADAR
          </div>
        )}
        <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl leading-[0.9] tracking-[-0.04em] sm:text-5xl">
          {title}
          <span className="text-signal">{"//"}</span>
        </h1>
        {children}
      </section>
    </main>
  );
}
