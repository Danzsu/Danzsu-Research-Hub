import { redirect } from "next/navigation";
import { ArrowLeft, Archive, CalendarDays, Clock3, Radar } from "lucide-react";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getAppUser } from "@/app/lib/user";
import { archiveIssues } from "@/data/digest";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getAppUser();
  if (!user) redirect(chatGPTSignInPath("/archive"));

  return (
    <main className="min-h-screen bg-ink text-paper">
      <header className="flex items-center justify-between border-b border-paper/20 px-5 py-5 sm:px-10">
        <a href="/" className="flex items-center gap-3 font-mono text-xs text-paper/65 hover:text-signal">
          <ArrowLeft className="size-4" /> LIVE RADAR
        </a>
        <div className="flex items-center gap-2 font-display text-2xl">
          <Radar className="text-signal" /> NEON RADAR
        </div>
      </header>
      <section className="border-b-2 border-signal bg-cream px-5 py-12 text-ink sm:px-10 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-xs tracking-[0.2em] text-signal">WEEKLY FREEZE / HETI ZÁRÁS</p>
          <h1 className="mt-3 max-w-5xl font-display text-[clamp(3.6rem,10vw,8.8rem)] leading-[0.78] tracking-[-0.07em]">
            ARCHIVE<span className="text-signal">//</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">
            Péntekenként 16:00-kor lezárt, konszolidált AI-kiadások. A források és a sorrend a zárás után változatlan maradnak.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-10 sm:px-10 lg:grid-cols-2">
        {archiveIssues.map((issue, index) => (
          <article key={issue.id} className="group border-2 border-paper/30 bg-[#1c1c1c] p-6 transition hover:border-signal hover:bg-signal hover:text-ink">
            <div className="flex items-start justify-between">
              <Archive className="size-7 text-signal group-hover:text-ink" />
              <span className="font-display text-5xl text-paper/15 group-hover:text-ink/20">0{index + 1}</span>
            </div>
            <p className="mt-8 font-mono text-xs tracking-[0.15em] opacity-60">{issue.period}</p>
            <h2 className="mt-2 font-display text-5xl leading-none">{issue.week}</h2>
            <p className="mt-4 text-base leading-6 opacity-65">{issue.top}</p>
            <div className="mt-7 flex flex-wrap gap-5 border-t border-current/20 pt-4 font-mono text-xs">
              <span className="flex items-center gap-2"><CalendarDays className="size-4" /> {issue.itemCount} ITEMS</span>
              <span className="flex items-center gap-2"><Clock3 className="size-4" /> {issue.readMinutes} MIN</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
