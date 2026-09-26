import type { Localized } from "../data/digest-types.ts";
import { safeHref } from "./blocks.ts";
import type { MySource } from "./my-sources.ts";
import { detectSource, parseSubmittedUrl, type SourceKind } from "./pipeline/util.ts";

// The taiyaki link chat's logic, framework-free so node --test runs it: a message → a submission,
// the reader's own sources → the thread, and the live thread's polling rules. The panel
// (app/components/link-chat.tsx) binds it to React.

export type LinkMessage = { url: string; note: string | null; moreLinks: boolean } | { error: "no_link" };

const OPENING = /^[([{<'"„“‘«]+/;
const CLOSING = /[.,;:!?)\]}>'"”’»…]$/;
const count = (text: string, char: string) => text.split(char).length - 1;

/** True when the link's trailing `)` or `]` closes one it opened itself, not sentence punctuation:
 *  Wikipedia's `…/Taiyaki_(food)`, or IPv6's `http://[::1]`. */
function closesOwnBracket(link: string): boolean {
  const last = link.at(-1);
  if (last !== ")" && last !== "]") return false;
  const opener = last === ")" ? "(" : "[";
  return count(link, opener) >= count(link, last);
}

/** The link one whitespace-separated word holds, or null. Sentence punctuation around it is not part
 *  of it, but a bracket the link itself opened is (see `closesOwnBracket`). */
function linkIn(word: string): string | null {
  let link = word.replace(OPENING, "");
  while (CLOSING.test(link) && !closesOwnBracket(link)) link = link.slice(0, -1);
  return /^https?:\/\/\S/i.test(link) ? link : null;
}

/** The first link in `text` is the submission; the rest of the text, without that word and with its
 *  whitespace collapsed, is the note. Any further link stays in the note, and `moreLinks` says so. */
export function parseLinkMessage(text: string): LinkMessage {
  const words = text.split(/\s+/).filter(Boolean);
  const links = words.map(linkIn);
  const first = links.findIndex((link) => link !== null);
  if (first === -1) return { error: "no_link" };
  const note = words.filter((_, index) => index !== first).join(" ");
  return { url: links[first]!, note: note || null, moreLinks: links.filter((link) => link !== null).length > 1 };
}

export type ChatReply =
  | { state: "pending"; kind: SourceKind }
  | { state: "done"; postId: number; title: Localized }
  | { state: "failed"; error: string | null };

/** One submission in the thread: the reader's message (`href` already through safeHref) and the taiyaki's reply. */
export type ChatEntry = { id: number; url: string; href: string | undefined; note: string | null; reply: ChatReply };

function replyTo(source: MySource): ChatReply {
  if (source.status === "failed") return { state: "failed", error: source.error };
  if (source.status === "done" && source.post) return { state: "done", postId: source.post.id, title: source.post.title };
  return { state: "pending", kind: source.kind };
}

/** GET /api/sources/mine answers newest first; the thread reads oldest first, like a chat. */
export function toThread(sources: MySource[]): ChatEntry[] {
  return [...sources].reverse().map((source) => ({
    id: source.id,
    url: source.url,
    href: safeHref(source.url, source.url),
    note: source.note,
    reply: replyTo(source),
  }));
}

/** A local reply: it goes to the end of the thread, lives as long as the panel stays open, and is never saved. */
export type ChatNotice =
  | { kind: "no_link" | "more_links" | "invalid_url" | "network" | "signed_out" }
  | { kind: "already_submitted"; postId: number | null };

/** What a route answered: its status and its JSON body (`{}` when the body isn't a JSON object). */
export type Answer = { status: number; body: Record<string, unknown> };

/** The chat's three calls: GET /api/sources/mine, POST /api/sources, POST /api/sources/[id]/retry. */
export type ChatTransport = {
  mine(): Promise<Answer>;
  submit(url: string, note: string | null): Promise<Answer>;
  retry(sourceId: number): Promise<Answer>;
};

async function call(path: string, init?: RequestInit): Promise<Answer> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body: body && typeof body === "object" ? (body as Record<string, unknown>) : {} };
}

