import { redirect } from "next/navigation";
import { getOpenSources, getPosts, getReadPostIds } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/library");
  const [posts, open, readIds] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db), getReadPostIds(reader.db)]);
  return <LibraryView posts={posts} open={open} readIds={readIds} />;
}
