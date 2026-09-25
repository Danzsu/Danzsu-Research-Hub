import { redirect } from "next/navigation";
import { getArchive } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { ArchiveView } from "./archive-view";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/archive");
  return <ArchiveView issues={await getArchive(reader.db)} />;
}