export const httpTransport: ChatTransport = {
  mine: () => call("/api/sources/mine"),
  submit: (url, note) => call("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, note }) }),
  retry: (sourceId) => call(`/api/sources/${sourceId}/retry`, { method: "POST" }),
};

/**
 * The offline preview's stand-in (local dev points at the production project): the seed is the
 * thread, a submission joins it as pending, and "Újra" sends a failed one back to pending. Nothing
 * is ever processed. `fail` rejects every write the way an offline fetch does; reads still answer.
 */
export function memoryTransport(seed: MySource[], fail: boolean): ChatTransport {
  let sources = seed;
  let nextId = -1000;
  const write = async (change: () => Answer) => {
    if (fail) throw new TypeError("Failed to fetch");
    return change();
  };
  return {
    mine: async () => ({ status: 200, body: { sources } }),
    submit: (url, note) =>
      write(() => {
        const parsed = parseSubmittedUrl(url);
        if (!parsed) return { status: 400, body: { error: "invalid_url" } };
        const source: MySource = {
          id: nextId--,
          url: parsed.toString(),
          kind: detectSource(parsed),
          status: "pending",
          error: null,
          note,
          createdAt: new Date().toISOString(),
          post: null,
        };
        sources = [source, ...sources];
        return { status: 202, body: { ok: true, id: source.id } };
      }),
    retry: (sourceId) =>
      write(() => {
        sources = sources.map((source) => (source.id === sourceId ? { ...source, status: "pending", error: null } : source));
        return { status: 202, body: { ok: true } };
      }),
  };
}

export const POLL_MS = 4000;
// ponytail: a source stuck in `pending` (a run killed past maxDuration) would poll for as long as the
// panel stays open; 150 × 4 s (10 min) is twice the ingest's maxDuration, like RefreshWhileProcessing.
export const MAX_POLLS = 150;

export type ChatSnapshot = {
  /** Null until the first answer. */
  sources: MySource[] | null;
  notices: ChatNotice[];
  /** The last GET /api/sources/mine failed; the next good one clears it. */
  unreachable: boolean;
  sending: boolean;
  /** Sources whose "Újra" is on its way. */
  retrying: number[];
};

const INITIAL: ChatSnapshot = { sources: null, notices: [], unreachable: false, sending: false, retrying: [] };

/** A refused submission or retry, as the reply the thread shows. */
function noticeFor({ status, body }: Answer): ChatNotice {
  if (status === 401) return { kind: "signed_out" };
  if (status === 400 && body.error === "invalid_url") return { kind: "invalid_url" };
  if (status === 409 && body.error === "already_submitted") {
    return { kind: "already_submitted", postId: typeof body.postId === "number" ? body.postId : null };
  }
  return { kind: "network" };
}

/**
 * The live thread. `open()` loads it, then polls every POLL_MS while the panel stays open, the tab is
 * visible (`isVisible`) and a source is pending (or the list never loaded because it was out of
 * reach), at most MAX_POLLS times; a submission or a retry loads it at once and restarts the count.
 * `close()` stops the polling and drops the local replies.
 */
export function createLinkChat(transport: ChatTransport, isVisible: () => boolean) {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();
  let open = false;
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Only the newest load may land: an older one answering late would put back a status that has moved on.
  let latest = 0;

  const set = (patch: Partial<ChatSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const say = (notice: ChatNotice) => set({ notices: [...snapshot.notices, notice] });

  function schedule() {
    clearTimeout(timer);
    // Before a first good answer there's no list to go by: ask again only if it was out of reach
    // (spec 3.3: the next good load clears that reply), not after a 401.
    const pending = snapshot.sources?.some((source) => source.status === "pending") ?? snapshot.unreachable;
    if (!open || !pending || polls >= MAX_POLLS) return;
    timer = setTimeout(() => {
      polls++;
      if (isVisible()) void load();
      else schedule();
    }, POLL_MS);
  }

  async function load() {
    const request = ++latest;
    let answer: Answer | null = null;
    try {
      answer = await transport.mine();
    } catch {
      // Offline: `answer` stays null, and the thread says it can't reach the list.
    }
    if (request !== latest) return;
    if (answer?.status === 200 && Array.isArray(answer.body.sources)) {
      set({ sources: answer.body.sources as MySource[], unreachable: false });
    } else if (answer?.status === 401) {
      if (!snapshot.notices.some((notice) => notice.kind === "signed_out")) say({ kind: "signed_out" });
    } else {
      set({ unreachable: true });
    }
    schedule();
  }

  async function reload() {
    polls = 0;
    await load();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    open() {
      open = true;
      void reload();
    },
    close() {
      open = false;
      clearTimeout(timer);
      latest++;
      set({ notices: [], unreachable: false });
    },
    /** True when the link went in, so the panel clears the field; on every other answer the text stays. */
    async send(text: string): Promise<boolean> {
      if (snapshot.sending) return false;
      const message = parseLinkMessage(text);
      if ("error" in message) {
        say({ kind: "no_link" });
        return false;
      }
      set({ sending: true });
      try {
        const answer = await transport.submit(message.url, message.note);
        if (answer.status !== 202) {
          say(noticeFor(answer));
          return false;
        }
        if (message.moreLinks) say({ kind: "more_links" });
        await reload();
        return true;
      } catch {
        say({ kind: "network" });
        return false;
      } finally {
        set({ sending: false });
      }
    },
    /** "Újra": one request per source at a time. A 409 means another click already started it. */
    async retry(sourceId: number): Promise<void> {
      if (snapshot.retrying.includes(sourceId)) return;
      set({ retrying: [...snapshot.retrying, sourceId] });
      try {
        const answer = await transport.retry(sourceId);
        if (answer.status === 202 || answer.status === 409) await reload();
        else say(noticeFor(answer));
      } catch {
        say({ kind: "network" });
      } finally {
        set({ retrying: snapshot.retrying.filter((id) => id !== sourceId) });
      }
    },
  };
}

export type LinkChat = ReturnType<typeof createLinkChat>;
