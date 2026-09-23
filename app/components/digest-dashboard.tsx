"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FlaskConical,
  GitFork,
  Languages,
  ListTodo,
  Newspaper,
  Plus,
  Radar,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  currentIssue,
  digestItems,
  githubTop10,
  type DigestCategory,
  type Language,
} from "@/data/digest";

type ItemState = { read: boolean; saved: boolean };
type Todo = { id: number; itemId: string | null; text: string; done: boolean };
type Filter = "all" | DigestCategory | "saved";

const ui = {
  hu: {
    live: "ÉLŐ KIADÁS",
    updated: "Napi frissítés",
    archive: "Heti zárás",
    all: "Aktuális radar",
    local: "Local LLM Lab",
    research: "Kutatási radar",
    companies: "AI cégek",
    github: "GitHub Top 10",
    saved: "Mentve későbbre",
    archiveNav: "Heti archívum",
    mustRead: "TOP 3 · KÖTELEZŐ",
    feed: "A HÉT ÉLŐ ADATFOLYAMA",
    why: "MIÉRT FONTOS",
    open: "Megnyitás",
    read: "Elolvastam",
    save: "Mentés",
    progress: "Heti haladás",
    todo: "Személyes To-do",
    todoPlaceholder: "Mit olvassak el később?",
    add: "Hozzáadás",
    empty: "Ebben a nézetben még nincs elem.",
    sample: "A bemutató tartalom az első automatikus futáskor friss hírekre cserélődik.",
    signOut: "Kijelentkezés",
    tracked: "FIGYELT REPO",
  },
  en: {
    live: "LIVE ISSUE",
    updated: "Daily refresh",
    archive: "Weekly close",
    all: "Current radar",
    local: "Local LLM Lab",
    research: "Research radar",
    companies: "AI companies",
    github: "GitHub Top 10",
    saved: "Saved for later",
    archiveNav: "Weekly archive",
    mustRead: "TOP 3 · MUST READ",
    feed: "THE WEEK'S LIVE SIGNAL",
    why: "WHY IT MATTERS",
    open: "Open source",
    read: "Mark as read",
    save: "Save",
    progress: "Weekly progress",
    todo: "Personal to-do",
    todoPlaceholder: "What should I read later?",
    add: "Add",
    empty: "Nothing in this view yet.",
    sample: "Demo content is replaced by fresh findings after the first automated run.",
    signOut: "Sign out",
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

async function mutate(payload: Record<string, unknown>) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("State update failed");
  return response.json();
}

export function DigestDashboard({
  displayName,
  email,
  signOutPath,
}: {
  displayName: string;
  email: string;
  signOutPath: string;
}) {
  const [language, setLanguage] = useState<Language>("hu");
  const [filter, setFilter] = useState<Filter>("all");
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoText, setTodoText] = useState("");
  const [syncing, setSyncing] = useState(true);
  const t = ui[language];

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        states: Record<string, ItemState>;
        todos: Todo[];
      };
      setStates(data.states);
      setTodos(data.todos);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };
    register({
      name: "mark_digest_item_read",
      title: "Mark digest item read",
      description: "Mark one visible AI digest item as read for the signed-in reader.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string" }, value: { type: "boolean" } },
        required: ["itemId", "value"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const value = input as { itemId: string; value: boolean };
        await mutate({ action: "set_read", ...value });
        await refreshState();
        return { itemId: value.itemId, read: value.value };
      },
    });
    register({
      name: "add_digest_todo",
      title: "Add digest to-do",
      description: "Add a short personal follow-up to the signed-in reader's digest list.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1, maxLength: 180 } },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const value = input as { text: string };
        await mutate({ action: "add_todo", text: value.text });
        await refreshState();
        return { created: true };
      },
    });
    return () => lifecycle.abort();
  }, [refreshState]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return digestItems;
    if (filter === "saved") return digestItems.filter((item) => states[item.id]?.saved);
    return digestItems.filter((item) => item.category === filter);
  }, [filter, states]);

  const readCount = digestItems.filter((item) => states[item.id]?.read).length;
  const progress = Math.round((readCount / digestItems.length) * 100);

  async function setItemState(itemId: string, key: "read" | "saved", value: boolean) {
    setStates((current) => ({
      ...current,
      [itemId]: { read: false, saved: false, ...current[itemId], [key]: value },
    }));
    try {
      await mutate({
        action: key === "read" ? "set_read" : "set_saved",
        itemId,
        value,
      });
    } catch {
      await refreshState();
    }
  }

  async function addTodo() {
    const text = todoText.trim();
    if (!text) return;
    setTodoText("");
    await mutate({ action: "add_todo", text });
    await refreshState();
  }

  async function setTodo(id: number, value: boolean) {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, done: value } : todo)));
    await mutate({ action: "set_todo", id, value });
  }

  async function deleteTodo(id: number) {
    setTodos((current) => current.filter((todo) => todo.id !== id));
    await mutate({ action: "delete_todo", id });
  }

  return (
    <SidebarProvider className="min-h-screen bg-ink text-paper">
      <Sidebar className="border-r-0 bg-ink text-paper" collapsible="offcanvas">
        <SidebarHeader className="border-b border-paper/15 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-signal bg-signal text-ink">
              <Radar className="size-5" />
            </span>
            <div>
              <p className="font-display text-2xl leading-none tracking-tight">NEON</p>
              <p className="font-display text-2xl leading-none text-signal">RADAR</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupLabel className="font-mono text-[11px] tracking-[0.18em] text-paper/45">
              SIGNAL / JEL
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filters.map(({ id, icon: Icon, key }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={filter === id}
                      onClick={() => setFilter(id)}
                      className="h-10 rounded-none border-l-2 border-transparent font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper data-[active=true]:border-signal data-[active=true]:bg-signal/10 data-[active=true]:text-signal"
                    >
                      <Icon />
                      <span>{t[key]}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="h-10 rounded-none border-l-2 border-transparent font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper"
                  >
                    <a href="/archive">
                      <Archive />
                      <span>{t.archiveNav}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-paper/15 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-paper text-ink">
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate font-mono text-[10px] text-paper/45">{email}</p>
            </div>
          </div>
          <a href={signOutPath} className="mt-3 block font-mono text-[11px] text-paper/45 hover:text-signal">
            {t.signOut} →
          </a>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-cream text-ink">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b-2 border-ink bg-cream px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="rounded-none border border-ink bg-transparent md:hidden" />
            <span className="live-pulse" />
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-signal">{t.live}</p>
              <p className="font-display text-lg leading-none">{currentIssue.label}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLanguage(language === "hu" ? "en" : "hu")}
            className="rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper"
          >
            <Languages /> {language.toUpperCase()}
          </Button>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            <section className="relative overflow-hidden border-2 border-ink bg-ink px-5 py-7 text-paper sm:px-8 sm:py-9">
              <div className="signal-grid" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-paper/55">
                    <span className="border border-paper/30 px-2 py-1">AUTO / 自動</span>
                    <span>{t.updated}: {currentIssue.updated}</span>
                  </div>
                  <h1 className="max-w-4xl font-display text-[clamp(3.4rem,9vw,8rem)] leading-[0.77] tracking-[-0.07em]">
                    AI WEEKLY<span className="text-signal">//</span>
                  </h1>
                  <p className="mt-5 max-w-2xl font-mono text-sm leading-6 text-paper/65">
                    Local models · research · frontier companies · repositories
                  </p>
                </div>
                <div className="border-l border-paper/25 pl-5 font-mono text-xs leading-6 text-paper/60">
                  <p className="text-signal">{t.archive}</p>
                  <p className="text-lg font-bold text-paper">{currentIssue.archiveAt}</p>
                  <p>STATUS: COLLECTING</p>
                </div>
              </div>
            </section>

            <div className="mt-4 border border-signal/50 bg-signal/10 px-4 py-3 font-mono text-xs leading-5 text-ink/70">
              ※ {t.sample}
            </div>

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
                  <section className="mt-9">
                    <SectionLabel icon={Zap} label={t.mustRead} />
                    <div className="grid gap-4 lg:grid-cols-3">
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
                      const state = states[item.id] ?? { read: false, saved: false };
                      return (
                        <article key={item.id} className={`story-card border-2 border-ink bg-paper p-5 sm:p-6 ${state.read ? "story-read" : ""}`}>
                          <div className="grid gap-5 lg:grid-cols-[96px_minmax(0,1fr)]">
                            <div className="font-mono text-[10px] leading-5 text-ink/55">
                              <p className="text-signal">{item.publishedLabel}</p>
                              <p className="mt-2">SCORE</p>
                              <p className="font-display text-3xl text-ink">{item.score}</p>
                              <p className="mt-2 flex items-center gap-1"><Clock3 className="size-3" /> {item.readMinutes} MIN</p>
                            </div>
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <p className="font-mono text-[11px] tracking-[0.12em] text-signal">{item.source}</p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t.save}
                                    onClick={() => void setItemState(item.id, "saved", !state.saved)}
                                    className="rounded-full hover:bg-signal/15"
                                  >
                                    {state.saved ? <BookmarkCheck className="text-signal" /> : <Bookmark />}
                                  </Button>
                                  <label className="flex items-center gap-2 font-mono text-[11px]">
                                    <Checkbox
                                      checked={state.read}
                                      onCheckedChange={(checked) => void setItemState(item.id, "read", checked === true)}
                                      className="border-ink data-[state=checked]:border-signal data-[state=checked]:bg-signal data-[state=checked]:text-ink"
                                    />
                                    {t.read}
                                  </label>
                                </div>
                              </div>
                              <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.7rem,3vw,2.6rem)] leading-[0.98] tracking-tight">{item.title[language]}</h2>
                              <p className="mt-4 max-w-3xl text-base leading-7 text-ink/72">{item.summary[language]}</p>
                              <div className="mt-5 border-l-4 border-signal pl-4">
                                <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.why}</p>
                                <p className="mt-1 text-sm leading-6">{item.why[language]}</p>
                              </div>
                              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap gap-2">
                                  {item.tags.map((tag) => <span key={tag} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
                                </div>
                                <Button asChild className="rounded-none bg-ink font-mono text-xs text-paper hover:bg-signal hover:text-ink">
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

          <aside className="border-l-2 border-ink bg-[#f8e8b4] px-5 py-7 xl:sticky xl:top-16 xl:h-[calc(100vh-4rem)] xl:overflow-y-auto">
            <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_#141414]">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs tracking-[0.14em]">{t.progress}</p>
                <span className="font-display text-3xl text-signal">{progress}%</span>
              </div>
              <Progress value={progress} className="mt-4 h-3 rounded-none bg-ink/15 [&_[data-slot=progress-indicator]]:bg-signal" />
              <p className="mt-3 font-mono text-[11px] text-ink/55">{readCount} / {digestItems.length} · {syncing ? "SYNC…" : "SYNCED"}</p>
            </section>

            <section className="mt-7">
              <div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-3">
                <div className="flex items-center gap-2">
                  <ListTodo className="size-5 text-signal" />
                  <h2 className="font-display text-2xl">{t.todo}</h2>
                </div>
                <span className="font-mono text-xs">{todos.filter((todo) => !todo.done).length}</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={todoText}
                  onChange={(event) => setTodoText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void addTodo(); }}
                  placeholder={t.todoPlaceholder}
                  className="min-w-0 flex-1 rounded-none border-2 border-ink bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-signal"
                />
                <Button size="icon" onClick={() => void addTodo()} aria-label={t.add} className="rounded-none border-2 border-ink bg-signal text-ink hover:bg-ink hover:text-paper">
                  <Plus />
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {todos.map((todo) => (
                  <div key={todo.id} className="group flex items-start gap-3 border border-ink/25 bg-paper/60 p-3">
                    <Checkbox
                      checked={todo.done}
                      onCheckedChange={(checked) => void setTodo(todo.id, checked === true)}
                      className="mt-0.5 border-ink data-[state=checked]:bg-ink"
                    />
                    <span className={`min-w-0 flex-1 text-sm leading-5 ${todo.done ? "text-ink/40 line-through" : ""}`}>{todo.text}</span>
                    <Button variant="ghost" size="icon-xs" onClick={() => void deleteTodo(todo.id)} aria-label="Delete" className="opacity-60 hover:bg-signal/20 group-hover:opacity-100">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {!todos.length && <p className="py-7 text-center font-mono text-xs text-ink/45">(づ ◕‿◕ )づ · QUEUE EMPTY</p>}
              </div>
            </section>

            <section className="mt-8 border-t-2 border-ink pt-5 font-mono text-[11px] leading-5 text-ink/55">
              <p className="flex items-center gap-2 text-signal"><Check className="size-3" /> INVITE-ONLY PROFILES</p>
              <p>DAILY RUNS · 07:00 / 18:00</p>
              <p>WEEKLY FREEZE · FRI 16:00</p>
            </section>
          </aside>
        </div>
      </SidebarInset>
    </SidebarProvider>
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
