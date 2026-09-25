import Link from "next/link";
import { Archive, CalendarDays, Clock3 } from "lucide-react";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import type { ArchiveIssue } from "@/data/digest-types";

// Server-rendered with both languages; LocalizedText picks one on the client, so the toggle needs no refresh here.
const copy = {
  lead: {
    hu: "Vasárnaponként lezárt, konszolidált AI-kiadások. A források és a sorrend a zárás után változatlan maradnak.",
    en: "Consolidated AI issues, closed every Sunday. Sources and order stay fixed after the freeze.",
  },
  empty: {
    hu: "Még nincs lezárt hét. Az első vasárnap éjfélkor zárul le, addig a Radaron olvashatod.",
    en: "No closed week yet. The first one closes on Sunday at midnight; until then, read it on the Radar.",
  },
  toRadar: { hu: "Irány a Radar →", en: "Go to the Radar →" },
  items: { hu: "HÍR", en: "ITEMS" },
  minutes: { hu: "PERC", en: "MIN" },
};

/** The archive page body; the offline preview renders it with fixtures. */
export function ArchiveView({ issues }: { issues: ArchiveIssue[] }) {
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="WEEKLY FREEZE / HETI ZÁRÁS" title="ARCHIVE" lead={<LocalizedText value={copy.lead} />} />
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-10 lg:grid-cols-2">
        {!issues.length && (
          <p className="font-mono text-sm text-paper/55 lg:col-span-2">
            <LocalizedText value={copy.empty} />{" "}
            <Link href="/" className="focus-ring inline-flex min-h-10 items-center text-signal underline">
              <LocalizedText value={copy.toRadar} />
            </Link>
          </p>
        )}
        {issues.map((issue, index) => (
          <Link
            key={issue.id}
            href={`/archive/${issue.id}`}
            className="focus-ring group border-2 border-paper/30 bg-[#1c1c1c] p-6 transition hover:border-signal hover:bg-signal hover:text-ink"
          >
            <div className="flex items-start justify-between">
              <Archive className="size-7 text-signal group-hover:text-ink" />
              <span className="font-display text-5xl text-paper/15 group-hover:text-ink/20">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-8 font-mono text-xs tracking-[0.15em] opacity-60">{issue.period}</p>
            <h2 className="mt-2 font-display text-5xl leading-none">{issue.week}</h2>
            <p className="mt-4 text-base leading-6 opacity-65 [overflow-wrap:anywhere]">
              <LocalizedText value={issue.top} />
            </p>
            <div className="mt-7 flex flex-wrap gap-5 border-t border-current/20 pt-4 font-mono text-xs">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4" /> {issue.itemCount} <LocalizedText value={copy.items} />
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="size-4" /> {issue.readMinutes} <LocalizedText value={copy.minutes} />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
