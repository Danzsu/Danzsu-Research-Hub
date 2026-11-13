"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Building2,
  FlaskConical,
  GitFork,
  ListTodo,
  Newspaper,
  Radar,
  Sunset,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentIssue, DailyBrief, DigestItem, GithubTopEntry, LibraryCopy } from "@/data/digest-types";
import { useIsMobile } from "@/hooks/use-mobile";
import { addedDayLabel, dailyTop, feedItems, type Filter } from "@/lib/feed";
import { httpTransport, memoryTransport } from "@/lib/link-chat";
import { SHORT_MINUTES } from "@/lib/pipeline/daily-top";
import { ratingKey, type Ratings } from "@/lib/ratings";
import { repoStats } from "@/lib/repo-format";
import { EMPTY_ITEM_STATE, type Flag, type ReaderSource } from "@/lib/reader-store";
import { usePanel } from "./app-shell";
import { EmptyState } from "./empty-state";
import { useLanguage } from "./language-context";
import { PendingDot } from "./nav-parts";
import { RepoCard } from "./repo-card";
import { ReaderPanel } from "./reader-panel";
import { focusedCardId, moveCardFocus, MustReadCard, openFocusedCard, StoryCard, type CardActions } from "./story-card";
import { tabPastPanel } from "./tab-past-panel";
import { isUndoToast, toasts } from "./undo-toast";
import { useModelContextTools } from "./use-model-context-tools";
import { useReaderState } from "./use-reader-state";
import { useShortcuts } from "./use-shortcuts";

