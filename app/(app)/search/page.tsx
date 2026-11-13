import { redirect } from "next/navigation";
import { normalizeQuery, searchAll } from "@/lib/search";
import { getReader } from "@/lib/supabase/server";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = normalizeQuery(q);
  const reader = await getReader();
  if (!reader) redirect(`/login?next=${encodeURIComponent(query ? `/search?q=${query}` : "/search")}`);
  return <SearchView query={query} hits={await searchAll(reader.db, query, 60)} />;
}
