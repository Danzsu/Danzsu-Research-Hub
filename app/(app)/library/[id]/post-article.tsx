import { ExternalLink } from "lucide-react";
import { PostBlocks } from "@/app/components/post-blocks";
import { Tag } from "@/app/components/tag";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import { safeHref } from "@/lib/blocks";
import { hostOf } from "@/lib/pipeline/util";
import { readMinutes, type Post, type PostQuery } from "@/lib/post-view";
import { translatable } from "@/lib/translate";
import { PostEditor } from "./post-editor";
import { notices, PostNotices } from "./post-notices";
import { PostToolbar } from "./post-toolbar";

// Only the two strings the page used to hard-code; the rest of its text is `notices` (post-notices.tsx).
const copy = {
  hu: {
    keyPoints: "KULCSPONTOK",
    kind: { article: "CIKK", youtube: "VIDEÓ", arxiv: "TANULMÁNY", github: "REPO", x: "POSZT", pdf: "PDF" },
  },
  en: {
    keyPoints: "KEY POINTS",
    kind: { article: "ARTICLE", youtube: "VIDEO", arxiv: "PAPER", github: "REPO", x: "POST", pdf: "PDF" },
  },
};

/** The post page body. The offline preview (app/dev/preview) renders it with fixture posts. */
export function PostArticle({ post, language, query, canEdit }: { post: Post; language: Language; query: PostQuery; canEdit: boolean }) {
  const t = notices[language];
  const labels = copy[language];
  const showingTranslation = query.text === "hu" && Boolean(post.blocksHu);
  const blocks = showingTranslation ? post.blocksHu! : post.blocks;
  const minutes = readMinutes(post.blocks, post.kind);
  const start = Number.parseInt(query.t ?? "", 10);
  const videoStart = Number.isFinite(start) && start > 0 ? start : undefined;
  // post.url is already validated at ingest (parseSubmittedUrl), but every href the page emits
  // goes through safeHref anyway — this is the same choke point PostBlocks uses.
  const originalHref = safeHref(post.url, post.url);

  return (
    <article className="bg-cream text-ink">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-10 sm:py-16">
        <header className="border-b-2 border-ink pb-6">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[0.15em] text-signal">
            <span className="border border-signal px-2 py-0.5">{labels.kind[post.kind]}</span>
            <span>{post.siteName ?? hostOf(post.url)}</span>
            {post.author && <span className="text-ink/60">{post.author}</span>}
            {post.publishedAt && <span className="text-ink/60">{post.publishedAt}</span>}
            {minutes !== null && <span className="text-ink/60">{minutes} {t.min}</span>}
          </p>
          <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] [overflow-wrap:anywhere]">{post.title[language]}</h1>
          <PostNotices post={post} language={language} originalHref={originalHref} canEdit={canEdit} />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <PostToolbar
              postId={post.id}
              language={language}
              hasTranslation={Boolean(post.blocksHu)}
              showingTranslation={showingTranslation}
              canEdit={canEdit}
              hasTranslatable={translatable(post.blocks).length > 0}
            />
            {originalHref && (
              <Button asChild variant="ink" className="min-h-10">
                <a href={originalHref} target="_blank" rel="noreferrer">{t.original} <ExternalLink /></a>
              </Button>
            )}
          </div>
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => <Tag key={tag} tag={tag} />)}
            </div>
          )}
        </header>

        <p className="mt-8 max-w-[75ch] text-lg leading-8">{post.summary[language]}</p>
        {post.keyPoints[language].length > 0 && (
          <div className="mt-8 max-w-[75ch] border-l-4 border-signal pl-5">
            <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{labels.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
              {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        )}

        {query.edit === "1" && canEdit ? (
          <section className="mt-12">
            <PostEditor post={post} language={language} query={query} videoStart={videoStart} />
          </section>
        ) : (
          blocks.length > 0 && (
            <section className="mt-12" lang={showingTranslation ? "hu" : undefined}>
              <PostBlocks
                blocks={blocks}
                language={language}
                baseUrl={post.url}
                hidden={post.hiddenBlocks}
                showHidden={query.hidden === "show"}
                videoStart={videoStart}
                linkQuery={query}
              />
            </section>
          )
        )}

        <p className="mt-12 border-t-2 border-ink pt-4 font-mono text-[10px] tracking-[0.15em] text-ink/55 [overflow-wrap:anywhere]">
          © {post.author ?? post.siteName ?? hostOf(post.url)} · {post.url}
        </p>
      </div>
    </article>
  );
}
