import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps, type ComponentType } from "react";
import {
  previewArchive,
  previewGithub,
  previewIssue,
  previewItems,
  previewMySources,
  previewPosts,
  previewReader,
  previewReadPostIds,
  previewSources,
} from "../../lib/fixtures.ts";
import { mockFetch } from "../../lib/pipeline/mock-fetch.ts";
import { createSeededStore, memorySend, revalidateSeed, type ReaderSeed, type ReaderStore } from "../../lib/reader-store.ts";
import { navigationStub } from "../../lib/test/next-stub.ts";
import { render } from "../../lib/test/render.ts";

// Static smoke renders: one per app-shell client component, on realistic (mostly preview) fixture
// data. lib/test/render.ts runs hooks once with no effects, so this catches crashes and the
// render-phase-loop class of bug — 271d147's unconditional setState-in-render made this very file
// throw "Too many re-renders" (see the report for the before/after repro) — not full interaction
// coverage; clicks and state changes are checked in the browser (TESTING.md, Test layers).

const { AppShell } = await import("./app-shell.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { toasts, UndoToast } = await import("./undo-toast.tsx");
const { ReaderPanel } = await import("./reader-panel.tsx");
const { DigestDashboard } = await import("./digest-dashboard.tsx");
const { MustReadCard, StoryCard } = await import("./story-card.tsx");
const { PostImage } = await import("./post-image.tsx");
const { Progress } = await import("../../components/ui/progress.tsx");
const { LibraryView } = await import("../(app)/library/library-view.tsx");
const { ArchiveView } = await import("../(app)/archive/archive-view.tsx");
const { CHAT_PANEL_ID, LinkChat, TaiyakiButton } = await import("./link-chat.tsx");
const { RefreshBar, RefreshProvider } = await import("./refresh-bar.tsx");
const { PostToolbar } = await import("../(app)/library/[id]/post-toolbar.tsx");
const { useReaderState } = await import("./use-reader-state.ts");

const noop = () => {};
const cardActions = { onOpen: noop, onToggle: noop, onAddTodo: noop };
/** Each element's own count of `span[aria-hidden="true"]` descendants (the pending dot). */
const hiddenSpanCounts = (elements: Element[]) => elements.map((element) => element.querySelectorAll('span[aria-hidden="true"]').length);
/** Wraps a component in the two providers the shell gives it: the language (LocalizedText, SubmitForm,
 *  DigestDashboard) and the refresh bar (SubmitForm, LinkChat). */
const withShellProviders = <P extends object>(Component: ComponentType<P>, props: P) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "en" } as ComponentProps<typeof LanguageProvider>,
      createElement(RefreshProvider, null, createElement(Component, props)),
    ),
  );
/** Renders DigestDashboard from a real seed (never preview) and returns its body text. */
const dashboardText = (seed: ReaderSeed) =>
  withShellProviders(DigestDashboard, { issue: previewIssue, items: previewItems, githubTop10: previewGithub, seed }).body.textContent ?? "";
/** The whole shell around one child, as the (app) layout renders it. */
const shell = (language: "hu" | "en" = "hu") =>
  render(
    createElement(
      AppShell,
      { language, email: "reader@example.test", initialNavMode: "full" } as ComponentProps<typeof AppShell>,
      createElement("p", { "data-testid": "child" }, "Child content"),
    ),
  );

test("AppShell renders both nav landmarks and its child", () => {
  const doc = shell("en");
  assert.ok(doc.querySelector('aside nav[aria-label="Main navigation"]'), "desktop nav landmark");
  assert.ok(doc.querySelector('nav#mobile-nav[aria-label="Menu"]'), "mobile bottom bar landmark");
  assert.equal(doc.querySelector('[data-testid="child"]')?.textContent, "Child content");
});

