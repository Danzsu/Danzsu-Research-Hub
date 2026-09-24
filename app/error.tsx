"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-paper">
      <section className="w-full max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)]">
        <p className="font-mono text-xs tracking-[0.2em] text-signal">ERROR / HIBA</p>
        <h1 className="mt-2 font-display text-4xl leading-[0.9] tracking-[-0.04em]">
          SIGNAL LOST<span className="text-signal">{"//"}</span>
        </h1>
        <p className="mt-5 text-sm leading-6">
          Valami elromlott betöltés közben.
          <br />
          <span className="text-ink/60">Something broke while loading.</span>
        </p>
        <Button type="button" variant="ink" className="mt-6 min-h-10 w-full" onClick={reset}>
          Újra / Retry
        </Button>
      </section>
    </main>
  );
}
