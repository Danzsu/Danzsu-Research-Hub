import { notFound } from "next/navigation";
import { ArchiveView } from "@/app/(app)/archive/archive-view";
import { LibraryView } from "@/app/(app)/library/library-view";
import { AppShell } from "@/app/components/app-shell";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { previewArchive, previewEmail, previewGithub, previewIssue, previewItems, previewPosts, previewSources } from "@/lib/fixtures";
import { getLanguage, getNavMode } from "@/lib/language";
import { PREVIEW_VIEWS, PreviewNav, type PreviewView } from "./preview-nav";

// The real view components on fixtures: no Supabase keys, no network, no sign-in. Development only.

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [{ view: requested }, language, navMode] = await Promise.all([searchParams, getLanguage(), getNavMode()]);
  const view: PreviewView = PREVIEW_VIEWS.find((candidate) => candidate === requested) ?? "radar";

  return (
    <AppShell language={language} email={previewEmail} initialNavMode={navMode}>
      <PreviewNav current={view} />
      {view === "radar" && <DigestDashboard issue={previewIssue} items={previewItems} githubTop10={previewGithub} />}
      {view === "radar-empty" && <DigestDashboard issue={previewIssue} items={[]} githubTop10={[]} />}
      {view === "library" && <LibraryView posts={previewPosts} open={previewSources} />}
      {view === "library-empty" && <LibraryView posts={[]} open={[]} />}
      {view === "archive" && <ArchiveView issues={previewArchive} />}
      {view === "archive-empty" && <ArchiveView issues={[]} />}
    </AppShell>
  );
}
