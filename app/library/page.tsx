import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, PlayCircle, Radar } from "lucide-react";
import { getOpenSources, getPosts } from "@/lib/content";
import { createClient, getViewer } from "@/lib/supabase/server";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=/library");
  const lang = (await searchParams).lang === "en" ? "en" : "hu";
  const db = await createClient();
  const [posts, open] = await Promise.all([getPosts(db), getOpenSources(db)]);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <header className="flex items-center justify-between border-b border-paper/20 px-5 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-3 font-mono text-xs text-paper/65 hover:text-signal">
          <ArrowLeft className="size-4" /> LIVE RADAR
        </Link>
        <div className="flex items-center gap-4">
          <Link href={lang === "hu" ? "/library?lang=en" : "/library"} className="rounded-full border border-paper/40 px-3 py-1 font-mono text-xs hover:border-signal hover:text-signal">
            {lang.toUpperCase()}
          </Link>
          <div className="flex items-center gap-2 font-display text-2xl">
            <Radar className="text-signal" /> NEON RADAR
          </div>
        </div>
      </header>

      <section className="border-b-2 border-signal bg-cream px-5 py-12 text-ink sm:px-10 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-end">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-signal">MIRRORED SOURCES / KÖNYVTÁR</p>
            <h1 className="mt-3 font-display text-[clamp(3.6rem,10vw,8.8rem)] leading-[0.78] tracking-[-0.07em]">
              LIBRARY<span className="text-signal">{"//"}</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">
              Dobj be egy YouTube-videót vagy cikket: az AI összefoglalja, a cikk szövegét pedig elmenti ide, hogy a link halála után is megmaradjon.
            </p>
          </div>
          <SubmitForm />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-10">
        {open.length > 0 && (
          <div className="mb-8 space-y-2 font-mono text-xs">
            {open.map((source) => (
              <p key={source.id} className="flex flex-wrap gap-3 border border-paper/20 px-4 py-3">
                <span className={source.status === "failed" ? "text-signal" : "text-cyan"}>
                  {source.status === "failed" ? "FAILED" : "PROCESSING…"}
                </span>
                <span className="min-w-0 flex-1 truncate text-paper/70">{source.url}</span>
                {source.error && <span className="text-paper/45">{source.error}</span>}
              </p>
            ))}
          </div>
        )}

        {!posts.length && (
          <p className="font-mono text-sm text-paper/55">Még üres a könyvtár. / The library is empty.</p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {posts.map((post) => {
            const Icon = post.kind === "youtube" ? PlayCircle : FileText;
            return (
              <Link
                key={post.id}
                href={`/library/${post.id}${lang === "en" ? "?lang=en" : ""}`}
                className="group border-2 border-paper/30 bg-[#1c1c1c] p-6 transition hover:border-signal hover:bg-signal hover:text-ink"
              >
                <div className="flex items-start justify-between">
                  <Icon className="size-7 text-signal group-hover:text-ink" />
                  <span className="font-mono text-[10px] opacity-60">{post.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-6 font-mono text-xs tracking-[0.15em] opacity-60">{post.author ?? new URL(post.url).hostname}</p>
                <h2 className="mt-2 font-display text-3xl leading-[1.02]">{post.title[lang]}</h2>
                <p className="mt-4 line-clamp-3 text-base leading-6 opacity-65">{post.summary[lang]}</p>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-current/20 pt-4">
                  {post.tags.map((tag) => <span key={tag} className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
                  {post.body && <span className="ml-auto flex items-center gap-1 font-mono text-[10px] opacity-60"><BookOpen className="size-3" /> MIRRORED</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
