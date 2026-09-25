import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps, type ComponentType } from "react";
import {
  previewArchive,
  previewGithub,
  previewIssue,
  previewItems,
  previewPosts,
  previewReader,
  previewReadPostIds,
  previewSources,
} from "../../lib/fixtures.ts";
import { render } from "../../lib/test/render.ts";

// Static smoke renders: one per app-shell client component, on realistic (mostly preview) fixture
// data. lib/test/render.ts runs hooks once with no effects, so this catches crashes and the
// render-phase-loop class of bug — 271d147's unconditional setState-in-render made this very file
// throw "Too many re-renders" (see the report for the before/after repro) — not full interaction
// coverage; clicks and state changes are checked in the browser (CLAUDE.md, Conventions → Tests).

const { AppShell } = await import("./app-shell.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { toasts, UndoToast } = await import("./undo-toast.tsx");
const { ReaderPanel } = await import("./reader-panel.tsx");
const { DigestDashboard } = await import("./digest-dashboard.tsx");
const { MustReadCard, StoryCard } = await import("./story-card.tsx");
const { PostImage } = await import("./post-image.tsx");
const { LibraryView } = await import("../(app)/library/library-view.tsx");
const { ArchiveView } = await import("../(app)/archive/archive-view.tsx");

const noop = () => {};
const cardActions = { onOpen: noop, onToggle: noop, onAddTodo: noop };
/** Wraps a component that reads useLanguage() (LocalizedText, SubmitForm, DigestDashboard) in its provider. */
const withLanguage = <P extends object>(Component: ComponentType<P>, props: P) =>
  render(createElement(LanguageProvider, { initial: "en" } as ComponentProps<typeof LanguageProvider>, createElement(Component, props)));

test("AppShell renders both nav landmarks and its child", () => {
  const doc = render(
    createElement(
      AppShell,
      { language: "en", email: "reader@example.test", initialNavMode: "full" } as ComponentProps<typeof AppShell>,
      createElement("p", { "data-testid": "child" }, "Child content"),
    ),
  );
  assert.ok(doc.querySelector('aside nav[aria-label="Main navigation"]'), "desktop nav landmark");
  assert.ok(doc.querySelector('nav#mobile-nav[aria-label="Menu"]'), "mobile bottom bar landmark");
  assert.equal(doc.querySelector('[data-testid="child"]')?.textContent, "Child content");
});

test("UndoToast mounts its live region and survives an active toast with no render loop", () => {
  const id = toasts.show({ kind: "markedRead", undo: noop });
  try {
    const doc = withLanguage(UndoToast, {});
    const status = doc.querySelector('[role="status"]');
    assert.ok(status, "the toast's live region is always mounted");
    assert.equal(status.getAttribute("aria-live"), "polite");
    // useSyncExternalStore calls getServerSnapshot ("no toast") under renderToStaticMarkup, so the
    // toast's own text never reaches this static markup even with one showing — a harness gap, not
    // a bug (see the report). What this test still proves: 271d147's unconditional
    // setPrevToastId(toastId) during render throws "Too many re-renders" right here, before either
    // assertion above — the exact crash class no test caught before this file existed.
  } finally {
    toasts.dismiss(id);
  }
});

test("ReaderPanel renders the progress bar and every to-do row", () => {
  const todos = [
    { id: 1, itemId: null, text: "Read the paper", done: false },
    { id: 2, itemId: "local-2026-W39-must-3", text: "Minta hír", done: true },
  ];
  const doc = render(
    createElement(ReaderPanel, {
      language: "en",
      progress: 40,
      readCount: 2,
      total: 5,
      syncing: false,
      todos,
      onAdd: () => true,
      onToggle: noop,
      onDelete: noop,
    }),
  );
  assert.equal(doc.querySelectorAll("li").length, todos.length);
  assert.ok(doc.querySelector('[role="progressbar"]'), "the progress bar renders");
  // components/ui/progress.tsx computes the indicator's own width from `value` directly (a separate,
  // pre-existing issue leaves Root's aria-valuenow unset — out of this task's two named bugs).
  assert.match(doc.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style") ?? "", /-60%/);
  assert.match(doc.body.textContent ?? "", /40%/);
});

test("DigestDashboard renders the Top 3, the feed and the to-do panel from the preview reader data", () => {
  const doc = withLanguage(DigestDashboard, {
    issue: previewIssue,
    items: previewItems,
    githubTop10: previewGithub,
    preview: { data: previewReader, failWrites: false },
  });
  const topThree = previewItems.filter((item) => item.mustRead);
  assert.equal(doc.querySelectorAll(".must-card").length, topThree.length);
  assert.equal(doc.querySelectorAll(".story-card").length, previewItems.length - topThree.length);
  // The Sheet copy of the panel is portalled (renders null under this harness); only the 2xl
  // static <aside> column renders, so its to-dos appear exactly once, not twice.
  assert.equal(doc.querySelectorAll("aside li").length, previewReader.todos.length);
});

test("StoryCard renders an unread feed card with its full action row", () => {
  const item = previewItems.find((candidate) => !candidate.mustRead)!;
  const doc = render(
    createElement(StoryCard, { item, state: { read: false, saved: false }, hasTodo: false, language: "en", actions: cardActions }),
  );
  const article = doc.querySelector("article.story-card")!;
  assert.equal(article.getAttribute("data-card-id"), item.id);
  assert.equal(article.classList.contains("story-read"), false);
  assert.equal(doc.querySelectorAll(`a[href="${item.url}"]`).length, 1);
  assert.equal(doc.querySelectorAll("button[aria-pressed]").length, 2); // Later + Read
});

test("MustReadCard dims once read and shows its rank", () => {
  const item = previewItems.find((candidate) => candidate.mustRead)!;
  const doc = render(
    createElement(MustReadCard, { rank: 1, item, state: { read: true, saved: false }, hasTodo: false, language: "en", actions: cardActions }),
  );
  const article = doc.querySelector("article.must-card")!;
  assert.ok(article.classList.contains("story-read"));
  assert.match(article.textContent ?? "", /01/);
});

test("LibraryView lists every preview post, its mirrored badge and the pending/failed sources", () => {
  const doc = withLanguage(LibraryView, { posts: previewPosts, open: previewSources, readIds: previewReadPostIds, preview: { failWrites: false } });
  assert.equal(doc.querySelectorAll('a[href^="/library/"]').length, previewPosts.length);
  assert.ok(doc.querySelector("form#submit"), "the submit form renders in preview mode");
  assert.equal(doc.querySelectorAll('input[type="url"]').length, 1);
  const text = doc.body.textContent ?? "";
  assert.ok(text.includes("MIRRORED")); // post -1 carries meta.mirrored
  assert.ok(text.includes("PROCESSING")); // previewSources' pending row
  assert.ok(text.includes("FAILED")); // previewSources' failed row
});

test("ArchiveView lists every preview issue", () => {
  const doc = withLanguage(ArchiveView, { issues: previewArchive });
  const headings = [...doc.querySelectorAll("h2")].map((heading) => heading.textContent);
  assert.deepEqual(
    headings,
    previewArchive.map((issue) => issue.week),
  );
});

test("PostImage keeps the pre-load placeholder behind the img until it settles", () => {
  const placeholder = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const doc = render(
    createElement(PostImage, {
      src: "https://example.test/a.avif",
      srcSet: "https://example.test/a.avif 640w",
      sizes: "100vw",
      alt: "A chart",
      priority: false,
      placeholder,
    }),
  );
  assert.ok(doc.querySelector("img"));
  assert.ok(doc.querySelector('span[aria-hidden="true"]'), "the placeholder layer sits behind the img before onLoad/onError fire");
});
