import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { archivedWeek, getRatings, getReaderSeed } from "@/lib/content";
import { readHerePosts } from "@/lib/my-sources";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { radarTargets } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();
  const [radar, seed] = await Promise.all([archivedWeek(reader, week), getReaderSeed(reader.db, week)]);
  if (!radar) notFound();
  // After the week, not beside it: both lookups need its items. Never cached, unlike a closed week itself.
  const [posts, ratings] = await Promise.all([readHerePosts(reader.db, radar.items), getRatings(reader.db, radarTargets(radar.items, radar.githubTop10))]);
  return <DigestDashboard archived {...radar} seed={seed} posts={posts} ratings={ratings} />;
}
