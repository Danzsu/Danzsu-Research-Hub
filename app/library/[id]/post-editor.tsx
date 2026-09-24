"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/data/digest-types";
import type { Post } from "@/lib/content";
import { SUMMARY_MAX, TITLE_MAX } from "@/lib/overrides";
import { editPayload } from "@/lib/post-edit";
import type { PostQuery } from "@/lib/post-view";

const copy = {
  hu: {
    title: "Cím",
    summary: "Összefoglaló",
    original: "Eredeti",
    resetTitle: (lang: string) => `Eredeti cím (${lang})`,
    resetSummary: (lang: string) => `Eredeti összefoglaló (${lang})`,
    save: "Mentés",
    cancel: "Mégse",
    saving: "Mentés…",
    reextract: "Újrakinyerés",
    started: "Az újrakinyerés elindult, pár perc múlva frissül.",
    cooldown: (s: number) => `Újrakinyerés ${Math.ceil(s / 60)} perc múlva lehetséges.`,
    failed: "Nem sikerült, próbáld újra.",
    invalid: "A cím vagy az összefoglaló érvénytelen vagy túl hosszú.",
    toggleHidden: "Blokk elrejtése",
  },
  en: {
    title: "Title",
    summary: "Summary",
    original: "Original",
    resetTitle: (lang: string) => `Original title (${lang})`,
    resetSummary: (lang: string) => `Original summary (${lang})`,
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    reextract: "Re-extract",
    started: "Re-extraction started; the post updates in a few minutes.",
    cooldown: (s: number) => `Re-extraction possible in ${Math.ceil(s / 60)} min.`,
    failed: "That failed, try again.",
    invalid: "The title or summary is invalid or too long.",
    toggleHidden: "Hide block",
  },
};

export function PostEditor({ post, language, query, videoStart }: { post: Post; language: Language; query: PostQuery; videoStart?: number }) {
  const router = useRouter();
  const t = copy[language];
  const fieldId = useId();
  const titleId = (lang: "hu" | "en") => `${fieldId}-title-${lang}`;
  const summaryId = (lang: "hu" | "en") => `${fieldId}-summary-${lang}`;
  const [title, setTitle] = useState(post.title);
  const [summary, setSummary] = useState(post.summary);
  const [hidden, setHidden] = useState(() => new Set(post.hiddenBlocks));
  const [busy, setBusy] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  const toggle = (id: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editPayload(post, { title, summary }, [...hidden])),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setStatus({ text: response?.status === 400 ? t.invalid : t.failed, failed: true });
    router.push(`/library/${post.id}`);
    router.refresh();
  }

  async function reextract() {
    setReextracting(true);
    const response = await fetch(`/api/posts/${post.id}/reextract`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { retryAfter?: number };
    setReextracting(false);
    if (response?.status === 429 && data.retryAfter) setStatus({ text: t.cooldown(data.retryAfter), failed: false });
    else if (response?.ok) setStatus({ text: t.started, failed: false });
    else setStatus({ text: t.failed, failed: true });
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 border-2 border-ink bg-paper p-5 sm:grid-cols-2">
        {(["hu", "en"] as const).map((lang) => (
          <div key={lang} className="space-y-3">
            <div className="space-y-1 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={titleId(lang)}>{t.title} ({lang.toUpperCase()})</label>
                <Button
                  type="button"
                  variant="brutal"
                  size="xs"
                  className="min-h-10"
                  aria-label={t.resetTitle(lang.toUpperCase())}
                  onClick={() => setTitle({ ...title, [lang]: post.generatedTitle[lang] })}
                >
                  {t.original}
                </Button>
              </div>
              <Input
                id={titleId(lang)}
                value={title[lang]}
                onChange={(e) => setTitle({ ...title, [lang]: e.target.value })}
                className="min-h-10 border-2 border-ink bg-paper"
                required
                maxLength={TITLE_MAX}
                lang={lang}
              />
            </div>
            <div className="space-y-1 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={summaryId(lang)}>{t.summary} ({lang.toUpperCase()})</label>
                <Button
                  type="button"
                  variant="brutal"
                  size="xs"
                  className="min-h-10"
                  aria-label={t.resetSummary(lang.toUpperCase())}
                  onClick={() => setSummary({ ...summary, [lang]: post.generatedSummary[lang] })}
                >
                  {t.original}
                </Button>
              </div>
              <Textarea
                id={summaryId(lang)}
                value={summary[lang]}
                onChange={(e) => setSummary({ ...summary, [lang]: e.target.value })}
                rows={5}
                className="border-2 border-ink bg-paper"
                required
                maxLength={SUMMARY_MAX}
                lang={lang}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ink" className="min-h-10" onClick={() => void save()} disabled={busy}>{busy ? t.saving : t.save}</Button>
        <Button asChild variant="brutal" className="min-h-10"><Link href={`/library/${post.id}`}>{t.cancel}</Link></Button>
        <Button variant="brutal" className="min-h-10" onClick={() => void reextract()} disabled={reextracting}><RefreshCw /> {t.reextract}</Button>
        {/* Always mounted: a live region must already be in the accessibility tree before its text
            changes, or screen readers may not announce the change at all. */}
        <p role="status" className={`font-mono text-xs ${status?.failed ? "text-signal" : "text-ink/70"}`}>{status?.text ?? ""}</p>
      </div>
      <PostBlocks
        blocks={post.blocks}
        language={language}
        baseUrl={post.url}
        hidden={[...hidden]}
        videoStart={videoStart}
        linkQuery={query}
        controls={(block) => (
          <Button
            variant="brutal"
            size="icon-lg"
            onClick={() => toggle(block.id)}
            aria-label={t.toggleHidden}
            aria-pressed={hidden.has(block.id)}
            className="absolute top-0 right-0"
          >
            {hidden.has(block.id) ? <Eye /> : <EyeOff />}
          </Button>
        )}
      />
    </div>
  );
}
