import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();

  const [radar, language] = await Promise.all([getRadar(await createClient(), week), getLanguage()]);
  if (!radar) notFound();

  return <DigestDashboard email={viewer.email} initialLanguage={language} archived {...radar} />;
}
