import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reader = await getReader();
  if (!reader) redirect("/login");

  const [radar, language] = await Promise.all([getRadar(reader.db), getLanguage()]);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  return <DigestDashboard email={reader.viewer.email} initialLanguage={language} {...radar} />;
}
