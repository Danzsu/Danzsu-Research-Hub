import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar, getReaderSeed } from "@/lib/content";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();
  const [radar, seed] = await Promise.all([getRadar(reader.db, week), getReaderSeed(reader.db, week)]);
  if (!radar) notFound();
  return <DigestDashboard archived {...radar} seed={seed} />;
}
