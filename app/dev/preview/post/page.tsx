import { notFound } from "next/navigation";
import { MarkPostRead } from "@/app/(app)/library/[id]/mark-post-read";
import { PostArticle } from "@/app/(app)/library/[id]/post-article";
import { AppShell } from "@/app/components/app-shell";
import { previewEmail, previewPosts } from "@/lib/fixtures";
import { getLanguage, getNavMode } from "@/lib/language";
import type { PostQuery } from "@/lib/post-view";
import { PreviewNav } from "../preview-nav";

/** Every block type and all four banners, one fixture post after the other, sharing the one query
 *  string — like the real post page (app/(app)/library/[id]/page.tsx), so ?hidden=show, ?t=, ?text=hu
 *  and ?edit=1 all work here too (canEdit is still false, so ?edit=1 never shows the editor). */
export default async function PreviewPostPage({ searchParams }: { searchParams: Promise<PostQuery> }) {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [query, language, navMode] = await Promise.all([searchParams, getLanguage(), getNavMode()]);
  return (
    <AppShell language={language} email={previewEmail} initialNavMode={navMode}>
      <PreviewNav current="post" failWrites={false} />
      <main className="min-h-dvh bg-ink">
        {previewPosts.map((post) => (
          <PostArticle key={post.id} post={post} language={language} query={query} canEdit={false} />
        ))}
        {/* Like the real post page, so Back to the preview's Library shows the cards dimmed; nothing is sent. */}
        {previewPosts.map((post) => (
          <MarkPostRead key={post.id} postId={post.id} preview />
        ))}
      </main>
    </AppShell>
  );
}