const copy = {
  hu: {
    live: "ÉLŐ KIADÁS",
    dailyList: "NAPI LISTA",
    archived: "LEZÁRT KIADÁS",
    categories: "Nézetek",
    panel: "Haladás és to-do",
    updated: "Napi frissítés",
    schedule: "NAPI 13:00 UTC · ZÁRÁS VAS 24:00",
    archive: "Heti zárás",
    status: "ÁLLAPOT",
    frozen: "LEZÁRVA",
    collecting: "GYŰJTÉS",
    lead: "Helyi modellek · kutatás · élvonalbeli cégek · repók",
    companiesTitle: "AI CÉGEK",
    dailyTitle: "NAPI",
    dailyLead: "A nap 10 legfontosabb híre, mindegyikhez 2–3 perces összefoglalóval.",
    dailyCount: (count: number, short: number) => `${count} hír · ebből ${short} rövid`,
    dailyStale: (day: string) => `Korábbi lista (${day}) — a mai 18:00-ra készül.`,
    // The date ends in a period ("2026. 10. 11."), so it goes in brackets, not before a suffix.
    dailyLate: (day: string) => `A mai lista késik — addig a korábbi látszik (${day}).`,
    dailyIndex: "A nap hírei",
    dailyFeed: "A NAP 10 HÍRE",
    emptyDaily: "Még nincs napi lista. Az első este 18:00-ra készül el.",
    companiesLead: "OpenAI · Google · Anthropic · xAI · Meta · Mistral · Microsoft · kínai laborok",
    dailyTop: "NAPI TOP 5",
    companiesFeed: "A HÉT TÖBBI CÉGES HÍRE",
    emptyCompanies: "Ezen a héten még nincs céges hír, a napi futás tölti fel.",
    emptyCompaniesAll: "A hét minden céges híre fent, a napi Top 5-ben van.",
    all: "Heti",
    daily: "Napi",
    local: "Local LLM",
    research: "Kutatás",
    companies: "AI cégek",
    github: "GitHub",
    saved: "Mentett",
    mustRead: "TOP 3 · KÖTELEZŐ",
    feed: "A HÉT ÉLŐ ADATFOLYAMA",
    sample: "Ez a heti kiadás még üres — a napi automatikus futás tölti fel.",
    emptyAll: "A hét minden híre fent, a Top 3-ban van.",
    emptySaved: "Még nincs mentett hír. A kártyák Később gombjával gyűjtheted ide.",
    emptyCategory: "Ebben a kategóriában ezen a héten nincs hír.",
    emptyGithub: "Ezen a héten még nincs GitHub-lista, a napi futás tölti fel.",
    allRepos: "Minden repó →",
    showAll: "Összes hír",
    close: "Bezárás",
  },
  en: {
    live: "LIVE ISSUE",
    dailyList: "DAILY LIST",
    archived: "ARCHIVED ISSUE",
    categories: "Views",
    panel: "Progress & to-do",
    updated: "Daily refresh",
    schedule: "DAILY 13:00 UTC · FREEZE SUN 24:00",
    archive: "Weekly close",
    status: "STATUS",
    frozen: "FROZEN",
    collecting: "COLLECTING",
    lead: "Local models · research · frontier companies · repositories",
    companiesTitle: "AI COMPANIES",
    dailyTitle: "DAILY",
    dailyLead: "The day's 10 most important stories, each with a 2–3 minute brief.",
    dailyCount: (count: number, short: number) => `${count} stories · ${short} short`,
    dailyStale: (day: string) => `An earlier list (${day}) — today's is ready by 18:00.`,
    dailyLate: (day: string) => `Today's list is late — showing the one from ${day}.`,
    dailyIndex: "The day's stories",
    dailyFeed: "THE DAY'S 10",
    emptyDaily: "No daily list yet. The first one is ready by 18:00.",
    companiesLead: "OpenAI · Google · Anthropic · xAI · Meta · Mistral · Microsoft · Chinese labs",
    dailyTop: "DAILY TOP 5",
    companiesFeed: "THE WEEK'S OTHER COMPANY NEWS",
    emptyCompanies: "No company news this week yet; the daily run fills it.",
    emptyCompaniesAll: "Every company story this week is up top, in the daily Top 5.",
    all: "Weekly",
    daily: "Daily",
    local: "Local LLM",
    research: "Research",
    companies: "AI companies",
    github: "GitHub",
    saved: "Saved",
    mustRead: "TOP 3 · MUST READ",
    feed: "THE WEEK'S LIVE SIGNAL",
    sample: "This week's issue is still empty — the daily automated run fills it.",
    emptyAll: "Every story this week is up top, in the Top 3.",
    emptySaved: "Nothing saved yet. Collect stories here with the Later button on a card.",
    emptyCategory: "No story in this category this week.",
    emptyGithub: "No GitHub list this week yet; the daily run fills it.",
    allRepos: "All repos →",
    showAll: "All stories",
    close: "Close",
  },
} as const;

// The Radar's views, in the band beside the week (2026-11-01 review). A view with a `page` is a page of its own
// for the current week; a closed week has no daily list or companies page, so there every chip filters it.
const views: { id: Filter | "daily"; icon: LucideIcon; page?: string }[] = [
  { id: "all", icon: Radar, page: "/" },
  { id: "daily", icon: Sunset, page: "/daily" },
  { id: "local", icon: Zap },
  { id: "research", icon: FlaskConical },
  { id: "companies", icon: Building2, page: "/companies" },
  { id: "github", icon: GitFork },
  { id: "saved", icon: Bookmark },
];
const isFilter = (value: string | null): value is Filter => views.some((view) => view.id === value && view.id !== "daily");

const chipClass =
  "press focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs hover:shadow-[3px_3px_0_var(--signal)] aria-pressed:bg-signal aria-[current=page]:bg-signal";

