import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { archivedWeek, getReaderSeed } from "@/lib/content";
import { readHerePosts } from "@/lib/my-sources";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();
  const [radar, seed] = await Promise.all([archivedWeek(reader, week), getReaderSeed(reader.db, week)]);
  if (!radar) notFound();
  // After the week, not beside it: the lookup needs its items. Never cached, unlike a closed week itself.
  const posts = await readHerePosts(reader.db, radar.items);
  return <DigestDashboard archived {...radar} seed={seed} posts={posts} />;
}
