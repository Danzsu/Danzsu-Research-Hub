import { notFound } from "next/navigation";
import { ArchiveView } from "@/app/(app)/archive/archive-view";
import { GithubView } from "@/app/(app)/github/github-view";
import { CollectionView } from "@/app/(app)/collection/collection-view";
import { LibraryView } from "@/app/(app)/library/library-view";
import { AppShell } from "@/app/components/app-shell";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { ListSkeleton, PostSkeleton, RadarSkeleton } from "@/app/components/page-skeletons";
import {
  previewArchive,
  previewDaily,
  previewDailyIssue,
  previewDailyItems,
  previewEmail,
  previewFavorites,
  previewGithub,
  previewGithubRepos,
  previewIssue,
  previewItems,
  previewMySources,
  previewPosts,
  previewRatings,
  previewReader,
  previewReadHerePosts,
  previewReadPostIds,
  previewSources,
} from "@/lib/fixtures";
import { getLanguage, getNavMode } from "@/lib/language";
import { postsDownLast } from "@/lib/ratings";
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
      {(view === "radar" || view === "companies") && (
        <DigestDashboard
          key={`${view}:${failWrites}`}
          scope={view === "companies" ? "companies" : undefined}
          issue={previewIssue}
          items={previewItems}
          githubTop10={previewGithub}
          preview={{ data: previewReader, failWrites }}
          posts={previewReadHerePosts}
          ratings={previewRatings}
        />
      )}
      {(view === "daily" || view === "daily-empty") && (
        <DigestDashboard
          key={`${view}:${failWrites}`}
          scope="daily"
          issue={previewDailyIssue}
          items={view === "daily" ? previewDailyItems : []}
          githubTop10={[]}
          daily={view === "daily" ? previewDaily : { today: true, late: false, briefs: {} }}
          preview={{ data: previewReader, failWrites }}
          posts={previewReadHerePosts}
          ratings={previewRatings}
        />
      )}
      {view === "radar-empty" && (
        <DigestDashboard key={String(failWrites)} issue={previewIssue} items={[]} githubTop10={[]} preview={{ data: { states: {}, todos: [] }, failWrites }} />
      )}
      {view === "library" && <LibraryView posts={postsDownLast(previewPosts, previewRatings)} open={previewSources} readIds={previewReadPostIds} ratings={previewRatings} preview={{ failWrites }} />}
      {view === "library-empty" && <LibraryView posts={[]} open={[]} readIds={new Set()} ratings={{}} preview={{ failWrites }} />}
      {view === "archive" && <ArchiveView issues={previewArchive} />}
      {view === "archive-empty" && <ArchiveView issues={[]} />}
      {view === "github" && <GithubView repos={previewGithubRepos} more languages={["C++", "Python", "Rust"]} filters={{ page: 1 }} />}
      {view === "collection" && <CollectionView favorites={previewFavorites} />}
      {view === "radar-loading" && <RadarSkeleton />}
      {view === "library-loading" && <ListSkeleton form />}
      {view === "archive-loading" && <ListSkeleton />}
      {view === "post-loading" && <PostSkeleton />}
    </AppShell>
  );
}
