import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, CalendarDays, Clock3 } from "lucide-react";
import { LanguageToggle } from "@/app/components/language-toggle";
import { PageHeader } from "@/app/components/page-header";
import { getArchive } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  if (!(await getViewer())) redirect("/login?next=/archive");
  const language = await getLanguage();
  const archiveIssues = await getArchive(await createClient(), language);

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHeader backHref="/" backLabel="LIVE RADAR">
        <LanguageToggle language={language} />
      </PageHeader>
      <section className="border-b-2 border-signal bg-cream px-4 py-10 text-ink sm:px-10 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-xs tracking-[0.2em] text-signal">WEEKLY FREEZE / HETI ZÁRÁS</p>
          <h1 className="mt-3 max-w-5xl font-display text-[clamp(2.6rem,11vw,8.8rem)] leading-[0.78] tracking-[-0.07em]">
            ARCHIVE<span className="text-signal">{"//"}</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">
            {language === "hu"
              ? "Vasárnaponként lezárt, konszolidált AI-kiadások. A források és a sorrend a zárás után változatlan maradnak."
              : "Consolidated AI issues, closed every Sunday. Sources and order stay fixed after the freeze."}
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-10 lg:grid-cols-2">
        {!archiveIssues.length && (
          <p className="font-mono text-sm text-paper/55 lg:col-span-2">
            {language === "hu" ? "Még nincs lezárt hét." : "No closed week yet."}
          </p>
        )}
        {archiveIssues.map((issue, index) => (
          <Link
            key={issue.id}
            href={`/archive/${issue.id}`}
            className="group border-2 border-paper/30 bg-[#1c1c1c] p-6 transition hover:border-signal hover:bg-signal hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <div className="flex items-start justify-between">
              <Archive className="size-7 text-signal group-hover:text-ink" />
              <span className="font-display text-5xl text-paper/15 group-hover:text-ink/20">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-8 font-mono text-xs tracking-[0.15em] opacity-60">{issue.period}</p>
            <h2 className="mt-2 font-display text-5xl leading-none">{issue.week}</h2>
            <p className="mt-4 text-base leading-6 opacity-65">{issue.top}</p>
            <div className="mt-7 flex flex-wrap gap-5 border-t border-current/20 pt-4 font-mono text-xs">
              <span className="flex items-center gap-2"><CalendarDays className="size-4" /> {issue.itemCount} ITEMS</span>
              <span className="flex items-center gap-2"><Clock3 className="size-4" /> {issue.readMinutes} MIN</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
