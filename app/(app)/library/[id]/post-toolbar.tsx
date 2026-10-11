"use client";

import Link from "next/link";
import { useState } from "react";
import { Languages, PenLine } from "lucide-react";
import { ErrorLine } from "@/app/components/error-line";
import { useRefresh } from "@/app/components/refresh-bar";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";

const copy = {
  hu: { original: "Eredeti", translated: "Magyarul", translate: "Fordítás magyarra", working: "Fordítás…", failed: "A fordítás nem sikerült, próbáld újra.", edit: "Szerkesztés", group: "Szöveg nyelve" },
  en: { original: "Original", translated: "Hungarian", translate: "Translate to Hungarian", working: "Translating…", failed: "Translation failed, try again.", edit: "Edit", group: "Text language" },
};

export function PostToolbar({ postId, language, hasTranslation, showingTranslation, canEdit, hasTranslatable }: {
  postId: number;
  language: Language;
  hasTranslation: boolean;
  showingTranslation: boolean;
  canEdit: boolean;
  /** No translatable text (extraction failed / a bare video / an all-code or all-repo post) — nothing to translate. */
  hasTranslatable: boolean;
}) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = copy[language];

  function translate() {
    setBusy(true);
    setFailed(false);
    refresh(`/library/${postId}?text=hu`, async () => {
      const response = await fetch(`/api/posts/${postId}/translate`, { method: "POST" }).catch(() => null);
      setBusy(false);
      setFailed(!response?.ok);
      return Boolean(response?.ok);
    });
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
      ) : hasTranslatable ? (
        <Button variant="brutal" className="min-h-10" onClick={translate} disabled={busy}>
          <Languages /> {busy ? t.working : t.translate}
        </Button>
      ) : null}
      {canEdit && (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}?edit=1`}><PenLine /> {t.edit}</Link>
        </Button>
      )}
      {/* Always mounted, so the live region exists before the first failure — only its text changes. */}
      <ErrorLine>{failed ? t.failed : null}</ErrorLine>
    </div>
  );
}
