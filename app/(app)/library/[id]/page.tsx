import { notFound, redirect } from "next/navigation";
import { getPost } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { parseId } from "@/lib/pipeline/util";
import type { PostQuery } from "@/lib/post-view";
import { getReader } from "@/lib/supabase/server";
import { PostArticle } from "./post-article";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PostQuery>;
}) {
  const { id } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/library/${id}`);
  const query = await searchParams;
  const language = await getLanguage();
  const postId = parseId(id);
  const post = postId ? await getPost(reader.db, postId) : null;
  if (!post) notFound();

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PostArticle post={post} language={language} query={query} canEdit={post.submittedBy === reader.viewer.id} />
    </main>
  );
}
