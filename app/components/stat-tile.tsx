import type { ReactNode } from "react";

/** One number with its label (2a spec D8): the reader panel's progress now, the dashboard's tiles later. */
export function StatTile({ label, value, detail, children }: { label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs tracking-[0.14em]">{label}</p>
        <span className="font-display text-3xl text-signal">{value}</span>
      </div>
      {children}
      {detail && <p className="mt-3 font-mono text-[11px] text-ink/55">{detail}</p>}
    </section>
  );
}
