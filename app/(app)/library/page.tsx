import { redirect } from "next/navigation";
import { getOpenSources, getPosts } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/library");
  const [posts, open] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db)]);
  return <LibraryView posts={posts} open={open} />;
}
