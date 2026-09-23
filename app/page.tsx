import { redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { createClient, getViewer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const radar = await getRadar(await createClient());
  return <DigestDashboard email={viewer.email} {...radar} />;
}
