import { parseId } from "./pipeline/util.ts";
import { TODO_TEXT_MAX } from "./state.ts";

// The reader's own state (read / later flags, to-dos) with optimistic writes. Framework-free, so the
// ordering and rollback rules run under node --test; app/components/use-reader-state.ts binds it to React.

export type ItemState = { read: boolean; saved: boolean };
export type Flag = keyof ItemState;
export type Todo = { id: number; itemId: string | null; text: string; done: boolean };
/** GET /api/state. */
export type ReaderData = { states: Record<string, ItemState>; todos: Todo[] };
export type ReaderSnapshot = ReaderData & {
  /** The states as first loaded. The feed sorts by these, so a card marked read now stays in place until the next visit. */
  loadedStates: Record<string, ItemState>;
  syncing: boolean;
};
/** POST /api/state. */
export type StateWrite =
  | { action: "set_read" | "set_saved"; itemId: string; value: boolean }
  | { action: "add_todo"; text: string; itemId?: string }
  | { action: "set_todo"; id: number; value: boolean }
  | { action: "delete_todo"; id: number };
export type SendState = (write: StateWrite) => Promise<{ id?: number }>;
/** A hidden to-do. Call exactly one of the two, once; the undo toast guarantees that. */
export type PendingRemoval = { undo: () => void; commit: () => void };

export const EMPTY_ITEM_STATE: ItemState = { read: false, saved: false };
const FLAG_ACTIONS = { read: "set_read", saved: "set_saved" } as const;

/** Library posts keep their read flag in item_states too. Radar ids look like `local-2026-W38-…`, so `post:` never collides. */
export const POST_STATE_PREFIX = "post:";
export const postStateKey = (postId: number) => `${POST_STATE_PREFIX}${postId}`;

export function readPostIds(itemIds: string[]): Set<number> {
  const ids = new Set<number>();
  for (const itemId of itemIds) {
    const postId = itemId.startsWith(POST_STATE_PREFIX) ? parseId(itemId.slice(POST_STATE_PREFIX.length)) : null;
    if (postId !== null) ids.add(postId);
  }
  return ids;
}

export async function postState(write: StateWrite): Promise<{ id?: number }> {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(write),
    // A delete made final by `pagehide` has to outlive the tab.
    keepalive: true,
  });
  if (!response.ok) throw new Error(`state write ${response.status}`);
  return (await response.json()) as { id?: number };
}

export async function loadState(): Promise<ReaderData> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`state read ${response.status}`);
  return (await response.json()) as ReaderData;
}

/** No network, for the offline preview and tests. `fail` rejects every write the way an offline fetch does. */
export function memorySend(fail = false): SendState {
  let nextId = 1000;
  return async (write) => {
    if (fail) throw new TypeError("Failed to fetch");
    return write.action === "add_todo" ? { id: nextId++ } : {};
  };
}

