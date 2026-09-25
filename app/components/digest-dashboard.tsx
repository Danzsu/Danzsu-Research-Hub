"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Building2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FlaskConical,
  GitFork,
  ListTodo,
  Newspaper,
  Radar,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentIssue, DigestCategory, DigestItem, GithubTopEntry } from "@/data/digest-types";
import { useLanguage } from "./language-context";
import { EMPTY_ITEM_STATE } from "@/lib/reader-store";
import { ReaderPanel } from "./reader-panel";
import { isUndoToast, toasts } from "./undo-toast";
import { useModelContextTools } from "./use-model-context-tools";
import { useReaderState, type ReaderPreview } from "./use-reader-state";

type Filter = "all" | DigestCategory | "saved";

const ui = {
  hu: {
    live: "ÉLŐ KIADÁS",
    archived: "LEZÁRT KIADÁS",
    categories: "Kategóriák",
    panel: "Haladás és to-do",
    updated: "Napi frissítés",
    archive: "Heti zárás",
    all: "Aktuális radar",
    local: "Local LLM Lab",
    research: "Kutatási radar",
    companies: "AI cégek",
    github: "GitHub Top 10",
    saved: "Mentve későbbre",
    mustRead: "TOP 3 · KÖTELEZŐ",
    feed: "A HÉT ÉLŐ ADATFOLYAMA",
    why: "MIÉRT FONTOS",
    open: "Megnyitás",
    read: "Elolvastam",
    save: "Mentés",
    close: "Bezárás",
    empty: "Ebben a nézetben még nincs elem.",
    sample: "Ez a heti kiadás még üres — a napi automatikus futás tölti fel.",
    tracked: "FIGYELT REPO",
  },
  en: {
    live: "LIVE ISSUE",
    archived: "ARCHIVED ISSUE",
    categories: "Categories",
    panel: "Progress & to-do",
    updated: "Daily refresh",
    archive: "Weekly close",
    all: "Current radar",
    local: "Local LLM Lab",
    research: "Research radar",
    companies: "AI companies",
    github: "GitHub Top 10",
    saved: "Saved for later",
    mustRead: "TOP 3 · MUST READ",
    feed: "THE WEEK'S LIVE SIGNAL",
    why: "WHY IT MATTERS",
    open: "Open source",
    read: "Mark as read",
    save: "Save",
    close: "Close",
    empty: "Nothing in this view yet.",
    sample: "This week's issue is still empty — the daily automated run fills it.",
    tracked: "TRACKED REPO",
  },
} as const;

const filters: Array<{
  id: Filter;
  icon: typeof Radar;
  key: keyof (typeof ui)["hu"];
}> = [
  { id: "all", icon: Radar, key: "all" },
  { id: "local", icon: Zap, key: "local" },
  { id: "research", icon: FlaskConical, key: "research" },
  { id: "companies", icon: Building2, key: "companies" },
  { id: "github", icon: GitFork, key: "github" },
  { id: "saved", icon: Bookmark, key: "saved" },
];

