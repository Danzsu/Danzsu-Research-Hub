import { redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getDaily, getRatings, getReaderSeed } from "@/lib/content";
import { radarTargets } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The latest day's Top 10 with its briefs (daily news spec N7). */
export default async function DailyPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/daily");
  const daily = await getDaily(reader.db);
  // After getDaily: both need its answer (the items' week, the items).
  const [seed, ratings] = await Promise.all([getReaderSeed(reader.db, daily.issue.id), getRatings(reader.db, radarTargets(daily.items, []))]);
  return (
    <DigestDashboard
      issue={daily.issue}
      items={daily.items}
      githubTop10={[]}
      scope="daily"
      daily={{ today: daily.today, briefs: daily.briefs }}
      seed={seed}
      posts={daily.posts}
      ratings={ratings}
    />
  );
}
