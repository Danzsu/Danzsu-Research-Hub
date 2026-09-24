import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FileText, FlaskConical, GitFork, MessageSquareQuote, PlayCircle } from "lucide-react";
import { LanguageToggle } from "@/app/components/language-toggle";
import { PageHeader, PageHero } from "@/app/components/page-header";
import { getOpenSources, getPosts } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { hostOf } from "@/lib/pipeline/util";
import { createClient, getViewer } from "@/lib/supabase/server";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

const kindIcons = { article: FileText, youtube: PlayCircle, arxiv: FlaskConical, github: GitFork, x: MessageSquareQuote, pdf: FileText } as const;

export default async function LibraryPage() {
  if (!(await getViewer())) redirect("/login?next=/library");
  const lang = await getLanguage();
  const db = await createClient();
  const [posts, open] = await Promise.all([getPosts(db), getOpenSources(db)]);

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHeader backHref="/" backLabel="LIVE RADAR">
        <LanguageToggle language={lang} />
      </PageHeader>

      <PageHero
        eyebrow="MIRRORED SOURCES / KÖNYVTÁR"
        title="LIBRARY"
        lead={
          lang === "hu"
            ? "Dobj be egy YouTube-videót vagy cikket: az AI összefoglalja, a cikk szövegét pedig elmenti ide, hogy a link halála után is megmaradjon."
            : "Drop in a YouTube video or an article: the AI summarizes it and keeps a copy of the article text, so it outlives the original link."
        }
        aside={<SubmitForm language={lang} />}
      />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-10">
        {open.length > 0 && (
          <div className="mb-8 space-y-2 font-mono text-xs">
            {open.map((source) => (
              <p key={source.id} className="flex flex-wrap gap-3 border border-paper/20 px-4 py-3">
                <span className={source.status === "failed" ? "text-signal" : "text-cyan"}>
                  {source.status === "failed" ? "FAILED" : "PROCESSING…"}
                </span>
                <span className="min-w-0 flex-1 truncate text-paper/70">{source.url}</span>
                {source.error && <span className="w-full break-words text-paper/45">{source.error}</span>}
              </p>
            ))}
          </div>
        )}

        {!posts.length && (
          <p className="font-mono text-sm text-paper/55">{lang === "hu" ? "Még üres a könyvtár." : "The library is empty."}</p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {posts.map((post) => {
            const Icon = kindIcons[post.kind];
            return (
              <Link
                key={post.id}
                href={`/library/${post.id}`}
                className="focus-ring group border-2 border-paper/30 bg-[#1c1c1c] p-5 transition hover:border-signal hover:bg-signal hover:text-ink sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <Icon className="size-7 text-signal group-hover:text-ink" />
                  <span className="font-mono text-[10px] opacity-60">{post.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-6 font-mono text-xs tracking-[0.15em] opacity-60">{post.author ?? hostOf(post.url)}</p>
                <h2 className="mt-2 font-display text-2xl leading-[1.02] [overflow-wrap:anywhere] sm:text-3xl">{post.title[lang]}</h2>
                <p className="mt-4 line-clamp-3 text-base leading-6 opacity-65">{post.summary[lang]}</p>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-current/20 pt-4">
                  {post.tags.map((tag) => <span key={tag} className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
                  {post.meta.mirrored && <span className="ml-auto flex items-center gap-1 font-mono text-[10px] opacity-60"><BookOpen className="size-3" /> MIRRORED</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
