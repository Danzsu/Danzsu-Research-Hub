"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { RatingControl } from "@/app/components/rating-control";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import type { RatingValue } from "@/lib/ratings";

const copy = {
  hu: { edit: "Szerkesztés" },
  en: { edit: "Edit" },
};

export function PostToolbar({ postId, language, canEdit, rating }: {
  postId: number;
  language: Language;
  canEdit: boolean;
  /** The reader's rating of the post, from the page's render (getRatings). */
  rating: RatingValue | null;
}) {
  const t = copy[language];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RatingControl target={{ kind: "post", id: String(postId) }} initial={rating} />
      {canEdit && (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}?edit=1`}><PenLine /> {t.edit}</Link>
        </Button>
      )}
    </div>
  );
}
