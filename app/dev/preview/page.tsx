import { notFound } from "next/navigation";
import { ArchiveView } from "@/app/(app)/archive/archive-view";
import { LibraryView } from "@/app/(app)/library/library-view";
import { AppShell } from "@/app/components/app-shell";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import {
  previewArchive,
  previewEmail,
  previewGithub,
  previewIssue,
  previewItems,
  previewMySources,
  previewPosts,
  previewReader,
  previewReadPostIds,
  previewSources,
} from "@/lib/fixtures";
import { getLanguage, getNavMode } from "@/lib/language";
import { PREVIEW_VIEWS, PreviewNav, previewDelayMs, type PreviewView } from "./preview-nav";

// The real view components on fixtures: no Supabase keys, no network, no sign-in. Development only.

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string; fail?: string; slow?: string }> }) {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [{ view: requested, fail, slow }, language, navMode] = await Promise.all([searchParams, getLanguage(), getNavMode()]);
  const view: PreviewView = PREVIEW_VIEWS.find((candidate) => candidate === requested) ?? "radar";
  const failWrites = fail === "1";
  const delayMs = previewDelayMs(slow);

  return (
    <AppShell language={language} email={previewEmail} initialNavMode={navMode} chatPreview={{ sources: previewMySources, failWrites, delayMs }}>
      <PreviewNav current={view} failWrites={failWrites} slow={delayMs > 0} />
      {view === "radar" && (
        <DigestDashboard
          key={String(failWrites)}
          issue={previewIssue}
          items={previewItems}
          githubTop10={previewGithub}
          // The preview branch of useReaderState ignores `seed` entirely; this is here only because
          // DigestDashboard requires one. seededAt: 0 is fine — the preview never revalidates it.
          seed={{ issueId: previewIssue.id, seededAt: 0, data: previewReader }}
          preview={{ data: previewReader, failWrites }}
        />
      )}
      {view === "radar-empty" && (
        <DigestDashboard
          key={String(failWrites)}
          issue={previewIssue}
          items={[]}
          githubTop10={[]}
          seed={{ issueId: previewIssue.id, seededAt: 0, data: { states: {}, todos: [] } }}
          preview={{ data: { states: {}, todos: [] }, failWrites }}
        />
      )}
      {view === "library" && <LibraryView posts={previewPosts} open={previewSources} readIds={previewReadPostIds} preview={{ failWrites }} />}
      {view === "library-empty" && <LibraryView posts={[]} open={[]} readIds={new Set()} preview={{ failWrites }} />}
      {view === "archive" && <ArchiveView issues={previewArchive} />}
      {view === "archive-empty" && <ArchiveView issues={[]} />}
    </AppShell>
  );
}
