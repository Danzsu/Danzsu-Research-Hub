import { notFound, redirect } from "next/navigation";
import { getPost, getRatings } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { parseId } from "@/lib/pipeline/util";
import type { PostQuery } from "@/lib/post-view";
import { getReader } from "@/lib/supabase/server";
import { RefreshWhileProcessing } from "../refresh-while-processing";
import { MarkPostRead } from "./mark-post-read";
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
  const ratings = await getRatings(reader.db, [{ kind: "post", id: String(post.id) }]);

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <MarkPostRead postId={post.id} />
      {/* A run on this post's source (a re-extraction): the page follows it until it is done (R2 spec 1). */}
      <RefreshWhileProcessing active={post.processing} />
      <PostArticle post={post} language={language} query={query} canEdit={post.submittedBy === reader.viewer.id} rating={ratings[`post:${post.id}`] ?? null} />
    </main>
  );
}
