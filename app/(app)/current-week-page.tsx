import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar, getReaderSeed } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";

/** The current week, for `/` and, with `scope`, for /companies. Each page still declares force-dynamic itself. */
export async function CurrentWeekPage({ path, scope }: { path: string; scope?: "companies" }) {
  const reader = await getReader();
  if (!reader) redirect(`/login?next=${path}`);
  const radar = await getRadar(reader.db);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  // After the Radar, not beside it: the latest week's id comes from its answer.
  return <DigestDashboard {...radar} scope={scope} seed={await getReaderSeed(reader.db, radar.issue.id)} />;
}
