import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { LanguageToggle } from "@/app/components/language-toggle";
import { PageHeader } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";
import { getPost } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function youtubeId(url: string): string | null {
  const parsed = new URL(url);
  const id = parsed.hostname.endsWith("youtu.be")
    ? parsed.pathname.slice(1)
    : parsed.searchParams.get("v") ?? parsed.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getViewer())) redirect(`/login?next=/library/${id}`);
  const lang = await getLanguage();
  const post = Number.isInteger(Number(id)) ? await getPost(await createClient(), Number(id)) : null;
  if (!post) notFound();

  const video = post.kind === "youtube" ? youtubeId(post.url) : null;

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHeader backHref="/library" backLabel="LIBRARY">
        <LanguageToggle language={lang} />
      </PageHeader>

      <article className="bg-cream text-ink">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-16">
          <p className="font-mono text-xs tracking-[0.2em] text-signal">{post.author ?? new URL(post.url).hostname}</p>
          <h1 className="mt-3 font-display text-[clamp(1.9rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] [overflow-wrap:anywhere]">{post.title[lang]}</h1>

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
