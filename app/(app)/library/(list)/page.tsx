import { redirect } from "next/navigation";
import { getOpenSources, getPosts, getRatings, getReadPostIds } from "@/lib/content";
import { postsDownLast } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";
import { LibraryView } from "../library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/library");
  const [posts, open, readIds] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db), getReadPostIds(reader.db)]);
  // After the list, not beside it: the lookup needs its ids. A 👎 post goes to the end (G1 spec 3).
  const ratings = await getRatings(reader.db, posts.map((post) => ({ kind: "post" as const, id: String(post.id) })));
  return <LibraryView posts={postsDownLast(posts, ratings)} open={open} readIds={readIds} ratings={ratings} />;
}
