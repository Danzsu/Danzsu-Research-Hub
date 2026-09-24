"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Languages, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";

const copy = {
  hu: { original: "Eredeti", translated: "Magyarul", translate: "Fordítás magyarra", working: "Fordítás…", failed: "A fordítás nem sikerült, próbáld újra.", edit: "Szerkesztés", group: "Szöveg nyelve" },
  en: { original: "Original", translated: "Hungarian", translate: "Translate to Hungarian", working: "Translating…", failed: "Translation failed, try again.", edit: "Edit", group: "Text language" },
};

export function PostToolbar({ postId, language, hasTranslation, showingTranslation, canEdit, hasBlocks }: {
  postId: number;
  language: Language;
  hasTranslation: boolean;
  showingTranslation: boolean;
  canEdit: boolean;
  /** No body text yet (extraction failed / a bare video) — nothing to translate. */
  hasBlocks: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = copy[language];

  async function translate() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/posts/${postId}/translate`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      router.push(`/library/${postId}?text=hu`);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasTranslation ? (
        <div className="flex" role="group" aria-label={t.group}>
          <Button asChild variant={showingTranslation ? "brutal" : "ink"} className="min-h-10">
            <Link href={`/library/${postId}`} aria-current={!showingTranslation}>{t.original}</Link>
          </Button>
          <Button asChild variant={showingTranslation ? "ink" : "brutal"} className="-ml-0.5 min-h-10">
            <Link href={`/library/${postId}?text=hu`} aria-current={showingTranslation}>{t.translated}</Link>
          </Button>
        </div>
      ) : hasBlocks ? (
        <Button variant="brutal" className="min-h-10" onClick={() => void translate()} disabled={busy}>
          <Languages /> {busy ? t.working : t.translate}
        </Button>
      ) : null}
      {canEdit && (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}?edit=1`}><PenLine /> {t.edit}</Link>
        </Button>
      )}
      <p role="status" className="font-mono text-xs text-signal empty:hidden">{failed ? t.failed : ""}</p>
    </div>
  );
}