export function DigestDashboard(
  props: {
    issue: CurrentIssue;
    items: DigestItem[];
    githubTop10: GithubTopEntry[];
    /** A closed week opened from /archive: same reading UI, no "live" framing. */
    archived?: boolean;
    /** Opened from /archive: a past week has no daily list or companies page of its own, so every view chip filters
     *  it. Not the same as `archived`, which the current week also is on a Monday until the run opens the new one. */
    fromArchive?: boolean;
    /** /companies: the week's company news only, the latest day's Top 5 first, no category bar. */
    scope?: "companies" | "daily";
    /** Item id → its Library copy (readHerePosts): a card's Read here opens the post, or says it is being made. */
    posts?: Record<string, LibraryCopy>;
    /** The page's ratings by ratingKey (getRatings): the cards' and repos' initial values. */
    ratings?: Ratings;
    /** /daily (daily news spec N7): whether the list is today's, and each card's long text. */
    daily?: { today: boolean; late: boolean; briefs: Record<string, DailyBrief> };
  } & ReaderSource,
) {
  const { issue, githubTop10, archived = false, fromArchive = false } = props;
  const companies = props.scope === "companies";
  const dailyView = props.scope === "daily";
  // The weekly Radar and a closed week filter in place; /daily and /companies link their filter chips to the Radar.
  const filtersHere = !companies && !dailyView;
  // Memoized: a fresh array each render would re-register the WebMCP tools (their effect keys on the ids).
  const items = useMemo(() => (companies ? props.items.filter((item) => item.category === "companies") : props.items), [companies, props.items]);
  const { language } = useLanguage();
  // Another view's filter chip links here with ?filter=; on this page the chips then switch in place.
  const requested = useSearchParams().get("filter");
  const [filter, setFilter] = useState<Filter>(() => (isFilter(requested) ? requested : "all"));
  const { store, states, loadedStates, todos, syncing } = useReaderState(props);
  // Save here sends the item's URL as a submission; the preview keeps it in memory, like its other writes.
  const [transport] = useState(() => (props.preview ? memoryTransport([], props.preview.failWrites) : httpTransport));
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  useModelContextTools(store, itemIds);
  const isMobile = useIsMobile();
  const t = copy[language];

  const top = dailyView ? [] : companies ? dailyTop(items) : items.filter((item) => item.mustRead);
  const feed = dailyView
    ? items
    : companies
    ? feedItems(items, "companies", states, loadedStates).filter((item) => !top.includes(item))
    : feedItems(items, filter, states, loadedStates);
  const readCount = items.filter((item) => states[item.id]?.read).length;
  const progress = items.length ? Math.round((readCount / items.length) * 100) : 0;
  const openTodos = todos.filter((todo) => !todo.done).length;
  const itemsWithTodo = new Set(todos.map((todo) => todo.itemId));

  const actions: CardActions = {
    onOpen(item) {
      // Opening is reading. Already read means nothing changed, so there is nothing to undo.
      if (store.setFlag(item.id, "read", true)) {
        toasts.show({ kind: "markedRead", undo: () => store.setFlag(item.id, "read", false) });
      }
    },
    onToggle: (itemId, flag) => store.toggleFlag(itemId, flag),
    async onSaveHere(item) {
      try {
        const { status, body } = await transport.submit(item.url, null);
        if (status === 202 || (status === 409 && body.queued)) return "pending";
        if (status === 409) return typeof body.postId === "number" ? body.postId : "unavailable";
      } catch {
        // Offline: the toast below.
      }
      // Signed out, refused or out of reach: nothing changed, so the button stays for another try.
      toasts.show({ kind: "notSaved" });
      return null;
    },
    onAddTodo(item) {
      if (store.addTodo(item.title[language], item.id)) toasts.show({ kind: "todoAdded" });
    },
  };

  function deleteTodo(id: number) {
    const removal = store.removeTodo(id);
    if (removal) toasts.show({ kind: "todoDeleted", ...removal });
  }

  function toggleFocused(flag: Flag) {
    const itemId = focusedCardId();
    if (itemId) store.toggleFlag(itemId, flag);
  }

  useShortcuts({
    next: () => moveCardFocus(1),
    previous: () => moveCardFocus(-1),
    open: openFocusedCard,
    read: () => toggleFocused("read"),
    later: () => toggleFocused("saved"),
  });

  const cardProps = (item: DigestItem) => ({
    item,
    state: states[item.id] ?? EMPTY_ITEM_STATE,
    hasTodo: itemsWithTodo.has(item.id),
    library: props.posts?.[item.id],
    rating: props.ratings?.[ratingKey({ kind: "item", id: item.id })] ?? null,
    brief: props.daily?.briefs[item.id],
    language,
    actions,
  });

  const radarEmpty = filter === "saved" ? t.emptySaved : filter !== "all" ? t.emptyCategory : items.length ? t.emptyAll : null;
  const companiesEmpty = items.length ? t.emptyCompaniesAll : t.emptyCompanies;
  const emptyFeed = dailyView ? t.emptyDaily : companies ? companiesEmpty : radarEmpty;
  const topLabel = companies && top.length ? `${t.dailyTop} · ${addedDayLabel(top[0].addedAt)}` : t.mustRead;

  const panelLayer = usePanel();
  const panelTrigger = useRef<HTMLButtonElement>(null);
  const closePanel = panelLayer.setOpen;
  // The panel belongs to this page: leaving it (a link, Back, Forward) must not leave it open for the next Radar view.
  useEffect(() => () => closePanel(false), [closePanel]);
  // Rendered twice: as the side column from a 95rem-wide Radar (R3 §2: its own width, not the viewport's), and inside the header Sheet below that.
  const panel = (
    <ReaderPanel
      language={language}
      progress={progress}
      readCount={readCount}
      total={items.length}
      syncing={syncing}
      todos={todos}
      onAdd={(text, onFailed) => store.addTodo(text, undefined, onFailed)}
      onToggle={(id, done) => store.setTodoDone(id, done)}
      onDelete={deleteTodo}
    />
  );

  return (
    <div className="min-w-0 bg-cream text-ink @container">
      {/* One band: the week, its views and the panel pill. One row once the column is 72rem wide; narrower, the views
          take a row of their own, wrapping from md (a mouse can't scroll a hidden scrollbar) and scrolling on a phone. */}
      <header className="radar-header sticky top-0 z-20 flex flex-wrap items-center gap-x-3 border-b-2 border-ink bg-cream px-4 sm:px-7 @[72rem]:h-16 @[72rem]:flex-nowrap">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-2 sm:gap-3 @[72rem]:h-auto @[72rem]:flex-none">
          {!archived && <span className="live-pulse shrink-0" />}
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] tracking-[0.18em] text-signal">{archived ? t.archived : dailyView ? t.dailyList : t.live}</p>
            <p className="whitespace-nowrap font-display text-lg leading-none">{issue.label}</p>
          </div>
        </div>
        <nav aria-label={t.categories} className="order-last flex basis-full gap-2 overflow-x-auto pb-2 scrollbar-none md:flex-wrap md:overflow-visible @[72rem]:order-none @[72rem]:min-w-0 @[72rem]:flex-1 @[72rem]:flex-nowrap @[72rem]:basis-auto @[72rem]:pb-0">
          {views
            .filter((view) => !(fromArchive && view.id === "daily"))
            .map(({ id, icon: Icon, page }) => {
              const label = (
                <>
                  <Icon className="size-3.5" /> {t[id]}
                </>
              );
              if (filtersHere && id !== "daily" && (fromArchive || !page || id === "all")) {
                return (
                  <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id as Filter)} className={chipClass}>
                    {label}
                  </button>
                );
              }
              const current = (id === "daily" && dailyView) || (id === "companies" && companies);
              return (
                <Link key={id} href={page ?? `/?filter=${id}`} aria-current={current ? "page" : undefined} className={chipClass}>
                  {label}
                  <PendingDot />
                </Link>
              );
            })}
        </nav>
        {/* Non-modal, so the undo toast above it stays clickable, reachable by Tab and announced. */}
        <Sheet modal={false} open={panelLayer.open} onOpenChange={panelLayer.setOpen}>
          <SheetTrigger asChild>
            <Button
              ref={panelTrigger}
              variant="outline"
              size="sm"
              aria-label={t.panel}
              className="press h-10 shrink-0 rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper sm:pointer-fine:h-9 @[95rem]:hidden"
            >
              <ListTodo /> {progress}%{openTodos > 0 && <span className="text-signal">· {openTodos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            closeLabel={t.close}
            // Focus the panel itself (tabIndex={-1} on SheetPrimitive.Content), not the to-do input — that
            // would pop the phone keyboard — but the trigger-only default lets the very next Tab, on a sheet
            // portaled to the end of body, dismiss it instead of reaching the panel.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (event.currentTarget as HTMLElement).focus();
            }}
            onInteractOutside={(event) => {
              if (isUndoToast(event.target)) event.preventDefault();
            }}
            // Never modal, so Tab goes on past it to the page, as in the link chat.
            onKeyDownCapture={(event) => tabPastPanel(event, () => panelTrigger.current)}
            className={`overflow-y-auto border-ink bg-cream p-5 pt-12 text-ink ${isMobile ? "max-h-[85dvh] border-t-2 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]" : "w-[88vw] max-w-sm border-l-2"}`}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.panel}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 @[95rem]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            <section className="relative overflow-hidden border-2 border-ink bg-ink px-5 py-6 text-paper sm:px-8 sm:py-9">
              <div className="signal-grid" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                {/* Sized in cqi, not vw: the nav and the panel make this column much narrower than the viewport. */}
                <div className="min-w-0 @container">
                  <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-paper/55">
                    <span className="border border-paper/30 px-2 py-1">AUTO / 自動</span>
                    <span>
                      {t.updated}: {issue.updated}
                    </span>
                    {/* The phone keeps one line: the update time says enough there. */}
                    <span className="hidden sm:inline">{t.schedule}</span>
                  </div>
                  <h1 className="max-w-4xl font-display text-[clamp(2.6rem,15cqi,8rem)] leading-[0.77] tracking-[-0.07em]">
                    {dailyView ? t.dailyTitle : companies ? t.companiesTitle : "AI WEEKLY"}
                    <span className="text-signal">{"//"}</span>
                  </h1>
                  {/* R3 §1: on a phone the lead and the close box give way to one status line under the title. */}
                  <p className="mt-5 hidden max-w-2xl font-mono text-sm leading-6 text-paper/65 sm:block">{dailyView ? t.dailyLead : companies ? t.companiesLead : t.lead}</p>
                  {dailyView ? (
                    <p className="mt-3 font-mono text-xs text-paper/70">
                      {t.dailyCount(items.length, items.filter((item) => item.readMinutes <= SHORT_MINUTES).length)}
                      {props.daily && !props.daily.today && items.length > 0 && <span className="block text-signal">{props.daily.late ? t.dailyLate(issue.label) : t.dailyStale(issue.label)}</span>}
                    </p>
                  ) : (
                    <p className="mt-3 font-mono text-xs text-paper/60 sm:hidden">
                      {t.archive}: {issue.archiveAt} · {archived ? t.frozen : t.collecting}
                    </p>
                  )}
                </div>
                <div className={`hidden border-l border-paper/25 pl-5 font-mono text-xs leading-6 text-paper/60 ${dailyView ? "" : "sm:block"}`}>
                  <p className="text-signal">{t.archive}</p>
                  <p className="text-lg font-bold text-paper">{issue.archiveAt}</p>
                  <p>
                    {t.status}: {archived ? t.frozen : t.collecting}
                  </p>
                </div>
              </div>
            </section>

            {!items.length && !archived && !companies && !dailyView && (
              <div className="mt-4 border border-signal/50 bg-signal/10 px-4 py-3 font-mono text-xs leading-5 text-ink/70">※ {t.sample}</div>
            )}

            {filter === "github" ? (
              <section className="mt-9 @container">
                <SectionLabel icon={GitFork} label="GITHUB / TOP 10" />
                {githubTop10.length ? (
                  <GithubTopList entries={githubTop10} ratings={props.ratings} />
                ) : (
                  <EmptyState tone="cream" icon={GitFork}>{t.emptyGithub}</EmptyState>
                )}
                <Link href="/github" className="focus-ring mt-4 inline-flex min-h-10 items-center font-mono text-xs underline hover:text-signal">
                  {t.allRepos}
                </Link>
              </section>
            ) : (
              <>
                {filter === "all" && top.length > 0 && (
                  <section className="mt-9 @container">
                    <SectionLabel icon={Zap} label={topLabel} />
                    <div className="grid gap-4 @3xl:grid-cols-3">
                      {top.map((item, index) => (
                        <MustReadCard key={item.id} rank={index + 1} {...cardProps(item)} />
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-9 @container">
                  <SectionLabel icon={dailyView ? Sunset : Newspaper} label={dailyView ? t.dailyFeed : companies ? t.companiesFeed : t.feed} />
                  {dailyView && items.length > 0 && (
                    <nav aria-label={t.dailyIndex} className="mb-6 border-2 border-ink bg-paper p-4">
                      <ol className="space-y-1 font-mono text-xs">
                        {items.map((item, index) => (
                          <li key={item.id}>
                            <a href={`#daily-${index + 1}`} className="focus-ring flex min-h-10 items-center gap-3 hover:text-signal">
                              <span className="text-signal">{String(index + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.title[language]}</span>
                              <span className="text-ink/55">{item.score}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    </nav>
                  )}
                  {/* Two-up in a wide column, so a 900px card doesn't leave half of it empty; the daily list stays one,
                      a ranked list with long briefs read top to bottom. */}
                  <div className={`grid gap-4 ${dailyView ? "" : "@[100rem]:grid-cols-2"}`}>
                    {feed.map((item, index) => (
                      <StoryCard key={item.id} {...cardProps(item)} rank={dailyView ? index + 1 : undefined} />
                    ))}
                  </div>
                  {!feed.length && emptyFeed && (
                    <EmptyState tone="cream" icon={Newspaper}>
                      <p>{emptyFeed}</p>
                      {filter !== "all" && (
                        <Button variant="brutal" className="mt-4 min-h-10" onClick={() => setFilter("all")}>
                          {t.showAll}
                        </Button>
                      )}
                    </EmptyState>
                  )}
                </section>
              </>
            )}
          </main>
        </div>

        <aside className="hidden border-l-2 border-ink bg-cream px-5 py-7 @[95rem]:sticky @[95rem]:top-16 @[95rem]:block @[95rem]:h-[calc(100dvh-4rem)] @[95rem]:overflow-y-auto @[95rem]:pb-24">
          {panel}
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b-2 border-ink pb-3">
      <span className="grid size-8 place-items-center bg-signal">
        <Icon className="size-4" />
      </span>
      <h2 className="font-mono text-xs font-bold tracking-[0.15em]">{label}</h2>
    </div>
  );
}

/** The week's GitHub Top 10 (the "github" chip): each row a link to the repo with its score, and its rating
 *  group beside it, outside the link (G1 spec 3). */
export function GithubTopList({ entries, ratings }: { entries: GithubTopEntry[]; ratings?: Ratings }) {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {entries.map(({ repo, focus, url, stars, language, score }, index) => (
        <RepoCard
          key={repo}
          rank={index + 1}
          repo={repo}
          url={url}
          focus={focus}
          meta={repoStats(language, stars, score)}
          target={{ kind: "repo", id: repo }}
          initial={ratings?.[ratingKey({ kind: "repo", id: repo })] ?? null}
        />
      ))}
    </div>
  );
}
