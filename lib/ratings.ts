// Ratings (G1 spec 3): 👎 −1, 👍 1, ❤ 2 on a Radar item, a Library post or a GitHub repo. Framework-free, so
// node --test runs it; app/components/rating-control.tsx binds the store to React.

export type RatingValue = -1 | 1 | 2;
export type RatingKind = "item" | "post" | "repo";
export type RatingTarget = { kind: RatingKind; id: string };
export type RatingWrite = { action: "set_rating"; kind: RatingKind; id: string; value: RatingValue | null };
/** A page's ratings, by ratingKey. */
export type Ratings = Record<string, RatingValue>;

export const RATING_ID_MAX = 200;

/** The id a rating is stored under: a repo by its lowercase `owner/repo`, so one rating holds every week. */
export const ratingTargetId = ({ kind, id }: RatingTarget) => (kind === "repo" ? id.toLowerCase() : id);
export const ratingKey = (target: RatingTarget) => `${target.kind}:${ratingTargetId(target)}`;

/** Pressing the active value clears it (B spec 2.1). */
export const nextRating = (current: RatingValue | null, pressed: RatingValue): RatingValue | null => (current === pressed ? null : pressed);

/** The disliked entries at the end, every other order kept: a server-ordered list's 👎 (G1 spec 3). */
export function downLast<T>(list: T[], disliked: (entry: T) => boolean): T[] {
  return [...list.filter((entry) => !disliked(entry)), ...list.filter(disliked)];
}

/** The Library's order: a 👎 post at the end (G1 spec 3). */
export const postsDownLast = <T extends { id: number }>(posts: T[], ratings: Ratings): T[] =>
  downLast(posts, (post) => ratings[ratingKey({ kind: "post", id: String(post.id) })] === -1);

/** The GitHub tab's `?rating=`: the value it keeps, null for the unrated. */
export const RATING_FILTERS = { heart: 2, up: 1, down: -1, none: null } as const;
export type RatingFilter = keyof typeof RATING_FILTERS;
export const ratingFilter = (param: string | undefined): RatingFilter | undefined =>
  param !== undefined && Object.hasOwn(RATING_FILTERS, param) ? (param as RatingFilter) : undefined;

/** What a Radar page rates: the week's items and its repos. */
export const radarTargets = (items: { id: string }[], repos: { repo: string }[]): RatingTarget[] => [
  ...items.map((item) => ({ kind: "item" as const, id: item.id })),
  ...repos.map((entry) => ({ kind: "repo" as const, id: entry.repo })),
];

/**
 * The ratings this tab has given, over each page's render. A press shows at once; the writes go out per
 * target in click order, and when the newest fails the target falls back to the last value the server
 * confirmed (like lib/reader-store.ts). Back restores a page's cached render, whose values predate the
 * press, so a reader asks `valueOf` with the render's value as the fallback.
 */
export function createRatingStore(send: (write: RatingWrite) => Promise<unknown>, onError: () => void) {
  let rated: ReadonlyMap<string, RatingValue | null> = new Map();
  const listeners = new Set<() => void>();
  const confirmed = new Map<string, RatingValue | null>();
  const latest = new Map<string, number>();
  const queues = new Map<string, Promise<void>>();

  const show = (key: string, value: RatingValue | null) => {
    rated = new Map(rated).set(key, value);
    for (const listener of listeners) listener();
  };
  const valueOf = (key: string, fallback: RatingValue | null) => (rated.has(key) ? (rated.get(key) ?? null) : fallback);

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => rated,
    valueOf,
    press(target: RatingTarget, fallback: RatingValue | null, pressed: RatingValue): Promise<void> {
      const key = ratingKey(target);
      const before = valueOf(key, fallback);
      if (!confirmed.has(key)) confirmed.set(key, before);
      const value = nextRating(before, pressed);
      const seq = (latest.get(key) ?? 0) + 1;
      latest.set(key, seq);
      show(key, value);
      const write: RatingWrite = { action: "set_rating", kind: target.kind, id: ratingTargetId(target), value };
      const done = (queues.get(key) ?? Promise.resolve()).then(() => send(write)).then(
        () => {
          confirmed.set(key, value);
        },
        () => {
          if (latest.get(key) === seq) show(key, confirmed.get(key) ?? null);
          onError();
        },
      );
      queues.set(key, done);
      return done;
    },
  };
}

export type RatingStore = ReturnType<typeof createRatingStore>;
