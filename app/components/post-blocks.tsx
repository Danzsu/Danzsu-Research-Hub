import type { ReactNode } from "react";
import type { Language } from "@/data/digest-types";
import { safeHref, type Block, type ImageBlock, type Inline } from "@/lib/blocks";
import { isBlockVisible, isValidPlaceholder, mediaSources, primaryVideoId, videoEmbedSrc, withQuery, type PostQuery } from "@/lib/post-view";
import { formatTimestamp } from "@/lib/pipeline/util";

// Plain component (no hooks, no server-only imports) so the editor can reuse it client-side.

const labels = {
  hu: { hidden: (n: number) => `${n} elrejtett blokk — megjelenítés`, missing: "A kép nem érhető el", chapters: "Fejezetek", stars: "csillag", video: "Videó" },
  en: { hidden: (n: number) => `${n} hidden block${n > 1 ? "s" : ""} — show`, missing: "Image unavailable", chapters: "Chapters", stars: "stars", video: "Video" },
};

const numberLocale = (language: Language) => (language === "hu" ? "hu-HU" : "en-US");

function InlineContent({ spans, baseUrl }: { spans: Inline[]; baseUrl: string }) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text;
    if (span.code) node = <code className="bg-ink/10 px-1 font-mono text-[0.9em]">{node}</code>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    const href = safeHref(span.href, baseUrl);
    if (href) {
      node = (
        <a href={href} target="_blank" rel="noreferrer" className="focus-ring text-signal underline underline-offset-2 hover:text-ink">
          {node}
        </a>
      );
    }
    return <span key={index}>{node}</span>;
  });
}

function ImageView({ block, priority, language, baseUrl }: { block: ImageBlock; priority: boolean; language: Language; baseUrl: string }) {
  const sources = mediaSources(block);
  if (!sources) {
    const href = safeHref(block.originalUrl, baseUrl);
    return (
      <p className="border-2 border-dashed border-ink/35 p-4 font-mono text-xs text-ink/60">
        {labels[language].missing}:{" "}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="focus-ring text-signal underline">
            {block.originalUrl}
          </a>
        ) : (
          block.originalUrl
        )}
      </p>
    );
  }
  const placeholder = block.placeholder && isValidPlaceholder(block.placeholder) ? block.placeholder : undefined;
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-encoded; next/image would re-optimize them */}
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        sizes="(min-width: 768px) 680px, 100vw"
        alt={block.alt}
        width={block.width}
        height={block.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="h-auto max-w-full border-2 border-ink bg-cream bg-cover"
        style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
      />
      {block.caption && <figcaption className="mt-2 font-mono text-xs leading-5 text-ink/60">{block.caption}</figcaption>}
    </figure>
  );
}

function BlockView({
  block,
  priority,
  primaryVideo,
  videoStart,
  language,
  baseUrl,
  linkQuery,
}: {
  block: Block;
  priority: boolean;
  primaryVideo: boolean;
  videoStart?: number;
  language: Language;
  baseUrl: string;
  linkQuery: PostQuery;
}) {
  switch (block.type) {
    case "heading": {
      const size = { 2: "text-2xl sm:text-3xl", 3: "text-xl sm:text-2xl", 4: "text-lg sm:text-xl" }[block.level];
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      return <Tag className={`mt-10 font-display ${size} leading-[1.05] tracking-tight`}>{block.text}</Tag>;
    }
    case "paragraph":
      return <p><InlineContent spans={block.content} baseUrl={baseUrl} /></p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6`}>
          {block.items.map((item, index) => <li key={index}><InlineContent spans={item} baseUrl={baseUrl} /></li>)}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 border-signal pl-5 text-ink/80">
          <InlineContent spans={block.content} baseUrl={baseUrl} />
        </blockquote>
      );
    case "code":
      return (
        <div className="border-2 border-ink bg-ink text-paper">
          {block.language && <p className="border-b border-paper/15 px-4 py-1 font-mono text-[10px] tracking-[0.15em] text-paper/50">{block.language.toUpperCase()}</p>}
          <pre className="overflow-x-auto p-4 font-mono text-sm leading-6"><code>{block.code}</code></pre>
        </div>
      );
    case "image":
      return <ImageView block={block} priority={priority} language={language} baseUrl={baseUrl} />;
    case "video": {
      // Only the primary video (the one chapters/`?t=` link to) gets the #video anchor, the
      // ?t= override and autoplay; other video blocks on the same page just play from their own default.
      const src = primaryVideo
        ? videoEmbedSrc(block, { start: videoStart ?? block.start, autoplay: Boolean(videoStart) })
        : videoEmbedSrc(block);
      if (!src) return null;
      return (
        <div id={primaryVideo ? "video" : undefined} className="aspect-video scroll-mt-24 border-2 border-ink">
          <iframe src={src} title={labels[language].video} allow="encrypted-media; picture-in-picture; autoplay" allowFullScreen loading="lazy" className="size-full" />
        </div>
      );
    }
    case "chapters":
      return (
        <nav aria-label={labels[language].chapters} className="border-2 border-ink bg-paper p-4">
          <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{labels[language].chapters.toUpperCase()}</p>
          <ol className="mt-2 space-y-1">
            {block.items.map((chapter, index) => (
              <li key={`${index}-${chapter.seconds}`}>
                <a
                  href={`${withQuery(linkQuery, { t: String(chapter.seconds) })}#video`}
                  className="focus-ring flex min-h-10 items-center gap-3 font-mono text-sm hover:text-signal"
                >
                  <span className="w-16 shrink-0 text-signal">{formatTimestamp(chapter.seconds)}</span>
                  <span>{chapter.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      );
    case "repo": {
      const href = safeHref(block.url, baseUrl);
      const content = (
        <>
          <p className="font-mono text-sm font-bold">{block.fullName}</p>
          <p className="mt-2 font-mono text-xs text-ink/60">
            ★ {block.stars.toLocaleString(numberLocale(language))} {labels[language].stars}
            {block.language && ` · ${block.language}`}
            {block.license && ` · ${block.license}`}
          </p>
          {block.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.topics.slice(0, 8).map((topic) => <span key={topic} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{topic}</span>)}
            </div>
          )}
        </>
      );
      const className = "block border-2 border-ink bg-paper p-5 shadow-[5px_5px_0_var(--ink)] transition hover:shadow-[8px_8px_0_var(--signal)]";
      return href ? (
        <a href={href} target="_blank" rel="noreferrer" className={`focus-ring ${className}`}>{content}</a>
      ) : (
        <div className={className}>{content}</div>
      );
    }
    case "divider":
      return <hr className="border-t-2 border-ink" />;
  }
}

