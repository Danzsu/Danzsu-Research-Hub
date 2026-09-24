"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/data/digest-types";
import type { Post } from "@/lib/content";

const copy = {
  hu: {
    title: "Cím",
    summary: "Összefoglaló",
    save: "Mentés",
    cancel: "Mégse",
    saving: "Mentés…",
    reextract: "Újrakinyerés",
    started: "Az újrakinyerés elindult, pár perc múlva frissül.",
    cooldown: (s: number) => `Újrakinyerés ${Math.ceil(s / 60)} perc múlva lehetséges.`,
    failed: "Nem sikerült, próbáld újra.",
    hide: "Elrejtés",
    show: "Megjelenítés",
  },
  en: {
    title: "Title",
    summary: "Summary",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    reextract: "Re-extract",
    started: "Re-extraction started; the post updates in a few minutes.",
    cooldown: (s: number) => `Re-extraction possible in ${Math.ceil(s / 60)} min.`,
    failed: "That failed, try again.",
    hide: "Hide",
    show: "Show",
  },
};

export function PostEditor({ post, language }: { post: Post; language: Language }) {
  const router = useRouter();
  const t = copy[language];
  const [title, setTitle] = useState(post.title);
  const [summary, setSummary] = useState(post.summary);
  const [hidden, setHidden] = useState(() => new Set(post.hiddenBlocks));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
      body: JSON.stringify({ title, summary, hidden: [...hidden] }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setStatus(t.failed);
    router.push(`/library/${post.id}`);
    router.refresh();
  }

  async function reextract() {
    const response = await fetch(`/api/posts/${post.id}/reextract`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { retryAfter?: number };
    if (response?.status === 429 && data.retryAfter) setStatus(t.cooldown(data.retryAfter));
    else setStatus(response?.ok ? t.started : t.failed);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 border-2 border-ink bg-paper p-5 sm:grid-cols-2">
        {(["hu", "en"] as const).map((lang) => (
          <div key={lang} className="space-y-3">
            <label className="block space-y-1 font-mono text-xs">
              <span>{t.title} ({lang.toUpperCase()})</span>
              <Input value={title[lang]} onChange={(e) => setTitle({ ...title, [lang]: e.target.value })} className="min-h-10 border-2 border-ink bg-paper" />
            </label>
            <label className="block space-y-1 font-mono text-xs">
              <span>{t.summary} ({lang.toUpperCase()})</span>
              <Textarea value={summary[lang]} onChange={(e) => setSummary({ ...summary, [lang]: e.target.value })} rows={5} className="border-2 border-ink bg-paper" />
            </label>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ink" className="min-h-10" onClick={() => void save()} disabled={busy}>{busy ? t.saving : t.save}</Button>
        <Button asChild variant="brutal" className="min-h-10"><Link href={`/library/${post.id}`}>{t.cancel}</Link></Button>
        <Button variant="brutal" className="min-h-10" onClick={() => void reextract()}><RefreshCw /> {t.reextract}</Button>
        {status && <p role="status" className="font-mono text-xs text-ink/70">{status}</p>}
      </div>
      <PostBlocks
        blocks={post.blocks}
        language={language}
        baseUrl={post.url}
        hidden={[...hidden]}
        controls={(block) => (
          <Button
            variant="brutal"
            size="icon-lg"
            onClick={() => toggle(block.id)}
            aria-label={hidden.has(block.id) ? t.show : t.hide}
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
