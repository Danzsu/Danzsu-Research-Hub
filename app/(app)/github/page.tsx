import { redirect } from "next/navigation";
import { getGithubRepos, githubPage } from "@/lib/content";
import { ratingFilter } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";
import { GithubView } from "./github-view";

export const dynamic = "force-dynamic";

export default async function GithubPage({ searchParams }: { searchParams: Promise<{ rating?: string; lang?: string; page?: string }> }) {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/github");
  const query = await searchParams;
  const filters = { rating: ratingFilter(query.rating), language: query.lang || undefined, page: githubPage(query.page) };
  return <GithubView {...await getGithubRepos(reader.db, filters)} filters={filters} />;
}