export function PostBlocks({
  blocks,
  language,
  baseUrl,
  hidden = [],
  showHidden = false,
  videoStart,
  linkQuery = {},
  controls,
}: {
  blocks: Block[];
  language: Language;
  /** The post's own URL — the base against which every relative href in the blocks resolves. */
  baseUrl: string;
  hidden?: string[];
  showHidden?: boolean;
  videoStart?: number;
  /** The page's current query params, carried forward into chapter and "show hidden" links. */
  linkQuery?: PostQuery;
  /** Edit mode: rendered beside every block, and hidden blocks stay visible (dimmed). */
  controls?: (block: Block) => ReactNode;
}) {
  const hiddenSet = new Set(hidden);
  // Exactly the blocks that end up rendered below (a fully-hidden block is skipped via `continue`,
  // never pushed) — the same set primaryVideoId must pick its candidate from.
  const visibleBlocks = blocks.filter((block) => isBlockVisible(block.id, hiddenSet, showHidden, Boolean(controls)));
  const primaryId = primaryVideoId(visibleBlocks);
  const out: ReactNode[] = [];
  let run = 0;
  let firstImage = true;
  const flushHidden = (key: string) => {
    if (!run) return;
    out.push(
      <a
        key={`hidden-${key}`}
        // Drop `t`: revealing hidden blocks isn't a chapter jump, and keeping it would autoplay the video again.
        href={withQuery(linkQuery, { hidden: "show", t: undefined })}
        className="focus-ring flex min-h-10 items-center border border-dashed border-ink/35 px-4 font-mono text-xs text-ink/55 hover:text-signal"
      >
        {labels[language].hidden(run)}
      </a>,
    );
    run = 0;
  };
  for (const block of blocks) {
    const isHidden = hiddenSet.has(block.id);
    if (!isBlockVisible(block.id, hiddenSet, showHidden, Boolean(controls))) {
      run++;
      continue;
    }
    flushHidden(block.id);
    const priority = block.type === "image" && firstImage;
    if (block.type === "image") firstImage = false;
    const primaryVideo = block.type === "video" && block.id === primaryId;
    out.push(
      <div key={block.id} id={`b-${block.id}`} data-block-id={block.id} className={`scroll-mt-24 ${controls ? "relative pr-12 min-h-10" : ""}`}>
        {controls?.(block)}
        <div className={isHidden ? "opacity-40" : undefined}>
          <BlockView block={block} priority={priority} primaryVideo={primaryVideo} videoStart={videoStart} language={language} baseUrl={baseUrl} linkQuery={linkQuery} />
        </div>
      </div>,
    );
  }
  flushHidden("end");
  return <div className="space-y-5 text-[17px] leading-[1.7] [overflow-wrap:anywhere]">{out}</div>;
}
