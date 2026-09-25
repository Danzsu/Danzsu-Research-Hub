import { notFound } from "next/navigation";
import { PostArticle } from "@/app/(app)/library/[id]/post-article";
import { AppShell } from "@/app/components/app-shell";
import { previewEmail, previewPosts } from "@/lib/fixtures";
import { getLanguage, getNavMode } from "@/lib/language";
import { PreviewNav } from "../preview-nav";

/** Every block type and all four banners, one fixture post after the other. */
export default async function PreviewPostPage() {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [language, navMode] = await Promise.all([getLanguage(), getNavMode()]);
  return (
    <AppShell language={language} email={previewEmail} initialNavMode={navMode}>
      <PreviewNav current="post" />
      <main className="min-h-dvh bg-ink">
        {previewPosts.map((post) => (
          <PostArticle key={post.id} post={post} language={language} query={{}} canEdit={false} />
        ))}
      </main>
    </AppShell>
  );
}
