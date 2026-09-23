import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPost } from "@/lib/content";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function youtubeId(url: string): string | null {
  const parsed = new URL(url);
  const id = parsed.hostname.endsWith("youtu.be")
    ? parsed.pathname.slice(1)
    : parsed.searchParams.get("v") ?? parsed.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  if (!(await getViewer())) redirect(`/login?next=/library/${id}`);
  const lang = (await searchParams).lang === "en" ? "en" : "hu";
  const post = Number.isInteger(Number(id)) ? await getPost(await createClient(), Number(id)) : null;
  if (!post) notFound();

  const video = post.kind === "youtube" ? youtubeId(post.url) : null;

  return (
    <main className="min-h-screen bg-ink text-paper">
      <header className="flex items-center justify-between border-b border-paper/20 px-5 py-5 sm:px-10">
        <Link href={lang === "en" ? "/library?lang=en" : "/library"} className="flex items-center gap-3 font-mono text-xs text-paper/65 hover:text-signal">
          <ArrowLeft className="size-4" /> LIBRARY
        </Link>
        <div className="flex items-center gap-4">
          <Link href={`/library/${post.id}${lang === "hu" ? "?lang=en" : ""}`} className="rounded-full border border-paper/40 px-3 py-1 font-mono text-xs hover:border-signal hover:text-signal">
            {lang.toUpperCase()}
          </Link>
          <div className="flex items-center gap-2 font-display text-2xl">
            <Radar className="text-signal" /> NEON RADAR
          </div>
        </div>
      </header>

      <article className="bg-cream text-ink">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-10 sm:py-16">
          <p className="font-mono text-xs tracking-[0.2em] text-signal">{post.author ?? new URL(post.url).hostname}</p>
          <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,4.6rem)] leading-[0.9] tracking-[-0.05em]">{post.title[lang]}</h1>

          {video && (
            <div className="mt-8 aspect-video border-2 border-ink">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${video}`}
                title={post.title[lang]}
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
                className="size-full"
              />
            </div>
          )}

          <p className="mt-8 text-lg leading-8">{post.summary[lang]}</p>

          {post.keyPoints[lang].length > 0 && (
            <div className="mt-8 border-l-4 border-signal pl-5">
              <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{lang === "hu" ? "KULCSPONTOK" : "KEY POINTS"}</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
                {post.keyPoints[lang].map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y-2 border-ink py-4">
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => <span key={tag} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
            </div>
            <Button asChild className="rounded-none bg-ink font-mono text-xs text-paper hover:bg-signal hover:text-ink">
              <a href={post.url} target="_blank" rel="noreferrer">{lang === "hu" ? "Eredeti forrás" : "Original source"} <ExternalLink /></a>
            </Button>
          </div>

          {post.body && (
            <section className="mt-10">
              <p className="font-mono text-[10px] tracking-[0.15em] text-ink/55">
                MIRRORED COPY · {post.createdAt.slice(0, 10)} · © {post.author ?? new URL(post.url).hostname}
              </p>
              <div className="mt-4 space-y-4 text-base leading-7 text-ink/80">
                {post.body.split(/\n{2,}/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
              </div>
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
