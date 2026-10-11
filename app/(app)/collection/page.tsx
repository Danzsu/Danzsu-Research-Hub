import { redirect } from "next/navigation";
import { getFavorites } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { CollectionView, KINDS } from "./collection-view";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/collection");
  const { kind } = await searchParams;
  return <CollectionView favorites={await getFavorites(reader.db)} kind={KINDS.find((known) => known === kind)} />;
}