test("UndoToast mounts its live region and survives an active toast with no render loop", () => {
  const id = toasts.show({ kind: "markedRead", undo: noop });
  try {
    const doc = withShellProviders(UndoToast, {});
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
  assert.equal(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"), "40");
  assert.match(doc.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style") ?? "", /-60%/);
  assert.match(doc.body.textContent ?? "", /40%/);
});

test("DigestDashboard renders the Top 3, the feed and the to-do panel from the preview reader data", () => {
  const doc = withShellProviders(DigestDashboard, {
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

// The AI companies page. Kills the scope left off (other categories on the page, or the category bar
// back), a Top 5 that isn't the latest run's by score (the fixture's older 95 would lead it), a Top 5
// card repeated in the feed below, and the date missing from the label.
test("DigestDashboard with scope companies shows the latest run's company Top 5, dated, and the week's other company news below", () => {
  const doc = withShellProviders(DigestDashboard, {
    scope: "companies",
    issue: previewIssue,
    items: previewItems,
    githubTop10: previewGithub,
    preview: { data: previewReader, failWrites: false },
  });
  const ids = (selector: string) => [...doc.querySelectorAll(selector)].map((card) => card.getAttribute("data-card-id"));
  assert.equal(doc.querySelector('nav[aria-label="Categories"]'), null);
  assert.deepEqual(ids(".must-card"), [
    "companies-2026-W39-must-2",
    "companies-2026-W39-mistral",
    "companies-2026-W39-meta",
    "companies-2026-W39-deepseek",
    "companies-2026-W39-plain",
  ]);
  assert.deepEqual(ids(".story-card"), ["companies-2026-W39-yesterday"]);
  const labels = [...doc.querySelectorAll("h2")].map((heading) => heading.textContent);
  assert.ok(labels.includes("DAILY TOP 5 · 09. 24."), labels.join(" | "));
  assert.ok(labels.includes("THE WEEK'S OTHER COMPANY NEWS"), labels.join(" | "));
});

// Kills createSeededStore's syncing decision hardcoded to one value: a fresh seed must start synced, a failed (null) one must start syncing.
test("DigestDashboard starts synced from a fresh seed, not the syncing state", () => {
  const text = dashboardText({ issueId: "2026-W39", seededAt: 424_242, data: previewReader });
  // Asserted positively first, so the negative check below can't pass vacuously (e.g. a harness that
  // renders neither copy at all).
  assert.ok(text.includes("SYNCED"), "a fresh seed must show the synced state");
  assert.ok(!text.includes("SYNC…"), "a fresh seed's first mount must not show the syncing state");
});

test("DigestDashboard starts syncing from a failed (null) seed", () => {
  const text = dashboardText({ issueId: "2026-W39", seededAt: 424_242, data: null });
  assert.ok(text.includes("SYNC…"), "a failed seed must start in the syncing state");
});

// Kills the hook passing createSeededStore its own isolated Set instead of the shared mountedSeeds
// default (revalidateSeed's own half of this is checked in the browser, TESTING.md).
test("a seed already marked as seen through the shared defaults starts DigestDashboard syncing again (Back)", () => {
  const backSeed = { issueId: "2026-W39", seededAt: 987_654, data: previewReader };
  // Marks it seen the way a real first mount's revalidateSeed() would, through the module's own default
  // mountedSeeds — no explicit `mounted` argument on either call.
  revalidateSeed(createSeededStore(memorySend(), noop, backSeed), backSeed, async () => previewReader);
  assert.ok(dashboardText(backSeed).includes("SYNC…"), "a seed this tab has already mounted must start syncing again");
});

// A2: nothing proves useReaderState (not just createSourceStore in isolation) actually routes a preview
// source's writes to its in-memory sender rather than real fetch — a hook that built its own seeded or
// real store here instead would still pass every lib/reader-store.ts test. Replaces that file's first
// preview test (createSourceStore's own routing), which this fully subsumes: any misrouting it caught,
// this catches too, one layer up.
test("useReaderState routes a preview source's writes through createSourceStore, never fetch", async (t) => {
  let fetchCalls = 0;
  mockFetch(t, async () => {
    fetchCalls++;
    return Response.json({ id: 1 });
  });
  for (const failWrites of [false, true]) {
    let store: ReaderStore | undefined;
    function Probe() {
      ({ store } = useReaderState({ preview: { data: { states: {}, todos: [] }, failWrites } }));
      return null;
    }
    render(createElement(Probe));
    store!.setFlag("a", "read", true);
    store!.addTodo("x");
    await store!.settled();
  }
  assert.equal(fetchCalls, 0);
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
  const doc = withShellProviders(LibraryView, { posts: previewPosts, open: previewSources, readIds: previewReadPostIds, preview: { failWrites: false } });
  assert.equal(doc.querySelectorAll('a[href^="/library/"]').length, previewPosts.length);
  assert.ok(doc.querySelector("form#submit"), "the submit form renders in preview mode");
  assert.equal(doc.querySelectorAll('input[type="url"]').length, 1);
  const text = doc.body.textContent ?? "";
  assert.ok(text.includes("MIRRORED")); // post -1 carries meta.mirrored
  assert.ok(text.includes("PROCESSING")); // previewSources' pending row
  assert.ok(text.includes("FAILED")); // previewSources' failed row
});

test("ArchiveView lists every preview issue", () => {
  const doc = withShellProviders(ArchiveView, { issues: previewArchive });
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

// N11: Radix reads the value from Root; a Progress that keeps `value` to itself renders every bar
// indeterminate, and a screen reader hears no number. 0 is the edge a falsy check (`value || null`)
// would get wrong — it's a real, reportable "loading" value, not "no value given" — and `undefined`
// (no `value` prop at all, e.g. before the first sync) is Radix's own indeterminate case: no
// aria-valuenow at all, not "0".
test("Progress reports its value to assistive tech: aria-valuenow, loading below the max, complete at it, indeterminate with none", () => {
  const bar = (value: number | undefined) => {
    const root = render(createElement(Progress, { value, "aria-label": "Week" })).querySelector('[role="progressbar"]');
    return [root?.getAttribute("aria-valuenow"), root?.getAttribute("data-state")];
  };
  assert.deepEqual(bar(0), ["0", "loading"]);
  assert.deepEqual(bar(40), ["40", "loading"]);
  assert.deepEqual(bar(100), ["100", "complete"]);
  assert.deepEqual(bar(undefined), [null, "indeterminate"]);
});

// Kills a taiyaki that doesn't say which panel it opens, whether it is open, or what it does in the
// reader's language.
test("TaiyakiButton names itself in the reader's language, and says which panel it opens and whether it is open", () => {
  const button = (language: "hu" | "en", open: boolean) => {
    const element = render(
      createElement(LanguageProvider, { initial: language } as ComponentProps<typeof LanguageProvider>, createElement(TaiyakiButton, { open, onClick: noop, className: "grid" })),
    ).querySelector("button");
    return [element?.getAttribute("aria-label"), element?.getAttribute("aria-expanded"), element?.getAttribute("aria-controls")];
  };
  assert.deepEqual(button("hu", false), ["Link bedobása", "false", CHAT_PANEL_ID]);
  assert.deepEqual(button("en", true), ["Drop a link", "true", CHAT_PANEL_ID]);
});

// Kills either taiyaki left out of the shell: the corner button and the bar's centre slot. This
// harness renders Radix's portal as null, so the panel itself never reaches the markup, open or not:
// the LinkChat render proves only that its top level (the chat store, the transport, the hooks) runs
// without a crash or a render loop.
test("AppShell carries the taiyaki, and LinkChat's top level renders without a render loop", () => {
  const doc = shell();
  assert.equal(doc.querySelectorAll(`button[aria-controls="${CHAT_PANEL_ID}"]`).length, 2);
  withShellProviders(LinkChat, { open: true, onOpenChange: noop, opener: { current: null }, preview: { sources: previewMySources, failWrites: false } });
});

// Kills the bar's old order: Archívum in the bar, and no taiyaki between Könyvtár and Keresés.
test("the mobile bar reads Radar, Könyvtár, the taiyaki, Keresés, Több", () => {
  const doc = shell();
  const slots = [...doc.querySelectorAll("#mobile-nav > *")].map((slot) => slot.getAttribute("aria-label") ?? slot.textContent);
  assert.deepEqual(slots, ["Radar", "Könyvtár", "Link bedobása", "Keresés", "Több"]);
});

// Kills a "Több" slot without the active mark on an Archívum page, or with it on another page. The
// sheet itself (Archívum's aria-current) is portalled, so it never reaches this markup: Playwright checks it.
test("the Több slot carries the active mark on Archívum's pages only", (t) => {
  t.after(() => {
    navigationStub.pathname = "/";
  });
  const moreSlot = (pathname: string) => {
    navigationStub.pathname = pathname;
    const doc = shell();
    const slot = doc.querySelector("#mobile-nav > :last-child");
    return [slot?.textContent, slot?.getAttribute("data-active") ?? null];
  };
  assert.deepEqual(moreSlot("/archive/2026-W38"), ["Több", "true"]);
  assert.deepEqual(moreSlot("/archive"), ["Több", "true"]);
  assert.deepEqual(moreSlot("/library"), ["Több", null]);
});

// Spec 2.1. Kills the dot left out of a nav link (a slow tap would show nothing again), put in the
// search button (no navigation to wait for), exposed to assistive tech, or cut off from useLinkStatus.
test("every nav link carries one hidden pending dot, the search button none, and it marks a waiting navigation", (t) => {
  t.after(() => {
    navigationStub.linkPending = false;
  });
  const doc = shell("en");
  assert.deepEqual(hiddenSpanCounts([...doc.querySelectorAll("aside nav a")]), [1, 1, 1, 1]); // Radar, AI companies, Library, Archive
  assert.deepEqual(hiddenSpanCounts([...doc.querySelectorAll("#mobile-nav > a")]), [1, 1]); // Radar, Library
  const searchButtons = [...doc.querySelectorAll("aside nav button, #mobile-nav > button")].filter((button) => button.textContent?.startsWith("Search"));
  assert.deepEqual(hiddenSpanCounts(searchButtons), [0, 0]);
  assert.equal(doc.querySelectorAll("[data-pending]").length, 0);
  navigationStub.linkPending = true;
  assert.equal(shell("en").querySelectorAll('span[aria-hidden="true"][data-pending]').length, 6);
});

// Spec 2.1. Kills the dot missing from the week and post cards, where a tap waits on the server too.
test("every archive week card and Library post card carries one hidden pending dot", () => {
  const perCard = (doc: Document, selector: string) => hiddenSpanCounts([...doc.querySelectorAll(selector)]);
  assert.deepEqual(perCard(withShellProviders(ArchiveView, { issues: previewArchive }), 'a[href^="/archive/"]'), previewArchive.map(() => 1));
  const library = withShellProviders(LibraryView, { posts: previewPosts, open: previewSources, readIds: previewReadPostIds, preview: { failWrites: false } });
  assert.deepEqual(perCard(library, 'a[href^="/library/"]'), previewPosts.map(() => 1));
});

// Spec 2.3. Kills a bar that shows at rest (it would sit over every page), one exposed to assistive tech,
// and a shell without the provider (every refresh would throw).
test("the refresh bar is absent at rest, in the shell too, and hidden from assistive tech while a refresh runs", () => {
  const bars = (doc: Document) => doc.querySelectorAll('div[aria-hidden="true"]').length;
  assert.equal(render(createElement(RefreshBar, { pending: false })).body.children.length, 0);
  const running = render(createElement(RefreshBar, { pending: true }));
  assert.deepEqual([running.body.children.length, bars(running), running.body.textContent], [1, 1, ""]);
  assert.equal(bars(shell("en")), 0);
});

// Spec 2.3, like useLanguage. Kills a useRefresh that quietly does nothing without its provider: the
// refresh would be lost, and the bar with it.
test("useRefresh outside RefreshProvider throws, naming where the provider lives", () => {
  const props = { postId: 7, language: "en", hasTranslation: false, showingTranslation: false, canEdit: false, hasTranslatable: true } as const;
  assert.throws(() => render(createElement(PostToolbar, props)), /RefreshProvider \(app\/components\/app-shell\.tsx\)/);
});
