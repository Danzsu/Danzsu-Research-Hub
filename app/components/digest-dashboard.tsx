"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bookmark,
  Building2,
  FlaskConical,
  GitFork,
  ListTodo,
  Newspaper,
  Radar,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentIssue, DigestItem, GithubTopEntry } from "@/data/digest-types";
import { useIsMobile } from "@/hooks/use-mobile";
import { addedDayLabel, dailyTop, feedItems, type Filter } from "@/lib/feed";
import { ratingKey, type Ratings } from "@/lib/ratings";
import { repoStats } from "@/lib/repo-format";
import { EMPTY_ITEM_STATE, type Flag, type ReaderSource } from "@/lib/reader-store";
import { useLanguage } from "./language-context";
import { RepoCard } from "./repo-card";
import { ReaderPanel } from "./reader-panel";
import { focusedCardId, moveCardFocus, MustReadCard, openFocusedCard, StoryCard, type CardActions } from "./story-card";
import { useReadHere } from "./link-chat";
import { isUndoToast, toasts } from "./undo-toast";
import { useModelContextTools } from "./use-model-context-tools";
import { useReaderState } from "./use-reader-state";
import { useShortcuts } from "./use-shortcuts";

const copy = {
  hu: {
    live: "ÉLŐ KIADÁS",
    archived: "LEZÁRT KIADÁS",
    categories: "Kategóriák",
    panel: "Haladás és to-do",
    updated: "Napi frissítés",
    archive: "Heti zárás",
    status: "ÁLLAPOT",
    frozen: "LEZÁRVA",
    collecting: "GYŰJTÉS",
    lead: "Helyi modellek · kutatás · élvonalbeli cégek · repók",
    companiesTitle: "AI CÉGEK",
    companiesLead: "OpenAI · Google · Anthropic · xAI · Meta · Mistral · Microsoft · kínai laborok",
    dailyTop: "NAPI TOP 5",
    companiesFeed: "A HÉT TÖBBI CÉGES HÍRE",
    emptyCompanies: "Ezen a héten még nincs céges hír, a napi futás tölti fel.",
    emptyCompaniesAll: "A hét minden céges híre fent, a napi Top 5-ben van.",
    all: "Aktuális radar",
    local: "Local LLM Lab",
    research: "Kutatási radar",
    companies: "AI cégek",
    github: "GitHub Top 10",
    saved: "Mentve későbbre",
    mustRead: "TOP 3 · KÖTELEZŐ",
    feed: "A HÉT ÉLŐ ADATFOLYAMA",
    sample: "Ez a heti kiadás még üres — a napi automatikus futás tölti fel.",
    emptyAll: "A hét minden híre fent, a Top 3-ban van.",
    emptySaved: "Még nincs mentett hír. A kártyák Később gombjával gyűjtheted ide.",
    emptyCategory: "Ebben a kategóriában ezen a héten nincs hír.",
    emptyGithub: "Ezen a héten még nincs GitHub-lista, a napi futás tölti fel.",
    showAll: "Összes hír",
    close: "Bezárás",
  },
  en: {
    live: "LIVE ISSUE",
    archived: "ARCHIVED ISSUE",
    categories: "Categories",
    panel: "Progress & to-do",
    updated: "Daily refresh",
    archive: "Weekly close",
    status: "STATUS",
    frozen: "FROZEN",
    collecting: "COLLECTING",
    lead: "Local models · research · frontier companies · repositories",
    companiesTitle: "AI COMPANIES",
    companiesLead: "OpenAI · Google · Anthropic · xAI · Meta · Mistral · Microsoft · Chinese labs",
    dailyTop: "DAILY TOP 5",
    companiesFeed: "THE WEEK'S OTHER COMPANY NEWS",
    emptyCompanies: "No company news this week yet; the daily run fills it.",
    emptyCompaniesAll: "Every company story this week is up top, in the daily Top 5.",
    all: "Current radar",
    local: "Local LLM Lab",
    research: "Research radar",
    companies: "AI companies",
    github: "GitHub Top 10",
    saved: "Saved for later",
    mustRead: "TOP 3 · MUST READ",
    feed: "THE WEEK'S LIVE SIGNAL",
    sample: "This week's issue is still empty — the daily automated run fills it.",
    emptyAll: "Every story this week is up top, in the Top 3.",
    emptySaved: "Nothing saved yet. Collect stories here with the Later button on a card.",
    emptyCategory: "No story in this category this week.",
    emptyGithub: "No GitHub list this week yet; the daily run fills it.",
    showAll: "All stories",
    close: "Close",
  },
} as const;

const filters: { id: Filter; icon: LucideIcon }[] = [
  { id: "all", icon: Radar },
  { id: "local", icon: Zap },
  { id: "research", icon: FlaskConical },
  { id: "companies", icon: Building2 },
  { id: "github", icon: GitFork },
  { id: "saved", icon: Bookmark },
];