export function createReaderStore(send: SendState, onError: () => void, initial?: ReaderData) {
  let snapshot: ReaderSnapshot = {
    states: initial?.states ?? {},
    loadedStates: initial?.states ?? {},
    todos: initial?.todos ?? [],
    syncing: !initial,
  };
  const listeners = new Set<() => void>();
  const queues = new Map<string, Promise<void>>();
  /** The last value the server acknowledged, per write key. */
  const confirmed = new Map<string, boolean>();
  /** The newest write per key: only its failure decides what is shown. */
  const newest = new Map<string, number>();
  /** Flags changed before the first load finished; the load must not overwrite them. */
  const changedEarly: { itemId: string; flag: Flag }[] = [];
  let writeCount = 0;
  let nextTempId = -1;

  function update(next: Partial<ReaderSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  /** Runs `task` after every earlier write under `key` has settled: writes reach the server in click order. `task` never rejects. */
  function queue(key: string, task: () => Promise<void>) {
    queues.set(key, (queues.get(key) ?? Promise.resolve()).then(task));
  }

  function writeBoolean(key: string, current: boolean, value: boolean, show: (value: boolean) => void, write: StateWrite) {
    if (!confirmed.has(key)) confirmed.set(key, current);
    const writeId = ++writeCount;
    newest.set(key, writeId);
    show(value);
    queue(key, () =>
      send(write).then(
        () => {
          confirmed.set(key, value);
        },
        () => {
          onError();
          if (newest.get(key) === writeId) show(confirmed.get(key) ?? current);
        },
      ),
    );
  }

  function showFlag(itemId: string, flag: Flag, value: boolean) {
    const state = snapshot.states[itemId] ?? EMPTY_ITEM_STATE;
    update({ states: { ...snapshot.states, [itemId]: { ...state, [flag]: value } } });
  }

  function setFlag(itemId: string, flag: Flag, value: boolean): boolean {
    const current = (snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag];
    if (current === value) return false;
    if (snapshot.syncing) changedEarly.push({ itemId, flag });
    writeBoolean(`${flag}:${itemId}`, current, value, (shown) => showFlag(itemId, flag, shown), {
      action: FLAG_ACTIONS[flag],
      itemId,
      value,
    });
    return true;
  }

  function setTodos(todos: Todo[]) {
    update({ todos });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    /** Resolves once every write queued so far has settled. */
    settled: async () => {
      await Promise.all(queues.values());
    },
    /** The first GET /api/state. Flags and to-dos the reader changed while it loaded keep their local value. */
    hydrate(data: ReaderData) {
      const states = { ...data.states };
      for (const { itemId, flag } of changedEarly) {
        states[itemId] = { ...(states[itemId] ?? EMPTY_ITEM_STATE), [flag]: (snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag] };
      }
      const localIds = new Set(snapshot.todos.map((item) => item.id));
      update({
        states,
        loadedStates: data.states,
        todos: [...snapshot.todos, ...data.todos.filter((item) => !localIds.has(item.id))],
        syncing: false,
      });
    },
    hydrateFailed() {
      update({ syncing: false });
    },
    setFlag,
    toggleFlag: (itemId: string, flag: Flag) => setFlag(itemId, flag, !(snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag]),
    /** False when nothing was added: blank text, or the item already has a to-do. Trimmed and capped like parseStateAction (lib/state.ts). */
    addTodo(rawText: string, itemId?: string): boolean {
      const text = rawText.trim().slice(0, TODO_TEXT_MAX);
      if (!text || (itemId !== undefined && snapshot.todos.some((item) => item.itemId === itemId))) return false;
      const tempId = nextTempId--;
      setTodos([{ id: tempId, itemId: itemId ?? null, text, done: false }, ...snapshot.todos]);
      const write: StateWrite = itemId === undefined ? { action: "add_todo", text } : { action: "add_todo", text, itemId };
      queue(`todo:${tempId}`, () =>
        send(write)
          .then(({ id }) => {
            if (typeof id !== "number") throw new Error("add_todo answered without an id");
            setTodos(snapshot.todos.map((item) => (item.id === tempId ? { ...item, id } : item)));
          })
          .catch(() => {
            setTodos(snapshot.todos.filter((item) => item.id !== tempId));
            onError();
          }),
      );
      return true;
    },
    /** A negative id is a to-do the server has not answered for yet: there is nothing to address it by. */
    setTodoDone(id: number, done: boolean): boolean {
      const current = snapshot.todos.find((item) => item.id === id);
      if (id < 0 || !current || current.done === done) return false;
      const show = (value: boolean) => setTodos(snapshot.todos.map((item) => (item.id === id ? { ...item, done: value } : item)));
      writeBoolean(`todo:${id}`, current.done, done, show, { action: "set_todo", id, value: done });
      return true;
    },
    /** Hides the to-do now; `commit` deletes it on the server (restoring it if that fails), `undo` puts it back. */
    removeTodo(id: number): PendingRemoval | null {
      const index = snapshot.todos.findIndex((item) => item.id === id);
      if (id < 0 || index === -1) return null;
      const removed = snapshot.todos[index];
      const restore = () => {
        const todos = [...snapshot.todos];
        todos.splice(Math.min(index, todos.length), 0, removed);
        setTodos(todos);
      };
      setTodos(snapshot.todos.filter((item) => item.id !== id));
      return {
        undo: restore,
        commit: () =>
          queue(`todo:${id}`, () =>
            send({ action: "delete_todo", id }).then(
              () => undefined,
              () => {
                restore();
                onError();
              },
            ),
          ),
      };
    },
  };
}

export type ReaderStore = ReturnType<typeof createReaderStore>;
