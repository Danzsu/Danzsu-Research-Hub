import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reader = await getReader();
  if (!reader) redirect("/login");
  const radar = await getRadar(reader.db);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  return <DigestDashboard {...radar} />;
}
