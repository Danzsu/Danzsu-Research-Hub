// One undo toast at a time (spec 1.3). Framework-free, so the "every action settles exactly once"
// rule runs under node --test; app/components/undo-toast.tsx renders it.

export type ToastEntry<Kind extends string> = {
  id: number;
  kind: Kind;
  /** Offered as the Undo button. */
  undo?: () => void;
  /** Makes the action final: runs when the toast times out, is replaced, or the page is closing. */
  commit?: () => void;
};

export function createToastQueue<Kind extends string>() {
  let current: ToastEntry<Kind> | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();

  function set(next: ToastEntry<Kind> | null) {
    current = next;
    for (const listener of listeners) listener();
  }

  /** Clears the toast if `id` is still the one showing, so a late timer or a second click finds nothing. */
  function take(id: number): ToastEntry<Kind> | null {
    if (current?.id !== id) return null;
    const entry = current;
    set(null);
    return entry;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    /** Shows a toast; the one it replaces becomes final. */
    show(entry: Omit<ToastEntry<Kind>, "id">): number {
      const replaced = current;
      const id = nextId++;
      set({ ...entry, id });
      replaced?.commit?.();
      return id;
    },
    undo: (id: number) => take(id)?.undo?.(),
    /** Timed out: the action stands. */
    dismiss: (id: number) => take(id)?.commit?.(),
    /** The page is going away: make the pending action final now. */
    flush: () => {
      if (current) take(current.id)?.commit?.();
    },
  };
}
