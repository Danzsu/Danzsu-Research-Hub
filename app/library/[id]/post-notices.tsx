import type { Language } from "@/data/digest-types";
import type { Post } from "@/lib/post-view";

export const notices = {
  hu: {
    noarchive: "Saját összefoglaló — az eredeti:",
    failed: "A tartalmat nem sikerült átmenteni — az eredeti:",
    lastError: "Az utolsó újrakinyerés nem sikerült, a poszt a korábbi állapotában maradt. A hiba:",
    // X oEmbed is embed-shaped, not article-shaped: it also cuts long single posts, not just threads.
    truncated: "A poszt beágyazott formájában került be: szál, képek és a hosszú poszt vége nélkül.",
    clipped: "A forrás túl hosszú volt, az eleje került be.",
    original: "Eredeti forrás",
    min: "perc",
  },
  en: {
    noarchive: "Our own notes — the original:",
    failed: "The content could not be mirrored — the original:",
    lastError: "The last re-extraction failed; the post stays as it was. The error:",
    truncated: "Captured in its embed form: no thread, images or the end of a long post.",
    clipped: "The source was too long; the beginning was kept.",
    original: "Original source",
    min: "min",
  },
};

const banner = "mt-4 border-l-4 border-signal pl-4 text-sm";

/** The notices under the post's title. The last extraction error is for the submitter only: they can re-extract. */
export function PostNotices({ post, language, originalHref, canEdit }: {
  post: Post;
  language: Language;
  originalHref: string | undefined;
  canEdit: boolean;
}) {
  const t = notices[language];
  return (
    <>
      {(post.meta.noarchive || post.meta.extractionFailed) && (
        <p className={banner}>
          {post.meta.noarchive ? t.noarchive : t.failed}{" "}
          {originalHref ? (
            <a href={originalHref} target="_blank" rel="noreferrer" className="focus-ring text-signal underline [overflow-wrap:anywhere]">{post.url}</a>
          ) : (
            <span className="[overflow-wrap:anywhere]">{post.url}</span>
          )}
        </p>
      )}
      {canEdit && post.lastError && (
        <p className={banner}>
          {t.lastError} <span className="font-mono text-xs [overflow-wrap:anywhere]">{post.lastError}</span>
        </p>
      )}
      {post.meta.truncated && <p className="mt-2 font-mono text-xs text-ink/60">{t.truncated}</p>}
      {post.meta.clipped && <p className="mt-2 font-mono text-xs text-ink/60">{t.clipped}</p>}
    </>
  );
}
