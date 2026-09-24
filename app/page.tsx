import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const [radar, language] = await Promise.all([getRadar(await createClient()), getLanguage()]);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  return <DigestDashboard email={viewer.email} initialLanguage={language} {...radar} />;
}