export function DigestDashboard(
  props: {
    issue: CurrentIssue;
    items: DigestItem[];
    githubTop10: GithubTopEntry[];
    /** A closed week opened from /archive: same reading UI, no "live" framing. */
    archived?: boolean;
    /** /companies: the week's company news only, the latest day's Top 5 first, no category bar. */
    scope?: "companies";
    /** Item id → its Library post (readHerePosts): the cards' "Olvasd itt" opens it. */
    posts?: Record<string, number>;
    /** The page's ratings by ratingKey (getRatings): the cards' and repos' initial values. */
    ratings?: Ratings;
  } & ReaderSource,
) {
  const { issue, githubTop10, archived = false } = props;
  const companies = props.scope === "companies";
  // Memoized: a fresh array each render would re-register the WebMCP tools (their effect keys on the ids).
  const items = useMemo(() => (companies ? props.items.filter((item) => item.category === "companies") : props.items), [companies, props.items]);
  const { language } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const { store, states, loadedStates, todos, syncing } = useReaderState(props);
  const readHere = useReadHere();
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  useModelContextTools(store, itemIds);
  const isMobile = useIsMobile();
  const t = copy[language];

  const top = companies ? dailyTop(items) : items.filter((item) => item.mustRead);
  const feed = companies
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
    onReadHere: (item, opener) => readHere(item.url, opener),
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
    postId: props.posts?.[item.id],
    rating: props.ratings?.[ratingKey({ kind: "item", id: item.id })] ?? null,
    language,
    actions,
  });

  const radarEmpty = filter === "saved" ? t.emptySaved : filter !== "all" ? t.emptyCategory : items.length ? t.emptyAll : null;
  const companiesEmpty = items.length ? t.emptyCompaniesAll : t.emptyCompanies;
  const emptyFeed = companies ? companiesEmpty : radarEmpty;
  const topLabel = companies && top.length ? `${t.dailyTop} · ${addedDayLabel(top[0].addedAt)}` : t.mustRead;

  // Rendered twice: as the 2xl side column, and inside the header Sheet below 2xl.
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
    <div className="min-w-0 bg-cream text-ink">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-2 border-ink bg-cream px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {!archived && <span className="live-pulse shrink-0" />}
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] tracking-[0.2em] text-signal">{archived ? t.archived : t.live}</p>
            <p className="font-display text-lg leading-none">{issue.label}</p>
          </div>
        </div>
        {/* Non-modal, so the undo toast above it stays clickable, reachable by Tab and announced. */}
        <Sheet modal={false}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={t.panel}
              className="press h-10 shrink-0 rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper sm:pointer-fine:h-9 2xl:hidden"
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
            className={`overflow-y-auto border-ink bg-cream p-5 pt-12 text-ink ${isMobile ? "max-h-[85dvh] border-t-2" : "w-[88vw] max-w-sm border-l-2"}`}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.panel}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* The chip bar belongs to this column, so the 2xl panel beside it is not covered. */}
        <div className="min-w-0">
          {!companies && (
            <nav
              aria-label={t.categories}
              className="sticky top-16 z-10 flex gap-2 overflow-x-auto border-b-2 border-ink bg-cream px-4 py-2 scrollbar-none sm:px-7"
            >
              {filters.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className="press focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs hover:shadow-[3px_3px_0_var(--signal)] aria-pressed:bg-signal"
                >
                  <Icon className="size-3.5" /> {t[id]}
                </button>
              ))}
            </nav>
          )}

          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            <section className="relative overflow-hidden border-2 border-ink bg-ink px-5 py-7 text-paper sm:px-8 sm:py-9">
              <div className="signal-grid" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                {/* Sized in cqi, not vw: the nav and the panel make this column much narrower than the viewport. */}
                <div className="min-w-0 @container">
                  <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-paper/55">
                    <span className="border border-paper/30 px-2 py-1">AUTO / 自動</span>
                    <span>
                      {t.updated}: {issue.updated}
                    </span>
                  </div>
                  <h1 className="max-w-4xl font-display text-[clamp(2.6rem,15cqi,8rem)] leading-[0.77] tracking-[-0.07em]">
                    {companies ? t.companiesTitle : "AI WEEKLY"}
                    <span className="text-signal">{"//"}</span>
                  </h1>
                  <p className="mt-5 max-w-2xl font-mono text-sm leading-6 text-paper/65">{companies ? t.companiesLead : t.lead}</p>
                </div>
                <div className="border-l border-paper/25 pl-5 font-mono text-xs leading-6 text-paper/60">
                  <p className="text-signal">{t.archive}</p>
                  <p className="text-lg font-bold text-paper">{issue.archiveAt}</p>
                  <p>
                    {t.status}: {archived ? t.frozen : t.collecting}
                  </p>
                </div>
              </div>
            </section>

            {!items.length && !archived && !companies && (
              <div className="mt-4 border border-signal/50 bg-signal/10 px-4 py-3 font-mono text-xs leading-5 text-ink/70">※ {t.sample}</div>
            )}

            {filter === "github" ? (
              <section className="mt-9 @container">
                <SectionLabel icon={GitFork} label="GITHUB / TOP 10" />
                {githubTop10.length ? (
                  <GithubTopList entries={githubTop10} ratings={props.ratings} />
                ) : (
                  <EmptyNote>{t.emptyGithub}</EmptyNote>
                )}
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

                <section className="mt-9">
                  <SectionLabel icon={Newspaper} label={companies ? t.companiesFeed : t.feed} />
                  <div className="space-y-4">
                    {feed.map((item) => (
                      <StoryCard key={item.id} {...cardProps(item)} />
                    ))}
                    {!feed.length && emptyFeed && (
                      <EmptyNote>
                        <p>{emptyFeed}</p>
                        {filter !== "all" && (
                          <Button variant="brutal" className="mt-4 min-h-10" onClick={() => setFilter("all")}>
                            {t.showAll}
                          </Button>
                        )}
                      </EmptyNote>
                    )}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>

        <aside className="hidden border-l-2 border-ink bg-cream px-5 py-7 2xl:sticky 2xl:top-16 2xl:block 2xl:h-[calc(100dvh-4rem)] 2xl:overflow-y-auto">
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

/** An empty view says what to do next (spec 1.4.10). */
function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="border-2 border-dashed border-ink/35 p-10 text-center font-mono text-sm text-ink/55">{children}</div>;
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
