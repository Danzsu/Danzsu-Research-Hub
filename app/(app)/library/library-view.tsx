import Link from "next/link";
import { BookOpen, FileText, FlaskConical, GitFork, MessageSquareQuote, PlayCircle } from "lucide-react";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { Tag } from "@/app/components/tag";
import type { SubmittedSource } from "@/lib/content";
import { hostOf } from "@/lib/pipeline/util";
import type { Post } from "@/lib/post-view";
import { SubmitForm } from "./submit-form";

const kindIcons = { article: FileText, youtube: PlayCircle, arxiv: FlaskConical, github: GitFork, x: MessageSquareQuote, pdf: FileText } as const;

// Server-rendered with both languages; LocalizedText picks one on the client, so the toggle needs no refresh here.
const copy = {
  lead: {
    hu: "Dobj be egy cikket, YouTube-videót, arXiv-tanulmányt, PDF-et, GitHub-repót vagy X-posztot: az AI összefoglalja, a szövegét pedig elmenti ide, hogy a link halála után is megmaradjon.",
    en: "Drop in an article, a YouTube video, an arXiv paper, a PDF, a GitHub repo or an X post: the AI summarizes it and keeps a copy of its text, so it outlives the original link.",
  },
  failed: { hu: "HIBA", en: "FAILED" },
  processing: { hu: "FELDOLGOZÁS…", en: "PROCESSING…" },
  empty: { hu: "Még üres a könyvtár.", en: "The library is empty." },
  mirrored: { hu: "TÜKRÖZVE", en: "MIRRORED" },
};

/** The Library page body; the offline preview renders it with fixtures. */
export function LibraryView({ posts, open }: { posts: Post[]; open: SubmittedSource[] }) {
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="MIRRORED SOURCES / KÖNYVTÁR" title="LIBRARY" lead={<LocalizedText value={copy.lead} />} aside={<SubmitForm />} />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-10">
        {open.length > 0 && (
          <div className="mb-8 space-y-2 font-mono text-xs">
            {open.map((source) => (
              <p key={source.id} className="flex flex-wrap gap-3 border border-paper/20 px-4 py-3">
                <span className={source.status === "failed" ? "text-signal" : "text-cyan"}>
                  <LocalizedText value={source.status === "failed" ? copy.failed : copy.processing} />
                </span>
                <span className="min-w-0 flex-1 truncate text-paper/70">{source.url}</span>
                {source.error && <span className="w-full break-words text-paper/45">{source.error}</span>}
              </p>
            ))}
          </div>
        )}

        {!posts.length && (
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />
          </p>
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
                <h2 className="mt-2 font-display text-2xl leading-[1.02] [overflow-wrap:anywhere] sm:text-3xl">
                  <LocalizedText value={post.title} />
                </h2>
                <p className="mt-4 line-clamp-3 text-base leading-6 opacity-65">
                  <LocalizedText value={post.summary} />
                </p>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-current/20 pt-4">
                  {post.tags.map((tag) => (
                    <Tag key={tag} tag={tag} />
                  ))}
                  {post.meta.mirrored && (
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] opacity-60">
                      <BookOpen className="size-3" /> <LocalizedText value={copy.mirrored} />
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
