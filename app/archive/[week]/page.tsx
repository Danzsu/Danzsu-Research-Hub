import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();

  const [radar, language] = await Promise.all([getRadar(reader.db, week), getLanguage()]);
  if (!radar) notFound();

  return <DigestDashboard email={reader.viewer.email} initialLanguage={language} archived {...radar} />;
}
