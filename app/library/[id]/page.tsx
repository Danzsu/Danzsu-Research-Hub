import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { LanguageToggle } from "@/app/components/language-toggle";
import { PageHeader } from "@/app/components/page-header";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import { plainText } from "@/lib/blocks";
import { getPost } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { hostOf, parseId } from "@/lib/pipeline/util";
import { createClient, getViewer } from "@/lib/supabase/server";
import { PostToolbar } from "./post-toolbar";

export const dynamic = "force-dynamic";

const kindLabel = { article: "ARTICLE", youtube: "VIDEO", arxiv: "PAPER", github: "REPO", x: "POST", pdf: "PDF" } as const;

const notices = {
  hu: {
    noarchive: "Saját összefoglaló — az eredeti:",
    failed: "A tartalmat nem sikerült átmenteni — az eredeti:",
    // X oEmbed is embed-shaped, not article-shaped: it also cuts long single posts, not just threads.
    truncated: "A poszt beágyazott formájában került be: szál, képek és a hosszú poszt vége nélkül.",
    clipped: "A forrás túl hosszú volt, az eleje került be.",
    original: "Eredeti forrás",
    min: "perc",
  },
  en: {
    noarchive: "Our own notes — the original:",
    failed: "The content could not be mirrored — the original:",
    truncated: "Captured in its embed form: no thread, images or the end of a long post.",
    clipped: "The source was too long; the beginning was kept.",
    original: "Original source",
    min: "min",
  },
};

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ text?: string; hidden?: string; t?: string; edit?: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/library/${id}`);
  const query = await searchParams;
  const language = await getLanguage();
  const postId = parseId(id);
  const post = postId ? await getPost(await createClient(), postId) : null;
  if (!post) notFound();

  const t = notices[language];
  const canEdit = post.submittedBy === viewer.id;
  const showingTranslation = query.text === "hu" && Boolean(post.blocksHu);
  const blocks = showingTranslation ? post.blocksHu! : post.blocks;
  const minutes = Math.max(1, Math.round(plainText(post.blocks).split(/\s+/).length / 220));
  const start = Number.parseInt(query.t ?? "", 10);

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHeader backHref="/library" backLabel="LIBRARY">
        <LanguageToggle language={language} />
      </PageHeader>

      <article className="bg-cream text-ink">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-16">
          <header className="border-b-2 border-ink pb-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[0.15em] text-signal">
              <span className="border border-signal px-2 py-0.5">{kindLabel[post.kind]}</span>
              <span>{post.siteName ?? hostOf(post.url)}</span>
              {post.author && <span className="text-ink/60">{post.author}</span>}
              {post.publishedAt && <span className="text-ink/60">{post.publishedAt}</span>}
              <span className="text-ink/60">{minutes} {t.min}</span>
            </p>
            <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] [overflow-wrap:anywhere]">{post.title[language]}</h1>
            {(post.meta.noarchive || post.meta.extractionFailed) && (
              <p className="mt-4 border-l-4 border-signal pl-4 text-sm">
                {post.meta.noarchive ? t.noarchive : t.failed}{" "}
                <a href={post.url} target="_blank" rel="noreferrer" className="text-signal underline [overflow-wrap:anywhere]">{post.url}</a>
              </p>
            )}
            {post.meta.truncated && <p className="mt-2 font-mono text-xs text-ink/60">{t.truncated}</p>}
            {post.meta.clipped && <p className="mt-2 font-mono text-xs text-ink/60">{t.clipped}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <PostToolbar postId={post.id} language={language} hasTranslation={Boolean(post.blocksHu)} showingTranslation={showingTranslation} canEdit={canEdit} />
              <Button asChild variant="ink" className="min-h-10">
                <a href={post.url} target="_blank" rel="noreferrer">{t.original} <ExternalLink /></a>
              </Button>
            </div>
          </header>

          <p className="mt-8 text-lg leading-8">{post.summary[language]}</p>
          {post.keyPoints[language].length > 0 && (
            <div className="mt-8 border-l-4 border-signal pl-5">
              <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{language === "hu" ? "KULCSPONTOK" : "KEY POINTS"}</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
                {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          )}

          {blocks.length > 0 && (
            <section className="mt-12">
              <PostBlocks
                blocks={blocks}
                language={language}
                hidden={post.hiddenBlocks}
                showHidden={query.hidden === "show"}
                videoStart={Number.isFinite(start) && start > 0 ? start : undefined}
              />
            </section>
          )}

          <p className="mt-12 border-t-2 border-ink pt-4 font-mono text-[10px] tracking-[0.15em] text-ink/55 [overflow-wrap:anywhere]">
            © {post.author ?? post.siteName ?? hostOf(post.url)} · {post.url}
          </p>
        </div>
      </article>
    </main>
  );
}