export function DigestDashboard({
  issue: currentIssue,
  items: digestItems,
  githubTop10,
  archived = false,
  preview,
}: {
  issue: CurrentIssue;
  items: DigestItem[];
  githubTop10: GithubTopEntry[];
  /** A closed week opened from /archive: same reading UI, no "live" framing. */
  archived?: boolean;
  /** The offline preview (app/dev/preview): seeded reader state, no network. */
  preview?: ReaderPreview;
}) {
  const { language } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const { store, states, todos, syncing } = useReaderState(preview);
  useModelContextTools(store);
  const t = ui[language];

  const visibleItems = useMemo(() => {
    if (filter === "all") return digestItems;
    if (filter === "saved") return digestItems.filter((item) => states[item.id]?.saved);
    return digestItems.filter((item) => item.category === filter);
  }, [digestItems, filter, states]);

  const readCount = digestItems.filter((item) => states[item.id]?.read).length;
  const progress = digestItems.length ? Math.round((readCount / digestItems.length) * 100) : 0;
  const openTodos = todos.filter((todo) => !todo.done).length;

  function deleteTodo(id: number) {
    const removal = store.removeTodo(id);
    if (removal) toasts.show({ kind: "todoDeleted", ...removal });
  }

  // Rendered twice: as the 2xl side column, and inside the header Sheet below 2xl.
  const readerPanel = (
    <ReaderPanel
      language={language}
      progress={progress}
      readCount={readCount}
      total={digestItems.length}
      syncing={syncing}
      todos={todos}
      onAdd={(text) => store.addTodo(text)}
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
            <p className="font-display text-lg leading-none">{currentIssue.label}</p>
          </div>
        </div>
        <Sheet modal={false}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={t.panel}
              className="h-10 shrink-0 rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper sm:h-9 2xl:hidden"
            >
              <ListTodo /> {progress}%{openTodos > 0 && <span className="text-signal">· {openTodos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            closeLabel={t.close}
            // Focusing the to-do input on open would pop the phone keyboard over the panel.
            onOpenAutoFocus={(event) => event.preventDefault()}
            // Non-modal, so the undo toast above it stays clickable, reachable by Tab and announced.
            onInteractOutside={(event) => {
              if (isUndoToast(event.target)) event.preventDefault();
            }}
            className="w-[88vw] max-w-sm overflow-y-auto border-l-2 border-ink bg-cream p-5 pt-12 text-ink"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.panel}</SheetTitle>
            </SheetHeader>
            {readerPanel}
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* The chip bar belongs to this column, so the 2xl panel beside it is not covered. */}
        <div className="min-w-0">
          <nav
            aria-label={t.categories}
            className="sticky top-16 z-10 flex gap-2 overflow-x-auto border-b-2 border-ink bg-cream px-4 py-2 scrollbar-none sm:px-7"
          >
            {filters.map(({ id, icon: Icon, key }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className="focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs aria-pressed:bg-signal"
              >
                <Icon className="size-3.5" /> {t[key]}
              </button>
            ))}
          </nav>
          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            <section className="relative overflow-hidden border-2 border-ink bg-ink px-5 py-7 text-paper sm:px-8 sm:py-9">
              <div className="signal-grid" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                {/* Sized in cqi, not vw: the sidebar and panel make this column much narrower than the viewport. */}
                <div className="min-w-0 @container">
                  <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-paper/55">
                    <span className="border border-paper/30 px-2 py-1">AUTO / 自動</span>
                    <span>{t.updated}: {currentIssue.updated}</span>
                  </div>
                  <h1 className="max-w-4xl font-display text-[clamp(2.6rem,15cqi,8rem)] leading-[0.77] tracking-[-0.07em]">
                    AI WEEKLY<span className="text-signal">{"//"}</span>
                  </h1>
                  <p className="mt-5 max-w-2xl font-mono text-sm leading-6 text-paper/65">
                    Local models · research · frontier companies · repositories
                  </p>
                </div>
                <div className="border-l border-paper/25 pl-5 font-mono text-xs leading-6 text-paper/60">
                  <p className="text-signal">{t.archive}</p>
                  <p className="text-lg font-bold text-paper">{currentIssue.archiveAt}</p>
                  <p>STATUS: {archived ? "FROZEN" : "COLLECTING"}</p>
                </div>
              </div>
            </section>

            {!digestItems.length && !archived && (
              <div className="mt-4 border border-signal/50 bg-signal/10 px-4 py-3 font-mono text-xs leading-5 text-ink/70">
                ※ {t.sample}
              </div>
            )}

            {filter === "github" ? (
              <section className="mt-9">
                <SectionLabel icon={GitFork} label="GITHUB / TOP 10" />
                <div className="grid gap-3 md:grid-cols-2">
                  {githubTop10.map(([repo, focus, url], index) => (
                    <a
                      key={repo}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-4 border-2 border-ink bg-paper p-4 transition hover:-translate-y-0.5 hover:bg-signal"
                    >
                      <span className="font-display text-3xl text-signal group-hover:text-ink">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-bold">{repo}</span>
                        <span className="block text-sm text-ink/55 group-hover:text-ink/75">{focus}</span>
                      </span>
                      <span className="hidden font-mono text-[10px] sm:inline">{t.tracked}</span>
                      <ExternalLink className="size-4" />
                    </a>
                  ))}
                </div>
              </section>
            ) : (
              <>
                {filter === "all" && (
                  <section className="mt-9 @container">
                    <SectionLabel icon={Zap} label={t.mustRead} />
                    <div className="grid gap-4 @3xl:grid-cols-3">
                      {digestItems.filter((item) => item.mustRead).map((item, index) => (
                        <article key={item.id} className="must-card border-2 border-ink bg-paper p-5">
                          <div className="mb-10 flex items-start justify-between">
                            <span className="font-display text-5xl text-signal">0{index + 1}</span>
                            <span className="border border-ink px-2 py-1 font-mono text-[10px]">{item.score}/100</span>
                          </div>
                          <h2 className="font-display text-2xl leading-[1.02]">{item.title[language]}</h2>
                          <a href={item.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 font-mono text-xs text-signal hover:underline">
                            {item.source} <ChevronRight className="size-3" />
                          </a>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-11">
                  <SectionLabel icon={Newspaper} label={t.feed} />
                  <div className="space-y-4">
                    {visibleItems.length ? visibleItems.map((item) => {
                      const state = states[item.id] ?? EMPTY_ITEM_STATE;
                      return (
                        <article key={item.id} className={`story-card border-2 border-ink bg-paper p-5 sm:p-6 ${state.read ? "story-read" : ""}`}>
                          <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-5">
                            {/* A row of meta on narrow screens, the 96px gutter from lg up. */}
                            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px] leading-5 text-ink/55 lg:block">
                              <p className="text-signal">{item.publishedLabel}</p>
                              <p className="lg:mt-2">
                                SCORE <span className="font-display text-xl text-ink lg:block lg:text-3xl">{item.score}</span>
                              </p>
                              <p className="flex items-center gap-1 lg:mt-2"><Clock3 className="size-3" /> {item.readMinutes} MIN</p>
                            </div>
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <p className="font-mono text-[11px] tracking-[0.12em] text-signal">{item.source}</p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t.save}
                                    onClick={() => store.toggleFlag(item.id, "saved")}
                                    className="size-10 rounded-full hover:bg-signal/15 sm:size-8"
                                  >
                                    {state.saved ? <BookmarkCheck className="text-signal" /> : <Bookmark />}
                                  </Button>
                                  <label className="flex min-h-10 cursor-pointer items-center gap-2 font-mono text-[11px] sm:min-h-0">
                                    <Checkbox
                                      checked={state.read}
                                      onCheckedChange={(checked) => store.setFlag(item.id, "read", checked === true)}
                                      className="border-ink data-[state=checked]:border-signal data-[state=checked]:bg-signal data-[state=checked]:text-ink"
                                    />
                                    {t.read}
                                  </label>
                                </div>
                              </div>
                              <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.5rem,3vw,2.6rem)] leading-[0.98] tracking-tight [overflow-wrap:anywhere]">{item.title[language]}</h2>
                              <p className="mt-4 max-w-3xl text-base leading-7 text-ink/72">{item.summary[language]}</p>
                              <div className="mt-5 border-l-4 border-signal pl-4">
                                <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.why}</p>
                                <p className="mt-1 text-sm leading-6">{item.why[language]}</p>
                              </div>
                              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap gap-2">
                                  {item.tags.map((tag) => <span key={tag} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
                                </div>
                                <Button asChild variant="ink">
                                  <a href={item.url} target="_blank" rel="noreferrer">{t.open} <ExternalLink /></a>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    }) : (
                      <div className="border-2 border-dashed border-ink/35 p-10 text-center font-mono text-sm text-ink/55">{t.empty}</div>
                    )}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>

        <aside className="hidden border-l-2 border-ink bg-cream px-5 py-7 2xl:sticky 2xl:top-16 2xl:block 2xl:h-[calc(100dvh-4rem)] 2xl:overflow-y-auto">
          {readerPanel}
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: typeof Radar; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b-2 border-ink pb-3">
      <span className="grid size-8 place-items-center bg-signal"><Icon className="size-4" /></span>
      <h2 className="font-mono text-xs font-bold tracking-[0.15em]">{label}</h2>
    </div>
  );
}
