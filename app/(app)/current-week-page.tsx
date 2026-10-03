import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar, getRatings, getReaderSeed } from "@/lib/content";
import { readHerePosts } from "@/lib/my-sources";
import { radarTargets } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";

/** The current week, for `/` and, with `scope`, for /companies. Each page still declares force-dynamic itself. */
export async function CurrentWeekPage({ path, scope }: { path: string; scope?: "companies" }) {
  const reader = await getReader();
  if (!reader) redirect(`/login?next=${path}`);
  const radar = await getRadar(reader.db);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  // After the Radar, not beside it: both need its answer (the week's id, its items). Beside each other.
  const [seed, posts, ratings] = await Promise.all([
    getReaderSeed(reader.db, radar.issue.id),
    readHerePosts(reader.db, radar.items),
    getRatings(reader.db, radarTargets(radar.items, radar.githubTop10)),
  ]);
  return <DigestDashboard {...radar} scope={scope} seed={seed} posts={posts} ratings={ratings} />;
}
