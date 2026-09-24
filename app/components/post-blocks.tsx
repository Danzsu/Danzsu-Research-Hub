import type { ReactNode } from "react";
import type { Language } from "@/data/digest-types";
import type { Block, ImageBlock, Inline } from "@/lib/blocks";
import { mediaUrl } from "@/lib/media";
import { formatTimestamp } from "@/lib/pipeline/util";

// Plain component (no hooks, no server-only imports) so the editor can reuse it client-side.

const labels = {
  hu: { hidden: (n: number) => `${n} elrejtett blokk — megjelenítés`, missing: "A kép nem érhető el", chapters: "Fejezetek", stars: "csillag" },
  en: { hidden: (n: number) => `${n} hidden block${n > 1 ? "s" : ""} — show`, missing: "Image unavailable", chapters: "Chapters", stars: "stars" },
};

function InlineContent({ spans }: { spans: Inline[] }) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text;
    if (span.code) node = <code className="bg-ink/10 px-1 font-mono text-[0.9em]">{node}</code>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    if (span.href) {
      node = (
        <a href={span.href} target="_blank" rel="noreferrer" className="text-signal underline underline-offset-2 hover:text-ink">
          {node}
        </a>
      );
    }
    return <span key={index}>{node}</span>;
  });
}

function ImageView({ block, priority, language }: { block: ImageBlock; priority: boolean; language: Language }) {
  if (!block.path || !block.format || !block.widths?.length) {
    return (
      <p className="border-2 border-dashed border-ink/35 p-4 font-mono text-xs text-ink/60">
        {labels[language].missing}:{" "}
        <a href={block.originalUrl} target="_blank" rel="noreferrer" className="text-signal underline [overflow-wrap:anywhere]">
          {block.originalUrl}
        </a>
      </p>
    );
  }
  const largest = Math.max(...block.widths);
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-encoded; next/image would re-optimize them */}
      <img
        src={mediaUrl(block.path, largest, block.format)}
        srcSet={block.widths.map((w) => `${mediaUrl(block.path!, w, block.format!)} ${w}w`).join(", ")}
        sizes="(min-width: 768px) 680px, 100vw"
        alt={block.alt}
        width={block.width}
        height={block.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="h-auto w-full border-2 border-ink bg-cream bg-cover"
        style={block.placeholder ? { backgroundImage: `url(${block.placeholder})` } : undefined}
      />
      {block.caption && <figcaption className="mt-2 font-mono text-xs leading-5 text-ink/60">{block.caption}</figcaption>}
    </figure>
  );
}

function BlockView({ block, priority, videoStart, language }: { block: Block; priority: boolean; videoStart?: number; language: Language }) {
  switch (block.type) {
    case "heading": {
      const size = { 2: "text-3xl", 3: "text-2xl", 4: "text-xl" }[block.level];
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      return <Tag className={`mt-10 font-display ${size} leading-[1.05] tracking-tight [overflow-wrap:anywhere]`}>{block.text}</Tag>;
    }
    case "paragraph":
      return <p className="[overflow-wrap:anywhere]"><InlineContent spans={block.content} /></p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6 [overflow-wrap:anywhere]`}>
          {block.items.map((item, index) => <li key={index}><InlineContent spans={item} /></li>)}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 border-signal pl-5 text-ink/80 [overflow-wrap:anywhere]">
          <InlineContent spans={block.content} />
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
      return <ImageView block={block} priority={priority} language={language} />;
    case "video": {
      const src = block.provider === "youtube"
        ? `https://www.youtube-nocookie.com/embed/${block.videoId}${videoStart ? `?start=${videoStart}&autoplay=1` : ""}`
        : `https://player.vimeo.com/video/${block.videoId}${videoStart ? `#t=${videoStart}s` : ""}`;
      return (
        <div id="video" className="aspect-video scroll-mt-24 border-2 border-ink">
          <iframe src={src} title="Video" allow="encrypted-media; picture-in-picture; autoplay" allowFullScreen className="size-full" />
        </div>
      );
    }
    case "chapters":
      return (
        <nav aria-label={labels[language].chapters} className="border-2 border-ink bg-paper p-4">
          <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{labels[language].chapters.toUpperCase()}</p>
          <ol className="mt-2 space-y-1">
            {block.items.map((chapter) => (
              <li key={chapter.seconds}>
                <a href={`?t=${chapter.seconds}#video`} className="flex min-h-10 items-center gap-3 font-mono text-sm hover:text-signal sm:min-h-0">
                  <span className="w-16 shrink-0 text-signal">{formatTimestamp(chapter.seconds)}</span>
                  <span>{chapter.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      );
    case "repo":
      return (
        <a href={block.url} target="_blank" rel="noreferrer" className="block border-2 border-ink bg-paper p-5 shadow-[5px_5px_0_var(--ink)] transition hover:shadow-[8px_8px_0_var(--signal)]">
          <p className="font-mono text-sm font-bold [overflow-wrap:anywhere]">{block.fullName}</p>
          <p className="mt-2 font-mono text-xs text-ink/60">
            ★ {block.stars.toLocaleString("hu-HU")} {labels[language].stars}
            {block.language && ` · ${block.language}`}
            {block.license && ` · ${block.license}`}
          </p>
          {block.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.topics.slice(0, 8).map((topic) => <span key={topic} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{topic}</span>)}
            </div>
          )}
        </a>
      );
    case "divider":
      return <hr className="border-t-2 border-ink" />;
  }
}

export function PostBlocks({
  blocks,
  language,
  hidden = [],
  showHidden = false,
  videoStart,
  controls,
}: {
  blocks: Block[];
  language: Language;
  hidden?: string[];
  showHidden?: boolean;
  videoStart?: number;
  /** Edit mode: rendered beside every block, and hidden blocks stay visible (dimmed). */
  controls?: (block: Block) => ReactNode;
}) {
  const hiddenSet = new Set(hidden);
  const out: ReactNode[] = [];
  let run = 0;
  let firstImage = true;
  const flushHidden = (key: string) => {
    if (!run) return;
    out.push(
      <a key={`hidden-${key}`} href="?hidden=show" className="block border border-dashed border-ink/35 px-4 py-2 font-mono text-xs text-ink/55 hover:text-signal">
        {labels[language].hidden(run)}
      </a>,
    );
    run = 0;
  };
  for (const block of blocks) {
    const isHidden = hiddenSet.has(block.id);
    if (isHidden && !showHidden && !controls) {
      run++;
      continue;
    }
    flushHidden(block.id);
    const priority = block.type === "image" && firstImage;
    if (block.type === "image") firstImage = false;
    out.push(
      <div key={block.id} id={`b-${block.id}`} data-block-id={block.id} className={`scroll-mt-24 ${controls ? "relative pr-12" : ""} ${isHidden ? "opacity-40" : ""}`}>
        {controls?.(block)}
        <BlockView block={block} priority={priority} videoStart={videoStart} language={language} />
      </div>,
    );
  }
  flushHidden("end");
  return <div className="space-y-5 text-[17px] leading-[1.7]">{out}</div>;
}
