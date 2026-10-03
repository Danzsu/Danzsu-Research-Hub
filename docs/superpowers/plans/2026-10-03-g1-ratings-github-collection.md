# G1 „Értékelés, GitHub-fül és Gyűjtemény” — implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tag 👎 / 👍 / ❤ értékelést adhasson a híreknek, a posztoknak és a repóknak. A ❤-es tételeket a Gyűjteményben, a repókat hétről hétre, pontszámmal az archívum GitHub-fülén lássa.

**Architecture:**
- **Az értékelések logikája:** keretrendszer-független `lib/ratings.ts` (típusok, kulcs, a store: azonnal mutat, kattintási sorrendben ír, a legutóbbi hiba esetén az utoljára megerősített értékre áll vissza).
- **Megjelenítés és írás:**
  - a React-oldal egy `RatingsProvider`-ből (`app/components/rating-control.tsx`) kapja a store-t; az app shell adja, az előnézet memóriás küldővel;
  - az írás a meglévő `POST /api/state` új `set_rating` műveletén megy;
  - a kezdőértéket a szerver adja oldalanként (`getRatings`).
- **Új adatok:**
  - a napi futás a repók pontszámát, csillagszámát és nyelvét is elmenti;
  - egy `security_invoker` nézet (`github_repos`) repónként összevonja a heteket az olvasó értékelésével; ez adja a GitHub-fület és a Gyűjtemény repóit.

**Tech Stack:** Next.js 16.3.4, React 19.2 (`useSyncExternalStore`), supabase-js 2.116.0, zod v4, Tailwind 4.2.1, `node --test` (`fakeDb`, route-hooks, render harness), Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-10-03-g1-ratings-github-collection-design.md` (alapja: `docs/superpowers/specs/2026-09-24-ux-signals-search-design.md` → 2. fejezet)

## Global Constraints

- **AGENTS.md hard rules:**
  - nincs `npx shadcn add`, nincs `supabase db push`, nincs push;
  - a migráció csak hozzáad, és a tulajdonos futtatja kézzel;
  - új függőség nincs;
  - a `lib/`-ben relatív `.ts` import;
  - komponensenként egy `{ hu, en }` copy-objektum;
  - nincs `NEXT_PUBLIC_` és nincs `dangerouslySetInnerHTML`;
  - az előnézet nem nyúl valódi adathoz (negatív azonosítók, memóriás küldők);
  - commit: Conventional Commits, kisbetűs, felszólító mód, explicit pathspec, attribution nélkül.
- **Commit előtt** mind az öt ellenőrzés zöld: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup` (lint 0/0, `Found 0 clones.`).
- **Tesztek:**
  - minden új teszt egy mutációs próbával bizonyítja, hogy nem üres;
  - a mockolt `console` hívásszámát ellenőrizni kell;
  - nincs osztálynév-teszt;
  - kiinduló szám: **717**.
- **Szó szerint:**
  - az értékek: 👎 = `-1`, 👍 = `1`, ❤ = `2`;
  - `target_kind` ∈ `item`, `post`, `repo`;
  - `target_id` legfeljebb 200 karakter, a repó kisbetűs `owner/repo`;
  - a művelet: `set_rating` (`{ kind, id, value | null }`); a hibakódok: `invalid_target`, `invalid_rating`;
  - a gyorsítótár kulcsa: `["closed-week", "v3"]`;
  - a GitHub-fül: `/archive/github`, 30 repó oldalanként (`GITHUB_PAGE`), `?rating=heart|up|down|none`, `?lang=`, `?page=` (1–20);
  - a Gyűjtemény: `/collection`, `?kind=item|post|repo`;
  - a migráció: `supabase/migrations/20261003000000_ratings_github_repos.sql`.
- **A migráció sorrendje:** a G1 kódját csak a migráció után szabad élesíteni, mert a Radar lekérdezése az új oszlopokat olvassa. Ezt a TODO.md rögzíti.

## Review Focus

1. **Egy repó különböző kis- és nagybetűkkel** (`Owner/Repo` a Top 10-ben, `owner/repo` a GitHub-fülön) ugyanazt az egy értékelést mutatja és írja. Az 1. feladat (`ratingKey`) és a 2. feladat (route) tesztje rögzíti.
2. **Gyors dupla kattintás a ❤-re**, miközben az első írás lassú: a végén nincs értékelés, és a szerver a két írást kattintási sorrendben kapja. Az 1. feladat store-tesztje rögzíti.
3. **Rossz query paraméterek a GitHub-fülön** (`?rating=toString`, `?page=abc`, `?page=999`): szűrő nélkül, illetve az 1. vagy a 20. oldallal jelenik meg, hiba nélkül. Az 1. feladat (`ratingFilter`) és a 4. feladat (`githubPage`) tesztje rögzíti.
4. **Egy ❤-es poszt közben törlődik:** a Gyűjtemény kihagyja, és a lista nem bukik el. A 4. feladat tesztje rögzíti.
5. **Vissza egy oldalra az értékelés után:** a router-gyorsítótárból jövő oldal az új értéket mutatja, nem a régit. A 8. feladat Playwright-próbája méri.

## Fájlok

| Fájl | Feladat | Mi változik |
| --- | --- | --- |
| `lib/ratings.ts` (új, + teszt) | 1 | típusok, `ratingKey`, `nextRating`, `downLast`, `ratingFilter`, `radarTargets`, `createRatingStore` |
| `supabase/migrations/20261003000000_ratings_github_repos.sql` (új) | 2 | `ratings`, a `github_top` oszlopai, `github_repos` nézet |
| `lib/state.ts` (+ teszt), `app/api/state/route.ts` (+ teszt), `lib/reader-store.ts`, `lib/pipeline/fake-db.ts` | 2 | `set_rating`; a fake `delete`, `in`, `is` és írási hibája |
| `lib/pipeline/collect.ts`, `lib/pipeline/daily.ts` (+ tesztek), `data/digest-types.ts`, `lib/content.ts` (+ teszt), `lib/fixtures.ts`, `app/components/digest-dashboard.tsx` | 3 | nyelv, pontszám, `GithubTopEntry` objektum, `v3` |
| `lib/content.ts` (+ teszt) | 4 | `getRatings`, `getGithubRepos`, `githubPage`, `getFavorites` |
| `app/components/rating-control.tsx` (új, + teszt), `app/components/app-shell.tsx`, `app/components/shell.test.ts`, `app/components/story-card.tsx` | 5 | `RatingsProvider`, `RatingControl`, `RatingBadge`, `dislikedClass`, `pressedClass` |
| a kártyák, a Top 10, a poszt-eszköztár, a Library, az oldalak, az előnézet | 6 | a bekötés |
| `app/(app)/archive/archive-tabs.tsx`, `github-view.tsx`, `(list)/github/page.tsx`, `app/(app)/collection/*`, `lib/nav.ts` (+ teszt), előnézet | 7 | a GitHub-fül és a Gyűjtemény |
| `CLAUDE.md`, `DESIGN.md`, `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `TODO.md` | 3–8 | doksi |

---

### Task 1: Az értékelések logikája

**Files:** Create `lib/ratings.ts`, `lib/ratings.test.ts`.

**Interfaces — Produces:**
- `type RatingValue = -1 | 1 | 2`, `type RatingKind = "item" | "post" | "repo"`, `type RatingTarget = { kind: RatingKind; id: string }`;
- `type RatingWrite = { action: "set_rating"; kind: RatingKind; id: string; value: RatingValue | null }`, `type Ratings = Record<string, RatingValue>`;
- `RATING_ID_MAX = 200`, `ratingTargetId(target): string`, `ratingKey(target): string`;
- `nextRating(current, pressed)`, `downLast(list, disliked)`;
- `RATING_FILTERS`, `type RatingFilter`, `ratingFilter(param?): RatingFilter | undefined`;
- `radarTargets(items: { id: string }[], repos: { repo: string }[]): RatingTarget[]`;
- `createRatingStore(send, onError)`, amely egy `RatingStore`-t ad: `subscribe`, `getSnapshot`, `valueOf(key, fallback)`, `press(target, fallback, pressed): Promise<void>`.

- [ ] **Step 1: Tesztek (RED).** `lib/ratings.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRatingStore, downLast, nextRating, radarTargets, ratingFilter, ratingKey, ratingTargetId, type RatingWrite } from "./ratings.ts";

// Review Focus 1. Kills a repo keyed by its casing (the Top 10's "Owner/Repo" and the tab's "owner/repo"
// would hold two ratings), and an item or post id lowercased (they are case-sensitive keys).
test("a repo is rated by its lowercase name; items and posts keep their id", () => {
  assert.equal(ratingKey({ kind: "repo", id: "Owner/Repo" }), "repo:owner/repo");
  assert.equal(ratingTargetId({ kind: "repo", id: "Owner/Repo" }), "owner/repo");
  assert.equal(ratingKey({ kind: "item", id: "local-2026w39-Abc" }), "item:local-2026w39-Abc");
  assert.equal(ratingKey({ kind: "post", id: "12" }), "post:12");
});

// B spec 2.1. Kills a second press that keeps the value instead of clearing it.
test("pressing the active value clears it; another value replaces it", () => {
  assert.equal(nextRating(2, 2), null);
  assert.equal(nextRating(1, 2), 2);
  assert.equal(nextRating(null, -1), -1);
});

// G1 spec 3, deviation 2. Kills a sort that reorders the rest, or drops the disliked ones.
test("downLast moves the disliked entries to the end and keeps every other order", () => {
  assert.deepEqual(downLast([1, 2, 3, 4, 5], (n) => n % 2 === 0), [1, 3, 5, 2, 4]);
});

// Review Focus 3. Kills a lookup that walks the prototype: "?rating=toString" must not become a filter.
test("ratingFilter takes only the four known filters", () => {
  assert.deepEqual(["heart", "up", "down", "none"].map(ratingFilter), ["heart", "up", "down", "none"]);
  for (const param of [undefined, "", "toString", "__proto__", "HEART", "2"]) assert.equal(ratingFilter(param), undefined, String(param));
});

test("radarTargets rates the week's items and repos", () => {
  assert.deepEqual(radarTargets([{ id: "a" }], [{ repo: "O/R" }]), [{ kind: "item", id: "a" }, { kind: "repo", id: "O/R" }]);
});

/** A sender whose answers the test releases one by one, in any order. */
function heldSend() {
  const writes: { write: RatingWrite; resolve: () => void; reject: () => void }[] = [];
  const send = (write: RatingWrite) => new Promise<void>((resolve, reject) => writes.push({ write, resolve, reject: () => reject(new Error("offline")) }));
  return { send, writes };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

// G1 spec 3. Kills a press that waits for the server, a write with the repo's casing, and a store that
// forgets this tab's value (Back would show the render's).
test("a press shows at once, sends the lowercase repo id, and this tab's value wins over the render's", async () => {
  const { send, writes } = heldSend();
  const store = createRatingStore(send, () => {});
  const target = { kind: "repo", id: "Owner/Repo" } as const;
  const done = store.press(target, null, 2);
  assert.equal(store.valueOf("repo:owner/repo", null), 2);
  assert.equal(store.valueOf("repo:owner/repo", 1), 2, "the tab's value, not the cached render's");
  await flush();
  assert.deepEqual(writes.map((w) => w.write), [{ action: "set_rating", kind: "repo", id: "owner/repo", value: 2 }]);
  writes[0].resolve();
  await done;
  assert.equal(store.valueOf("item:other", -1), -1, "an untouched target shows the render's value");
});

// Review Focus 2. Kills writes sent side by side (the server could apply the clear first), and a store
// that rolls back to the render's value after the newest write succeeded.
test("two quick presses write in click order, and the second press clears", async () => {
  const { send, writes } = heldSend();
  const store = createRatingStore(send, () => {});
  const target = { kind: "item", id: "a" } as const;
  const first = store.press(target, null, 2);
  const second = store.press(target, null, 2);
  assert.equal(store.valueOf("item:a", null), null);
  await flush();
  assert.equal(writes.length, 1, "the second write waits for the first");
  writes[0].resolve();
  await first;
  await flush();
  assert.deepEqual(writes.map((w) => w.write.value), [2, null]);
  writes[1].resolve();
  await second;
  assert.equal(store.valueOf("item:a", null), null);
});

// Kills a failure that keeps the optimistic value, one that rolls back to the render's value instead of
// the last confirmed one, a rollback by an older write while a newer one is still on its way, and a
// failure that says nothing.
test("the newest failed write falls back to the last confirmed value, and every failure is reported", async () => {
  const { send, writes } = heldSend();
  let errors = 0;
  const store = createRatingStore(send, () => errors++);
  const target = { kind: "post", id: "7" } as const;
  const confirmed = store.press(target, null, 1);
  await flush();
  writes[0].resolve();
  await confirmed;
  const older = store.press(target, null, 2);
  const newer = store.press(target, null, -1);
  await flush();
  writes[1].reject();
  await older;
  assert.equal(store.valueOf("post:7", null), -1, "an older failure leaves the newer press shown");
  await flush();
  writes[2].reject();
  await newer;
  assert.equal(store.valueOf("post:7", null), 1, "back to the last value the server confirmed");
  assert.equal(errors, 2);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/ratings.test.ts`. Várt: ERR_MODULE_NOT_FOUND.

- [ ] **Step 2: A modul (GREEN).** `lib/ratings.ts`:

```ts
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
```

- [ ] **Step 3: Futtatás.** Várt: zöld.

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - a `toLowerCase()` törlése;
    - `Object.hasOwn` helyett `in`;
    - a `queues.get(key) ??` lánc helyett közvetlen `send(write)`;
    - a rollback `confirmed.get(key)` helyett `fallback`;
    - az `if (latest.get(key) === seq)` feltétel törlése;
    - a `downLast` két szűrőjének felcserélése.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add lib/ratings.ts lib/ratings.test.ts
git commit -m "feat: add the ratings logic with click-order writes and rollback" -- lib/ratings.ts lib/ratings.test.ts
```

### Task 2: A migráció és a `set_rating` írás

**Files:**
- Create: `supabase/migrations/20261003000000_ratings_github_repos.sql`.
- Modify: `lib/state.ts`, `lib/state.test.ts`, `app/api/state/route.ts`, `app/api/state/route.test.ts`, `lib/reader-store.ts` (`StateWrite`), `lib/pipeline/fake-db.ts`.

**Interfaces:**
- Consumes: `RATING_ID_MAX`, `ratingTargetId`, `RatingWrite` (Task 1).
- Produces:
  - `StateAction` `set_rating` ága (`{ action, kind, id, value }`, az `id` már normalizálva);
  - `fakeDb(...).deletes: { table: string; filters: [string, unknown][] }[]`;
  - `FakeIngestTables.tableWriteErrors?: Record<string, PostgrestErrorShape>`;
  - a fake általános `select` láncán `in` és `is`.

- [ ] **Step 1: A migráció.** `supabase/migrations/20261003000000_ratings_github_repos.sql`:

```sql
-- G1 (docs/superpowers/specs/2026-10-03-g1-ratings-github-collection-design.md): a reader's 👎 👍 ❤ on Radar
-- items, Library posts and GitHub repos; each repo's stars, language and score; the archive's GitHub tab.
-- Only adds. Run it BEFORE deploying the G1 code: the Radar's query reads the new github_top columns.

create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('item', 'post', 'repo')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  value smallint not null check (value in (-1, 1, 2)),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
alter table public.ratings enable row level security;
drop policy if exists "own ratings" on public.ratings;
create policy "own ratings" on public.ratings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.ratings to authenticated;

alter table public.github_top
  add column if not exists stars int,
  add column if not exists language text,
  add column if not exists score smallint check (score between 0 and 100);

-- One row per repo (by lowercase name) across every week: the latest week's details, the weeks it was up,
-- and the caller's own rating. security_invoker: the caller's RLS applies, and auth.uid() is theirs.
create or replace view public.github_repos with (security_invoker = true) as
with latest as (
  select distinct on (lower(repo)) lower(repo) as repo_key, repo, focus, url, stars, language, score
  from public.github_top
  order by lower(repo), issue_id desc, rank
), weeks as (
  select lower(repo) as repo_key, min(issue_id) as first_week, max(issue_id) as last_week,
    count(distinct issue_id)::int as week_count, min(rank)::int as best_rank
  from public.github_top
  group by lower(repo)
)
select l.repo_key, l.repo, l.focus, l.url, l.stars, l.language, l.score,
  w.first_week, w.last_week, w.week_count, w.best_rank,
  r.value as rating, coalesce(r.value = -1, false) as disliked
from latest l
join weeks w using (repo_key)
left join public.ratings r
  on r.user_id = (select auth.uid()) and r.target_kind = 'repo' and r.target_id = l.repo_key;
grant select on public.github_repos to authenticated;
```

- [ ] **Step 2: A parser tesztje (RED).** A `lib/state.test.ts` végére:

```ts
// G1 spec 3 and Review Focus 1. Kills a repo id kept in its casing, a value outside −1/1/2 accepted, a
// missing value read as a clear (only an explicit null clears), and an unknown kind or an empty or
// over-long id accepted.
test("parseStateAction accepts set_rating, lowercasing a repo's id, and refuses anything else", () => {
  assert.deepEqual(parseStateAction({ action: "set_rating", kind: "repo", id: " Owner/Repo ", value: 2 }), { action: "set_rating", kind: "repo", id: "owner/repo", value: 2 });
  assert.deepEqual(parseStateAction({ action: "set_rating", kind: "post", id: "12", value: null }), { action: "set_rating", kind: "post", id: "12", value: null });
  assert.deepEqual(parseStateAction({ action: "set_rating", kind: "item", id: "Local-a", value: -1 }), { action: "set_rating", kind: "item", id: "Local-a", value: -1 });
  for (const value of [0, 3, "2", undefined]) assert.deepEqual(parseStateAction({ action: "set_rating", kind: "item", id: "a", value }), { error: "invalid_rating" }, String(value));
  for (const [kind, id] of [["user", "a"], ["item", ""], ["item", "x".repeat(201)], ["item", 5]]) {
    assert.deepEqual(parseStateAction({ action: "set_rating", kind, id, value: 1 }), { error: "invalid_target" }, `${kind}:${String(id).slice(0, 8)}`);
  }
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/state.test.ts`. Várt: elbukik (`unknown_action`).

- [ ] **Step 3: A parser (GREEN).** A `lib/state.ts`-ben:
  - import: `import { RATING_ID_MAX, ratingTargetId } from "./ratings.ts";`
  - `const ERRORS = ["missing_item", "invalid_item", "missing_text", "invalid_id", "invalid_target", "invalid_rating"] as const;`
  - az `actionSchema` uniójába, a `delete_todo` után:

```ts
  z.object({
    action: z.literal("set_rating"),
    kind: z.enum(["item", "post", "repo"], { error: "invalid_target" }),
    id: z.string({ error: "invalid_target" }).trim().min(1, { error: "invalid_target" }).max(RATING_ID_MAX, { error: "invalid_target" }),
    // Only an explicit null clears: a missing value is a broken request, not "no rating".
    value: z.union([z.literal(-1), z.literal(1), z.literal(2), z.null()], { error: "invalid_rating" }),
  }),
```

  - a `parseStateAction` sikerága:

```ts
  if (result.success) return result.data.action === "set_rating" ? { ...result.data, id: ratingTargetId(result.data) } : result.data;
```

  Futtatás: a Step 2 parancsa. Várt: zöld. Ha a zod a `value: undefined`-et nem `invalid_rating`-gel jelzi, a hibaüzenet-kiválasztás igazodik, nem a teszt.

- [ ] **Step 4: A fake kiegészítése.** A `lib/pipeline/fake-db.ts`-ben:
  - a `FakeIngestTables`-be, a `tableErrors` után:

```ts
  /** Forces any other table's upsert or delete, by table name, to resolve with this error. */
  tableWriteErrors?: Record<string, PostgrestErrorShape>;
```

  - a `FakeIngestDb`-be, az `upserts` mellé:

```ts
  /** Every other table's delete, in call order: the table and its `.eq(...)` filters. */
  deletes: { table: string; filters: [column: string, value: unknown][] }[];
```

  - a `fakeDb` törzsében `const deletes: FakeIngestDb["deletes"] = [];`, és a visszaadott objektumba `deletes`;
  - az általános tábla-ág:

```ts
    const writeError = tables.tableWriteErrors?.[table];
    return {
      upsert: async (values: unknown, options?: Record<string, unknown>) => {
        upserts.push({ table, values, options: options ?? {} });
        return { data: null, error: writeError ?? null };
      },
      // Chainable `.eq(...)` filters, awaitable like the real builder.
      delete: () => {
        const filters: [string, unknown][] = [];
        deletes.push({ table, filters });
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          then: (onFulfilled: (result: UpdateResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: null, error: writeError ?? null }).then(onFulfilled, onRejected),
        };
        return chain;
      },
      select: (columns = "*") => selectFrom(table, columns),
    };
```

  - a `tableQuery` `chain`-jébe:

```ts
    in: filter("in"),
    // SQL's `is`: null matches only null (passes() treats a null value as no match).
    is: (column: string, value: unknown) => {
      kept.push((row) => !(column in row) || (row[column] ?? null) === value);
      return record("is", column, value);
    },
```

  - a `Filter` típus `op` uniója már tartalmazza az `in`-t.

- [ ] **Step 5: A route tesztje (RED).** Az `app/api/state/route.test.ts` végére:

```ts
// G1 spec 3. Kills the upsert keyed on anything but the reader's target, a clear written as an upsert,
// a delete that drops the kind filter (it would clear a post's rating along with an item of the same id),
// and a repo written in its casing.
test("POST /api/state set_rating upserts the reader's rating and a null deletes it", async () => {
  resetRoute();
  const db = fakeDb();
  routeStub.reader = signedIn(db);
  for (const body of [{ action: "set_rating", kind: "repo", id: "Owner/Tool", value: 2 }, { action: "set_rating", kind: "item", id: "local-a", value: null }]) {
    const response = await write(body);
    assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  }
  const [upsert] = db.upserts;
  const { updated_at, ...rating } = upsert.values as Record<string, unknown>;
  assert.equal(typeof updated_at, "string");
  assert.deepEqual([upsert.table, rating, upsert.options], ["ratings", { target_kind: "repo", target_id: "owner/tool", value: 2 }, { onConflict: "user_id,target_kind,target_id" }]);
  assert.deepEqual(db.deletes, [{ table: "ratings", filters: [["target_kind", "item"], ["target_id", "local-a"]] }]);
});

// Kills a failed write answered as ok, or not logged.
test("POST /api/state set_rating answers 500 db_error when the write fails, and logs it once", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { tableWriteErrors: { ratings: pgError("08006", "connection failure") } }));
  for (const value of [1, null]) {
    const response = await write({ action: "set_rating", kind: "post", id: "3", value });
    assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
  }
  assert.equal(logged.mock.callCount(), 2);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/api/state/route.test.ts`. Várt: elbukik (400 `unknown_action` helyett most már a parser elfogadja, de a route-nak nincs ága: TS-hiba vagy `undefined` válasz).

- [ ] **Step 6: A route (GREEN).** Az `app/api/state/route.ts` `switch`-ébe, a `delete_todo` után:

```ts
    case "set_rating": {
      // RLS scopes both to the caller's own row, like the to-dos.
      const { error } =
        parsed.value === null
          ? await db.from("ratings").delete().eq("target_kind", parsed.kind).eq("target_id", parsed.id)
          : await db
              .from("ratings")
              .upsert({ target_kind: parsed.kind, target_id: parsed.id, value: parsed.value, updated_at: now }, { onConflict: "user_id,target_kind,target_id" });
      return error ? failed(error) : NextResponse.json({ ok: true });
    }
```

  A `lib/reader-store.ts`-ben a `StateWrite` uniója kiegészül: `| RatingWrite` (`import type { RatingWrite } from "./ratings.ts";`). A `memorySend` változatlanul `{}`-t ad rá.

- [ ] **Step 7: Futtatás, próbák, ellenőrzés, commit.**
  - **Futtatás:** `node --experimental-strip-types --no-warnings --test app/api/state/route.test.ts lib/state.test.ts`. Várt: zöld.
  - **Próbák:**
    - a `value === null` ág felcserélése;
    - a `.eq("target_kind", …)` törlése;
    - a `ratingTargetId` törlése a parserből;
    - a `z.null()` törlése.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add supabase/migrations/20261003000000_ratings_github_repos.sql
git commit -m "feat: store a reader's ratings and the repos' stars, language and score" -- supabase/migrations/20261003000000_ratings_github_repos.sql lib/state.ts lib/state.test.ts app/api/state/route.ts app/api/state/route.test.ts lib/reader-store.ts lib/pipeline/fake-db.ts
```

### Task 3: A repók pontszáma, csillagszáma és nyelve

**Files:** Modify `lib/pipeline/collect.ts`, `lib/pipeline/daily.ts`, `lib/pipeline/daily.test.ts`, `data/digest-types.ts`, `lib/content.ts`, `lib/content.test.ts`, `lib/fixtures.ts`, `app/components/digest-dashboard.tsx`, `CLAUDE.md` (Data contract).

**Interfaces — Produces:**
- `type GithubTopEntry = { repo: string; focus: string; url: string; stars: number | null; language: string | null; score: number | null }`;
- `Repo.language: string | null`;
- a `curatedSchema.github` elemei `{ index, focus, score }`.

- [ ] **Step 1: Tesztek (RED).** A `lib/pipeline/daily.test.ts`-ben:
  - a `repos` fixture minden eleme kap egy `language: i % 2 ? null : "Python"` mezőt;
  - a 66. sor `github` elemei `score`-t kapnak: `{ index: 5, focus: "fifth", score: 91 }`, `{ index: 99, focus: "made up", score: 50 }`, a többi `score: 40`;
  - a 70. sor elvárása: `{ issue_id: "2026-W39", rank: 1, repo: "owner/repo-5", focus: "fifth", url: "https://github.com/owner/repo-5", stars: 95, language: null, score: 91 }`;
  - az integrációs teszt (94–117. sor) GitHub-válaszának eleme kap egy `language: "Rust"`-ot, a Gemini-válasz `github: [{ index: 0, focus: "A tool", score: 88 }]`, és az elvárt `github_top` sor `stars`, `language: "Rust"`, `score: 88` mezőkkel bővül (a `stars` a mockolt `stargazers_count`);
  - új teszt a fájl végére:

```ts
// G1 spec 2. Kills the score dropped from the prompt (the model would answer without one and fail the schema).
test("curatePrompt asks for a 0–100 score on every repo, on the news' scale", () => {
  assert.match(curatePrompt([], repos), /"github" with a focus line of at most 8 English words and a score from 0 to 100/);
});
```

  - a `lib/content.test.ts` 63. sora (és a hozzá tartozó `github_top` fixture-sor, ha van) objektumot vár:

```ts
  assert.deepEqual(radar?.githubTop10, [{ repo: "owner/tool", focus: "A tool", url: "https://github.com/owner/tool", stars: 120, language: "Go", score: 77 }]);
```

  és a hozzá tartozó `issueRow(...)` `github_top` sora kapja a `stars: 120, language: "Go", score: 77` mezőket. Egy második sor `stars: null, language: null, score: null` értékkel bizonyítja, hogy a régi hetek sorai is átjönnek.

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily.test.ts lib/content.test.ts`. Várt: elbukik.

- [ ] **Step 2: A gyűjtés és a válogatás (GREEN).**
  - **`lib/pipeline/collect.ts`:**
    - `export type Repo = { repo: string; focus: string; url: string; stars: number; language: string | null };`;
    - a keresés elemtípusa kap `language: string | null` mezőt;
    - a `byName.set(...)` objektuma `language: item.language ?? null`-t.
  - **`lib/pipeline/daily.ts`:**
    - a séma: `github: z.array(z.object({ index: z.int(), focus: z.string(), score: z.int().min(0).max(100) })).max(10),`;
    - a prompt PART 2 mondata: `…return them in "github" with a focus line of at most 8 English words and a score from 0 to 100 on the same scale as the news (how useful it is to the reader).`;
    - a REPOS sor a nyelvvel: ``${repos.map((r, i) => `[${i}] ${r.repo} (${r.stars}★${r.language ? `, ${r.language}` : ""}) — ${r.focus}`).join("\n")}``;
    - a `toDigestRows` `top` leképezése:

```ts
    .map((entry, i) => {
      const repo = repos[entry.index];
      return { issue_id: week.id, rank: i + 1, repo: repo.repo, focus: entry.focus, url: repo.url, stars: repo.stars, language: repo.language, score: entry.score };
    });
```

- [ ] **Step 3: Az adatszerződés.**
  - **`data/digest-types.ts`:**

```ts
/** A week's GitHub Top 10 row. stars, language and score are null on the weeks before G1 (2026-10). */
export type GithubTopEntry = { repo: string; focus: string; url: string; stars: number | null; language: string | null; score: number | null };
```

  - **`lib/content.ts`:**
    - a `RADAR_COLUMNS` vége `github_top(repo, focus, url, stars, language, score)`;
    - a leképezés: `githubTop10: latest.github_top.map(({ repo, focus, url, stars, language, score }) => ({ repo, focus, url, stars, language, score })),`;
    - a `closedWeek` kulcsa `["closed-week", "v3"]`, és a kulcs fölötti megjegyzés vége: „v2: items gained addedAt. v3: githubTop10 rows became objects with stars, language and score.”
  - **`lib/fixtures.ts`:** a `previewGithub` két eleme objektum lesz: `{ repo: "ggml-org/llama.cpp", focus: "LLM inference in C/C++", url: "https://github.com/ggml-org/llama.cpp", stars: 81000, language: "C++", score: 92 }`, és a hosszú nevű `{ …, stars: null, language: null, score: null }` (egy G1 előtti hét).
  - **`app/components/digest-dashboard.tsx`:** a Top 10 `map` fejléce `githubTop10.map(({ repo, focus, url }, index) => (`; a megjelenés ebben a feladatban nem változik.
  - **CLAUDE.md → Data contract:** a „`githubTop10` is an array of **positional 3-tuples** `[repo, focus, url]`, not objects.” mondat helyére: „`githubTop10` is an array of `{ repo, focus, url, stars, language, score }` objects; the last three are null on weeks before G1. The daily curate scores each repo 0–100 on the news' scale.”

  Futtatás: a Step 1 parancsa, majd `npx tsc --noEmit`. Várt: zöld. A `tsc` minden más tuple-olvasót megmutat; azokat ugyanígy objektumra kell átírni.

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - a `score: entry.score` törlése;
    - a `language: item.language ?? null` helyett `null`;
    - a prompt pontszám-mondatának törlése;
    - a `RADAR_COLUMNS` új oszlopainak törlése.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git commit -m "feat: score each daily repo and keep its stars and language" -- lib/pipeline/collect.ts lib/pipeline/daily.ts lib/pipeline/daily.test.ts data/digest-types.ts lib/content.ts lib/content.test.ts lib/fixtures.ts app/components/digest-dashboard.tsx CLAUDE.md
```

### Task 4: Az olvasások: értékelések, GitHub-fül, Gyűjtemény

**Files:** Modify `lib/content.ts`, `lib/content.test.ts`.

**Interfaces:**
- Consumes: `ratingKey`, `ratingTargetId`, `RATING_FILTERS`, `RatingFilter`, `RatingKind`, `RatingTarget`, `RatingValue`, `Ratings` (Task 1); a `github_repos` nézet (Task 2).
- Produces:
  - `getRatings(db, targets): Promise<Ratings>`;
  - `GITHUB_PAGE = 30`, `githubPage(raw?: string): number`;
  - `type GithubRepo = { key: string; repo: string; focus: string; url: string; stars: number | null; language: string | null; score: number | null; firstWeek: string; lastWeek: string; weekCount: number; bestRank: number; rating: RatingValue | null }`;
  - `getGithubRepos(db, { rating?, language?, page }): Promise<{ repos: GithubRepo[]; more: boolean; languages: string[] }>`;
  - `type Favorite = { kind: RatingKind; id: string; title: Localized | string; href: string; external: boolean; detail: string | null }`;
  - `getFavorites(db): Promise<Favorite[]>`.

- [ ] **Step 1: Tesztek (RED).** A `lib/content.test.ts` dinamikus importjába: `getFavorites, getGithubRepos, getRatings, githubPage`. A fájl végére:

```ts
// G1 spec 3. Kills a lookup that answers another kind's rating for the same id, a repo found only in its
// stored casing, and a failure that fails the page instead of costing only the marks.
test("getRatings answers the reader's own ratings by key, and a failed query logs and answers none", async (t) => {
  const db = fakeDb(undefined, {
    rows: {
      ratings: [
        { target_kind: "item", target_id: "a", value: 2 },
        { target_kind: "post", target_id: "a", value: -1 },
        { target_kind: "repo", target_id: "owner/tool", value: 1 },
      ],
    },
  });
  assert.deepEqual(await getRatings(db, [{ kind: "item", id: "a" }, { kind: "repo", id: "Owner/Tool" }]), { "item:a": 2, "repo:owner/tool": 1 });
  assert.deepEqual(await getRatings(db, []), {});
  const logged = t.mock.method(console, "error", () => {});
  assert.deepEqual(await getRatings(fakeDb(undefined, { tableErrors: { ratings: pgError("08006", "connection failure") } }), [{ kind: "item", id: "a" }]), {});
  assert.equal(logged.mock.callCount(), 1);
});

// Review Focus 3. Kills a page number taken as written (NaN, 0, or a 999-page query).
test("githubPage reads a page from 1 to 20, and anything else as 1", () => {
  assert.deepEqual(["1", "3", "20", "21", "999", "0", "-2", "abc", undefined].map(githubPage), [1, 3, 20, 20, 20, 1, 1, 1, 1]);
});

const repoRow = (key: string, overrides: Record<string, unknown> = {}) => ({
  repo_key: key, repo: key, focus: "f", url: `https://github.com/${key}`, stars: 10, language: "Go", score: 70,
  first_week: "2026-W38", last_week: "2026-W40", week_count: 2, best_rank: 3, rating: null, disliked: false, ...overrides,
});

// G1 spec 4. Kills the 👎 not sorted last, the filters not passed to the view, a page that can't tell
// there is more, and the language list not deduplicated.
test("getGithubRepos asks the view for one page with the 👎 last, applies the filters, and says when there is more", async () => {
  const rows = Array.from({ length: 31 }, (_, i) => repoRow(`o/r${i}`, { language: i % 2 ? "Go" : "Rust" }));
  const db = fakeDb(undefined, { rows: { github_repos: rows } });
  const page = await getGithubRepos(db, { page: 1 });
  assert.equal(page.repos.length, 30);
  assert.equal(page.more, true);
  assert.deepEqual(page.languages, ["Go", "Rust"]);
  assert.deepEqual(page.repos[0], { key: "o/r0", repo: "o/r0", focus: "f", url: "https://github.com/o/r0", stars: 10, language: "Rust", score: 70, firstWeek: "2026-W38", lastWeek: "2026-W40", weekCount: 2, bestRank: 3, rating: null });
  const listing = db.queries.find(({ table, calls }) => table === "github_repos" && calls.some(([method]) => method === "limit"));
  assert.deepEqual(listing?.calls.filter(([method]) => method === "order" || method === "limit"), [
    ["order", "disliked"],
    ["order", "last_week", { ascending: false }],
    ["order", "best_rank"],
    ["limit", 31],
  ]);
  const filtered = fakeDb(undefined, { rows: { github_repos: [repoRow("o/a", { rating: 2 }), repoRow("o/b"), repoRow("o/c", { rating: 2, language: "Rust" })] } });
  assert.deepEqual((await getGithubRepos(filtered, { rating: "heart", language: "Go", page: 1 })).repos.map((r) => r.key), ["o/a"]);
  assert.deepEqual((await getGithubRepos(filtered, { rating: "none", page: 1 })).repos.map((r) => r.key), ["o/b"]);
});

// Kills a failed tab read answered as an empty tab.
test("getGithubRepos throws on a failed query, with the PostgREST error as the cause", async () => {
  const error = pgError("08006", "connection failure");
  await assert.rejects(getGithubRepos(fakeDb(undefined, { tableErrors: { github_repos: error } }), { page: 1 }), (e: unknown) => e instanceof Error && e.cause === error);
});

// G1 spec 5 and Review Focus 4. Kills the order lost (the latest ❤ first), a gone target kept as a broken
// row, a post shown with the model's title over the reader's own, and a 👍 listed as a favourite.
test("getFavorites lists the reader's ❤ items, posts and repos, latest first, and leaves out what is gone", async () => {
  const db = fakeDb(undefined, {
    rows: {
      ratings: [
        { target_kind: "post", target_id: "7", value: 2, updated_at: "2026-10-03T10:00:00Z" },
        { target_kind: "repo", target_id: "owner/tool", value: 2, updated_at: "2026-10-02T10:00:00Z" },
        { target_kind: "post", target_id: "99", value: 2, updated_at: "2026-10-01T10:00:00Z" },
        { target_kind: "item", target_id: "local-2026w39-a", value: 2, updated_at: "2026-09-30T10:00:00Z" },
        { target_kind: "item", target_id: "local-2026w39-b", value: 1, updated_at: "2026-09-29T10:00:00Z" },
      ],
      digest_items: [{ id: "local-2026w39-a", issue_id: "2026-W39", title: { hu: "Hír", en: "News" }, url: "https://blog.test/a", source: "Blog" }],
      posts: [{ id: 7, title: { hu: "Modell", en: "Model" }, overrides: { title: { hu: "Saját", en: "Own" } } }],
      github_repos: [repoRow("owner/tool", { repo: "Owner/Tool" })],
    },
  });
  assert.deepEqual(await getFavorites(db), [
    { kind: "post", id: "7", title: { hu: "Saját", en: "Own" }, href: "/library/7", external: false, detail: null },
    { kind: "repo", id: "owner/tool", title: "Owner/Tool", href: "https://github.com/owner/tool", external: true, detail: "W40" },
    { kind: "item", id: "local-2026w39-a", title: { hu: "Hír", en: "News" }, href: "https://blog.test/a", external: true, detail: "Blog · W39" },
  ]);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/content.test.ts`. Várt: elbukik (nincs ilyen export). Ha a `fakeDb` `posts` láncának nincs `.in(...)`-je, a `posts` select-láncát a Task 2 `in`-jéhez hasonlóan kell kiegészíteni (a `selectFrom("posts", columns).in(...)` átirányítással, ahogy az `order`-nél).

- [ ] **Step 2: A kód (GREEN).** A `lib/content.ts`-ben:
  - **Importok:** `import { RATING_FILTERS, ratingKey, ratingTargetId, type RatingFilter, type RatingKind, type RatingTarget, type RatingValue, type Ratings } from "@/lib/ratings";`, továbbá `import { shownTitle } from "@/lib/post-view";` és `import { readOverrides } from "@/lib/overrides";`.
  - **A `getReadPostIds` után:**

```ts
/** The reader's own ratings on `targets`, by ratingKey (RLS: own rows only). Like getReadPostIds, a failure
 *  only costs showing them, so it logs and answers none (G1 spec 3). */
export async function getRatings(db: SupabaseClient, targets: RatingTarget[]): Promise<Ratings> {
  if (!targets.length) return {};
  const wanted = new Set(targets.map(ratingKey));
  const { data, error } = await db.from("ratings").select("target_kind, target_id, value").in("target_id", [...new Set(targets.map(ratingTargetId))]);
  if (error) {
    console.error("ratings query failed", error);
    return {};
  }
  const ratings: Ratings = {};
  for (const row of data) {
    const key = ratingKey({ kind: row.target_kind as RatingKind, id: row.target_id as string });
    if (wanted.has(key)) ratings[key] = row.value as RatingValue;
  }
  return ratings;
}

export const GITHUB_PAGE = 30;
/** The tab's `?page=`: 1 to 20, anything else 1 (20 pages of 30 is every repo a year of weeks can hold). */
export function githubPage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? Math.min(page, 20) : 1;
}

export type GithubRepo = {
  key: string; repo: string; focus: string; url: string; stars: number | null; language: string | null; score: number | null;
  firstWeek: string; lastWeek: string; weekCount: number; bestRank: number; rating: RatingValue | null;
};

const REPO_COLUMNS = "repo_key, repo, focus, url, stars, language, score, first_week, last_week, week_count, best_rank, rating";

/** The archive's GitHub tab (G1 spec 4): one row per repo from the github_repos view, with the reader's own
 *  rating; the 👎 ones last, then the latest week first; `page` pages of GITHUB_PAGE, one more row read to
 *  tell whether there is more. Throws on a failed query, like getPosts. */
export async function getGithubRepos(
  db: SupabaseClient,
  { rating, language, page }: { rating?: RatingFilter; language?: string; page: number },
): Promise<{ repos: GithubRepo[]; more: boolean; languages: string[] }> {
  let query = db.from("github_repos").select(REPO_COLUMNS);
  if (rating) query = RATING_FILTERS[rating] === null ? query.is("rating", null) : query.eq("rating", RATING_FILTERS[rating]);
  if (language) query = query.eq("language", language);
  const shown = page * GITHUB_PAGE;
  const [listed, languages] = await Promise.all([
    query.order("disliked").order("last_week", { ascending: false }).order("best_rank").limit(shown + 1),
    db.from("github_repos").select("language"),
  ]);
  if (listed.error) throw queryFailed("github repos", listed.error);
  if (languages.error) throw queryFailed("github languages", languages.error);
  return {
    repos: listed.data.slice(0, shown).map((row) => ({
      key: row.repo_key, repo: row.repo, focus: row.focus, url: row.url, stars: row.stars, language: row.language, score: row.score,
      firstWeek: row.first_week, lastWeek: row.last_week, weekCount: row.week_count, bestRank: row.best_rank, rating: row.rating as RatingValue | null,
    })),
    more: listed.data.length > shown,
    languages: [...new Set(languages.data.flatMap((row) => (row.language ? [row.language as string] : [])))].sort(),
  };
}

export type Favorite = { kind: RatingKind; id: string; title: Localized | string; href: string; external: boolean; detail: string | null };

/** A lookup that skips the query when there is nothing to look up. */
const lookUp = <T>(ids: unknown[], run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) =>
  ids.length ? run() : Promise.resolve({ data: [] as T[], error: null });

/** The reader's ❤ items, posts and repos, the latest first (G1 spec 5). A ❤ whose target is gone (a deleted
 *  post) is left out. Throws on a failed query: this list is the page's content. */
export async function getFavorites(db: SupabaseClient): Promise<Favorite[]> {
  const { data: hearts, error } = await db.from("ratings").select("target_kind, target_id, updated_at").eq("value", 2).order("updated_at", { ascending: false });
  if (error) throw queryFailed("favorites", error);
  const idsOf = (kind: RatingKind) => hearts.filter((row) => row.target_kind === kind).map((row) => row.target_id as string);
  const postIds = idsOf("post").map(Number).filter(Number.isInteger);
  const [items, posts, repos] = await Promise.all([
    lookUp<Record<string, unknown>>(idsOf("item"), () => db.from("digest_items").select("id, issue_id, title, url, source").in("id", idsOf("item"))),
    lookUp<Record<string, unknown>>(postIds, () => db.from("posts").select("id, title, overrides").in("id", postIds)),
    lookUp<Record<string, unknown>>(idsOf("repo"), () => db.from("github_repos").select("repo_key, repo, url, last_week").in("repo_key", idsOf("repo"))),
  ]);
  for (const result of [items, posts, repos]) if (result.error) throw queryFailed("favorites", result.error);
  const found = new Map<string, Favorite>();
  for (const row of items.data ?? []) {
    found.set(`item:${row.id}`, { kind: "item", id: row.id as string, title: row.title as Localized, href: row.url as string, external: true, detail: `${row.source} · ${String(row.issue_id).slice(5)}` });
  }
  for (const row of posts.data ?? []) {
    found.set(`post:${row.id}`, { kind: "post", id: String(row.id), title: shownTitle(row.title, readOverrides(row.overrides)), href: `/library/${row.id}`, external: false, detail: null });
  }
  for (const row of repos.data ?? []) {
    found.set(`repo:${row.repo_key}`, { kind: "repo", id: row.repo_key as string, title: row.repo as string, href: row.url as string, external: true, detail: String(row.last_week).slice(5) });
  }
  return hearts.flatMap((row) => found.get(`${row.target_kind}:${row.target_id}`) ?? []);
}
```

  - Ha a `shownTitle` szignatúrája (`lib/post-view.ts`) mást vár, a meglévő hívóihoz igazodj (`toPost`, `listMySources`).
  - A `supabase-js` lánc újra-értékadása (`query = query.is(…)`) a TS-ben ugyanazt a típust adja. Ha mégsem, ugyanazzal a lánccal egy feltételes építővel kell megoldani, nem `any`-vel.

- [ ] **Step 3: Futtatás.** Várt: zöld, és a `tsc` tiszta.

- [ ] **Step 4: Próbák, ellenőrzés, commit.**
  - **Próbák:**
    - a `wanted.has(key)` szűrő törlése;
    - az `.order("disliked")` törlése;
    - a `limit(shown + 1)` helyett `limit(shown)`;
    - a `RATING_FILTERS[rating] === null` ág felcserélése;
    - a `getFavorites` `.eq("value", 2)` szűrőjének törlése;
    - a `?? []` helyett a hiányzó tétel megtartása.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git commit -m "feat: read a page's ratings, the github tab and the collection" -- lib/content.ts lib/content.test.ts lib/pipeline/fake-db.ts
```

### Task 5: Az értékelő gombcsoport

**Files:**
- Create: `app/components/rating-control.tsx`, `app/components/rating-control.test.ts`.
- Modify: `app/components/app-shell.tsx`, `app/components/shell.test.ts` (`withShellProviders` és a 417. sor körüli kézi burkolás), `app/components/story-card.tsx` (a `pressedClass` innen jön), `DESIGN.md` (a `pressedClass` kivonata).

**Interfaces:**
- Consumes: `createRatingStore`, `ratingKey`, `RatingStore`, `RatingTarget`, `RatingValue`, `RatingWrite` (Task 1); `postState`, `memorySend` (`lib/reader-store.ts`).
- Produces:
  - `RatingsProvider({ send, children })`;
  - `RatingControl({ target, initial, className? })`;
  - `RatingBadge({ target, initial })`;
  - `dislikedClass`, `pressedClass`.

- [ ] **Step 1: Teszt (RED).** `app/components/rating-control.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { render } from "../../lib/test/render.ts";

const { RatingBadge, RatingControl, RatingsProvider } = await import("./rating-control.tsx");
const { LanguageProvider } = await import("./language-context.tsx");

const inShell = (child: ReactNode) =>
  render(createElement(LanguageProvider, { initial: "hu" }, createElement(RatingsProvider, { send: async () => ({}) }, child)));

// G1 spec 3. Kills a group without its name, a pressed state not drawn from the value, the labels
// swapped, and the data-rating a card dims by missing or wrong.
test("RatingControl is a named group of three toggles, pressed by the value, marked for the card", () => {
  const doc = inShell(createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: 2 }));
  const group = doc.querySelector('[role="group"]');
  assert.equal(group?.getAttribute("aria-label"), "Értékelés");
  assert.equal(group?.getAttribute("data-rating"), "heart");
  assert.deepEqual([...doc.querySelectorAll("button")].map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]), [
    ["Nem hasznos", "false"],
    ["Hasznos", "false"],
    ["Kedvenc", "true"],
  ]);
  const none = inShell(createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: null }));
  assert.equal(none.querySelector('[role="group"]')?.hasAttribute("data-rating"), false);
});

// G1 spec 3, deviation 1. Kills a badge for an unrated post, and one a card can't dim by.
test("RatingBadge marks a rated post and shows nothing for an unrated one", () => {
  const down = inShell(createElement(RatingBadge, { target: { kind: "post", id: "3" }, initial: -1 }));
  assert.equal(down.querySelector("[data-rating]")?.getAttribute("data-rating"), "down");
  assert.equal(down.body.textContent, "Nem hasznos");
  assert.equal(inShell(createElement(RatingBadge, { target: { kind: "post", id: "3" }, initial: null })).body.textContent, "");
});

// Kills the provider check dropped: outside the shell every press would go nowhere, silently.
test("RatingControl outside RatingsProvider throws", () => {
  assert.throws(() => render(createElement(LanguageProvider, { initial: "hu" }, createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: null }))), /RatingsProvider/);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test app/components/rating-control.test.ts`. Várt: ERR_MODULE_NOT_FOUND.

- [ ] **Step 2: A komponens (GREEN).** `app/components/rating-control.tsx`:

```tsx
"use client";

import { Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { createRatingStore, ratingKey, type RatingStore, type RatingTarget, type RatingValue, type RatingWrite } from "@/lib/ratings";
import { useLanguage } from "./language-context";
import { toasts } from "./undo-toast";

const copy = {
  hu: { group: "Értékelés", down: "Nem hasznos", up: "Hasznos", heart: "Kedvenc" },
  en: { group: "Rating", down: "Not useful", up: "Useful", heart: "Favourite" },
};

/** A toggle's pressed state, in ink (DESIGN.md → Components → Button): the card toggles use it too. */
export const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";
/** A card or row that holds a 👎 rating dims and turns its frame dashed, unlike a read one (B spec 2.4). */
export const dislikedClass = "has-[[data-rating=down]]:opacity-60 has-[[data-rating=down]]:border-dashed";

const BUTTONS = [
  { value: -1, name: "down", Icon: ThumbsDown },
  { value: 1, name: "up", Icon: ThumbsUp },
  { value: 2, name: "heart", Icon: Heart },
] as const;
const nameOf = (value: RatingValue) => BUTTONS.find((button) => button.value === value)!.name;

const RatingsContext = createContext<RatingStore | null>(null);

/** Mounted once by the app shell; the preview passes its in-memory sender, so nothing it rates is stored. */
export function RatingsProvider({ send, children }: { send: (write: RatingWrite) => Promise<unknown>; children: ReactNode }) {
  const [store] = useState(() => createRatingStore(send, () => toasts.show({ kind: "failed" })));
  return <RatingsContext value={store}>{children}</RatingsContext>;
}

const noneRated: ReadonlyMap<string, RatingValue | null> = new Map();

/** The value the reader sees: what this tab set, else the page's render (G1 spec 3). */
function useRating(target: RatingTarget, initial: RatingValue | null) {
  const store = useContext(RatingsContext);
  if (!store) throw new Error("RatingControl must be used inside RatingsProvider (app/components/app-shell.tsx)");
  const rated = useSyncExternalStore(store.subscribe, store.getSnapshot, () => noneRated);
  const key = ratingKey(target);
  return { store, value: rated.has(key) ? (rated.get(key) ?? null) : initial };
}

/** 👎 👍 ❤ for one item, post or repo. Its data-rating lets the card around it dim for a 👎 (dislikedClass). */
export function RatingControl({ target, initial, className = "" }: { target: RatingTarget; initial: RatingValue | null; className?: string }) {
  const { language } = useLanguage();
  const { store, value } = useRating(target, initial);
  const t = copy[language];
  return (
    <div role="group" aria-label={t.group} data-rating={value === null ? undefined : nameOf(value)} className={`flex ${className}`}>
      {BUTTONS.map(({ value: pressed, name, Icon }, index) => (
        <Button
          key={name}
          variant="brutal"
          size="icon-lg"
          aria-pressed={value === pressed}
          aria-label={t[name]}
          title={t[name]}
          onClick={() => void store.press(target, initial, pressed)}
          className={`size-10 sm:pointer-fine:size-8 ${index ? "-ml-0.5" : ""} ${pressedClass}`}
        >
          <Icon className={name === "heart" && value === 2 ? "fill-current" : undefined} />
        </Button>
      ))}
    </div>
  );
}

/** A Library card's rating as a mark: the card is one link, so it can't hold buttons (G1 spec 3, deviation 1). */
export function RatingBadge({ target, initial }: { target: RatingTarget; initial: RatingValue | null }) {
  const { language } = useLanguage();
  const { value } = useRating(target, initial);
  if (value === null) return null;
  const { name, Icon } = BUTTONS.find((button) => button.value === value)!;
  return (
    <span data-rating={name} className="inline-flex items-center">
      <Icon aria-hidden="true" className={`size-4 ${name === "heart" ? "fill-current" : ""}`} />
      <span className="sr-only">{copy[language][name]}</span>
    </span>
  );
}
```

  Futtatás: a Step 1 parancsa. Várt: zöld. Ha a `LanguageProvider` propja nem `initial`, a meglévő hívásokhoz igazodj (`app/components/shell.test.ts:52`).

- [ ] **Step 3: A shell és a `pressedClass`.**
  - **`app/components/app-shell.tsx`:**
    - import: `import { memorySend, postState } from "@/lib/reader-store";` és `import { RatingsProvider } from "./rating-control";`;
    - a `<LanguageProvider initial={language}>` közvetlen gyereke `<RatingsProvider send={chatPreview ? memorySend(chatPreview.failWrites) : postState}>`, amely minden eddigi gyereket körülvesz.
  - **`app/components/story-card.tsx`:** a `const pressedClass = …` törlődik, helyette `import { pressedClass } from "./rating-control";`.
  - **`app/components/shell.test.ts`:**
    - a `withShellProviders` a `RefreshProvider` köré egy `createElement(RatingsProvider, { send: async () => ({}) }, …)`-t kap;
    - a 417. sor körüli kézi burkolás ugyanígy;
    - az import: `const { RatingsProvider } = await import("./rating-control.tsx");`.
  - **DESIGN.md → Components → Button:** a `pressedClass` kivonatának fejléce ` ```tsx app/components/rating-control.tsx`, a szöveg „(both from `story-card.tsx`)” helyére: „(the Open link from `story-card.tsx`, the toggle class from `rating-control.tsx`, which the rating group shares)”.

- [ ] **Step 4: Futtatás, próbák, ellenőrzés, commit.**
  - **Futtatás:** `npm test`, a kivonat-teszttel együtt. Várt: zöld.
  - **Próbák:**
    - az `aria-pressed={value === pressed}` helyett `false`;
    - a `data-rating` törlése;
    - a provider-ellenőrzés törlése;
    - a `RatingBadge` `value === null` ága helyett mindig render.
    - Mind piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git add app/components/rating-control.tsx app/components/rating-control.test.ts
git commit -m "feat: add the rating group, its badge and the shell's rating store" -- app/components/rating-control.tsx app/components/rating-control.test.ts app/components/app-shell.tsx app/components/story-card.tsx app/components/shell.test.ts DESIGN.md
```

### Task 6: A bekötés: kártyák, Top 10, poszt, Library

**Files:**
- `app/components/story-card.tsx`, `app/components/digest-dashboard.tsx`, `app/components/shell.test.ts`;
- `app/(app)/current-week-page.tsx`, `app/(app)/archive/[week]/page.tsx`;
- `app/(app)/library/(list)/page.tsx`, `app/(app)/library/library-view.tsx`;
- `app/(app)/library/[id]/page.tsx`, `post-article.tsx`, `post-toolbar.tsx`, `post-toolbar.test.ts`;
- `lib/fixtures.ts`, `app/dev/preview/page.tsx`, `app/dev/preview/post/page.tsx`;
- `CLAUDE.md` (Server path).

**Interfaces:**
- Consumes: `RatingControl`, `RatingBadge`, `dislikedClass` (Task 5); `getRatings` (Task 4); `radarTargets`, `ratingKey`, `downLast`, `Ratings`, `RatingValue` (Task 1).
- Produces:
  - `DigestDashboard` `ratings?: Ratings` prop;
  - `CardProps.rating: RatingValue | null`;
  - `PostArticle` és `PostToolbar` `rating: RatingValue | null` prop;
  - `LibraryView` `ratings: Ratings` prop;
  - `previewRatings: Ratings` (`lib/fixtures.ts`).

- [ ] **Step 1: Tesztek (RED).**
  - Az `app/components/shell.test.ts` végére:

```ts
// G1 spec 3. Kills the rating group missing from a card or a Top 10 row, a card that ignores the page's
// ratings, and a repo looked up in its casing.
test("every Radar card and Top 10 row carries a rating group, pressed by the page's ratings", () => {
  const [first] = previewItems;
  const doc = withShellProviders(DigestDashboard, {
    issue: previewIssue,
    items: previewItems,
    githubTop10: previewGithub,
    preview: { data: previewReader, failWrites: false },
    ratings: { [`item:${first.id}`]: 2, [`repo:${previewGithub[0].repo.toLowerCase()}`]: -1 },
  });
  const groups = [...doc.querySelectorAll('[role="group"][aria-label="Rating"]')];
  assert.equal(groups.length, previewItems.length + previewGithub.length);
  assert.equal(doc.querySelector(`[data-card-id="${first.id}"] [role="group"]`)?.getAttribute("data-rating"), "heart");
  assert.equal(groups.filter((group) => group.getAttribute("data-rating") === "down").length, 1);
});
```

  - Ha az `app/(app)/library/[[]id]/post-toolbar.test.ts` `renderToolbar` segédje nem `RatingsProvider`-ben renderel, az bővül vele, és egy új eset: `rating: 1` → a „Hasznos” gomb `aria-pressed="true"`.

  Futtatás: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts "app/(app)/library/[[]id]/post-toolbar.test.ts"`. Várt: elbukik.

- [ ] **Step 2: A Radar (GREEN).**
  - **`story-card.tsx`:**
    - `CardProps` kap egy `rating: RatingValue | null` mezőt;
    - a `CardFooter` paraméterei közé `rating`, és a „Milestone B puts…” megjegyzés helyére `<RatingControl target={{ kind: "item", id: item.id }} initial={rating} />`;
    - a fejléc-megjegyzés „[rating: milestone B]” helyett „[👎 👍 ❤]”;
    - a `StoryCard` és a `MustReadCard` `<article>` osztálylistája kapja a `${dislikedClass}`-t.
  - **`digest-dashboard.tsx`:**
    - a props `ratings?: Ratings` („The page's ratings by ratingKey (getRatings): the cards' and repos' initial values.”);
    - a `cardProps` kap egy `rating: props.ratings?.[ratingKey({ kind: "item", id: item.id })] ?? null` mezőt;
    - a Top 10 sora:

```tsx
                    {githubTop10.map(({ repo, focus, url, score }, index) => (
                      <div key={repo} className={`flex flex-wrap items-center gap-2 ${dislikedClass}`}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="press focus-ring group flex min-w-0 flex-1 items-center gap-4 border-2 border-ink bg-paper p-4 transition motion-safe:hover:-translate-y-0.5 hover:bg-signal"
                        >
                          <span className="font-display text-3xl text-signal group-hover:text-ink">{String(index + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-sm font-bold">{repo}</span>
                            <span className="block text-sm text-ink/55 group-hover:text-ink/75">{focus}</span>
                          </span>
                          <span className="border border-ink px-2 py-1 font-mono text-[10px]">{score === null ? "—" : `${score}/100`}</span>
                          <ExternalLink className="size-4" />
                        </a>
                        <RatingControl target={{ kind: "repo", id: repo }} initial={props.ratings?.[ratingKey({ kind: "repo", id: repo })] ?? null} />
                      </div>
                    ))}
```

  A sor eddigi `t.tracked` címkéje kikerül: a helyét a pontszám veszi át. Ha a `t.tracked` máshol nem kell, a copy-ból is törlődik.

- [ ] **Step 3: Az oldalak.**
  - **`current-week-page.tsx`:**

```tsx
  const [seed, posts, ratings] = await Promise.all([
    getReaderSeed(reader.db, radar.issue.id),
    readHerePosts(reader.db, radar.items),
    getRatings(reader.db, radarTargets(radar.items, radar.githubTop10)),
  ]);
  return <DigestDashboard {...radar} scope={scope} seed={seed} posts={posts} ratings={ratings} />;
```

  - **`archive/[week]/page.tsx`:**

```tsx
  const [posts, ratings] = await Promise.all([readHerePosts(reader.db, radar.items), getRatings(reader.db, radarTargets(radar.items, radar.githubTop10))]);
  return <DigestDashboard archived {...radar} seed={seed} posts={posts} ratings={ratings} />;
```

  - **A poszt (`library/[id]/page.tsx`):** a `post` után `const ratings = await getRatings(reader.db, [{ kind: "post", id: String(post.id) }]);`, és a `<PostArticle … rating={ratings[`post:${post.id}`] ?? null} />`.
    - A `PostArticle` szignatúrája `rating: RatingValue | null`-t kap, és továbbadja a `PostToolbar`-nak.
    - A `PostToolbar` a gombsor elejére `<RatingControl target={{ kind: "post", id: String(postId) }} initial={rating} />`-t tesz.
    - A `/dev/preview/post` `rating={null}`-t ad.
  - **A Library-lista (`library/(list)/page.tsx`):**

```tsx
  const [posts, open, readIds] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db), getReadPostIds(reader.db)]);
  const ratings = await getRatings(reader.db, posts.map((post) => ({ kind: "post" as const, id: String(post.id) })));
  const ordered = downLast(posts, (post) => ratings[ratingKey({ kind: "post", id: String(post.id) })] === -1);
  return <LibraryView posts={ordered} open={open} readIds={readIds} ratings={ratings} />;
```

  - **`library-view.tsx`:**
    - a props `ratings: Ratings`;
    - a kártya osztálylistája kapja a `${dislikedClass}`-t;
    - a fejléc jobb oldalán a dátum elé `<RatingBadge target={{ kind: "post", id: String(post.id) }} initial={ratings[ratingKey({ kind: "post", id: String(post.id) })] ?? null} />`.
  - **Az előnézet:**
    - a `lib/fixtures.ts` kap egy `previewRatings`-t: ❤ az első hírre, 👎 a második Top 3 hírre, 👍 a `ggml-org/llama.cpp`-re, ❤ a `-1` posztra, 👎 a `-2` posztra;
    - a `/dev/preview` `radar`, `companies` és `library` nézete átadja (`ratings={previewRatings}`); az üres nézetek `{}`-t adnak.
  - **CLAUDE.md → Server path:** a `/` sor: „…then `getReaderSeed` (2 in parallel) beside `readHerePosts` (…) and `getRatings` (one `ratings` query): 4 + ⌈items / 30⌉, two in a row…”; a `/archive/[week]` sor: „3 + 1 + ⌈items / 30⌉, two deep; a closed week from the cache: 3 + ⌈items / 30⌉”.

- [ ] **Step 4: Futtatás, próbák, ellenőrzés, commit.**
  - **Futtatás:** a Step 1 parancsa, majd `npm test`. Várt: zöld.
  - **Próbák:**
    - a `cardProps` `rating` helyett `null`;
    - a Top 10 `RatingControl`-ja törölve;
    - a repó-kulcs `ratingKey` helyett nyers `repo:${repo}`;
    - a `downLast` törlése a Library-oldalon (ez kódolvasással ellenőrizhető; a Playwright méri).
    - Az első három piros.
  - **Az öt ellenőrzés.**
  - **Commit:**

```bash
git commit -m "feat: rate radar items, repos and posts, and mark rated library cards" -- app/components/story-card.tsx app/components/digest-dashboard.tsx app/components/shell.test.ts "app/(app)/current-week-page.tsx" "app/(app)/archive/[week]/page.tsx" "app/(app)/library/(list)/page.tsx" "app/(app)/library/library-view.tsx" "app/(app)/library/[id]/page.tsx" "app/(app)/library/[id]/post-article.tsx" "app/(app)/library/[id]/post-toolbar.tsx" "app/(app)/library/[id]/post-toolbar.test.ts" lib/fixtures.ts app/dev/preview/page.tsx app/dev/preview/post/page.tsx CLAUDE.md
```

### Task 7: A GitHub-fül és a Gyűjtemény

**Files:**
- Create:
  - `app/(app)/archive/archive-tabs.tsx`, `app/(app)/archive/github-view.tsx`, `app/(app)/archive/(list)/github/page.tsx`;
  - `app/(app)/collection/page.tsx`, `loading.tsx`, `collection-view.tsx`;
  - `app/(app)/archive/github-view.test.ts`, `app/(app)/collection/collection-view.test.ts`.
- Modify: `app/(app)/archive/archive-view.tsx`, `lib/nav.ts`, `lib/nav.test.ts`, `lib/fixtures.ts`, `app/dev/preview/preview-nav.tsx`, `app/dev/preview/page.tsx`.

**Interfaces:**
- Consumes: `getGithubRepos`, `githubPage`, `GithubRepo`, `getFavorites`, `Favorite` (Task 4); `RatingControl`, `dislikedClass` (Task 5); `ratingFilter`, `RatingFilter` (Task 1).
- Produces:
  - `ArchiveTabs({ current: "weeks" | "github" })`;
  - `GithubView({ repos, more, languages, filters })`, ahol `filters: { rating?: RatingFilter; language?: string; page: number }`;
  - `CollectionView({ favorites, kind })`, ahol `kind?: RatingKind`;
  - `previewGithubRepos`, `previewFavorites` (`lib/fixtures.ts`).

- [ ] **Step 1: Tesztek (RED).**
  - **A menü:** a `lib/nav.test.ts`-ben:
    - az `activeNavId` tesztje kap egy `assert.equal(activeNavId("/collection"), "collection");` és egy `assert.equal(activeNavId("/archive/github"), "archive");` sort;
    - a mobil-teszt egy `assert.equal(inMobileMore(activeNavId("/collection")), true);` sort;
    - új teszt:

```ts
// G1 spec 5. Kills the collection left "soon" (an inert row), or kept off the mobile "Több".
test("the collection is a live page in the mobile Több sheet", () => {
  const collection = NAV_ITEMS.find((item) => item.id === "collection");
  assert.deepEqual([collection?.href, collection?.soon, collection?.mobileMore], ["/collection", undefined, true]);
  assert.equal(switchesLanguageInPlace("/collection"), true);
});
```

  - **A GitHub-fül:** `app/(app)/archive/github-view.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { previewGithubRepos } from "../../../lib/fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { GithubView } = await import("./github-view.tsx");
const { LanguageProvider } = await import("../../components/language-context.tsx");
const { RatingsProvider } = await import("../../components/rating-control.tsx");

const view = (props: Parameters<typeof GithubView>[0]) =>
  render(createElement(LanguageProvider, { initial: "hu" }, createElement(RatingsProvider, { send: async () => ({}) }, createElement(GithubView, props))));

// G1 spec 4. Kills a row without its repo link or its rating, a filter link that drops the other filter,
// the "more" link shown on the last page or not carrying the filters, and the weeks tab marked current.
test("the GitHub tab lists each repo with its rating, and its filter and more links keep the other filters", () => {
  const doc = view({ repos: previewGithubRepos, more: true, languages: ["C++", "Python"], filters: { rating: "heart", language: "Python", page: 1 } });
  assert.equal(doc.querySelectorAll("li").length, previewGithubRepos.length);
  assert.equal(doc.querySelectorAll('li [role="group"]').length, previewGithubRepos.length);
  assert.ok(doc.querySelector(`a[href="${previewGithubRepos[0].url}"]`));
  const hrefs = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.ok(hrefs.includes("/archive/github?rating=up&lang=Python"), "a rating chip keeps the language");
  assert.ok(hrefs.includes("/archive/github?rating=heart&lang=C%2B%2B"), "a language chip keeps the rating");
  assert.ok(hrefs.includes("/archive/github?rating=heart&lang=Python&page=2"), "more keeps both");
  assert.equal(doc.querySelector('a[aria-current="page"]')?.getAttribute("href"), "/archive/github");
  const last = view({ repos: previewGithubRepos, more: false, languages: [], filters: { page: 1 } });
  assert.equal([...last.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("page=")), false);
});
```

  - **A Gyűjtemény:** `app/(app)/collection/collection-view.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { previewFavorites } from "../../../lib/fixtures.ts";
import { render } from "../../../lib/test/render.ts";

const { CollectionView } = await import("./collection-view.tsx");
const { LanguageProvider } = await import("../../components/language-context.tsx");
const { RatingsProvider } = await import("../../components/rating-control.tsx");

const view = (props: Parameters<typeof CollectionView>[0]) =>
  render(createElement(LanguageProvider, { initial: "hu" }, createElement(RatingsProvider, { send: async () => ({}) }, createElement(CollectionView, props))));

// G1 spec 5. Kills the kind filter ignored, a row without its heart (it could never be taken back),
// a Library post opened in a new tab, and a missing empty state.
test("the collection lists the hearts by kind, each with its rating group pressed on the heart", () => {
  const all = view({ favorites: previewFavorites });
  assert.equal(all.querySelectorAll("li").length, previewFavorites.length);
  assert.equal(all.querySelectorAll('li [role="group"][data-rating="heart"]').length, previewFavorites.length);
  const posts = view({ favorites: previewFavorites, kind: "post" });
  assert.deepEqual([...posts.querySelectorAll("li a")].map((a) => [a.getAttribute("href")?.startsWith("/library/"), a.getAttribute("target")]), [[true, null]]);
  assert.equal(view({ favorites: [] }).querySelectorAll("li").length, 0);
  assert.match(view({ favorites: [] }).body.textContent ?? "", /Még nincs kedvenced/);
});
```

  Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts "app/(app)/archive/github-view.test.ts" "app/(app)/collection/collection-view.test.ts"`. Várt: elbukik.

- [ ] **Step 2: A fixture-ök és a menü (GREEN, 1).**
  - **`lib/fixtures.ts`:**
    - `previewGithubRepos: GithubRepo[]`, három repó: egy ❤-es (`rating: 2`), egy értékeletlen, és egy 👎-os a lista végén (`rating: -1`), különböző nyelvvel, és egy G1 előtti sor `stars/language/score: null`-lal;
    - `previewFavorites: Favorite[]`: egy hír (`external: true`, `detail: "Blog · W39"`), egy poszt (`id: "-1"`, `href: "/library/-1"`, `external: false`, `detail: null`) és egy repó;
    - mindegyik a meglévő fixture-adatokra épül, a poszt negatív azonosítóval.
  - **`lib/nav.ts`:**
    - a gyűjtemény sora: `{ id: "collection", href: "/collection", mobileMore: true, label: { hu: "Gyűjtemény", en: "Collection" } },` (a `soon` kikerül);
    - az `IN_PLACE_LANGUAGE`-be: `/^\/collection\/?$/`.

- [ ] **Step 3: Az archívum fülei és a GitHub-fül (GREEN, 2).**
  - **`app/(app)/archive/archive-tabs.tsx`:**

```tsx
"use client";

import Link from "next/link";
import { useLanguage } from "@/app/components/language-context";

const copy = {
  hu: { label: "Archívum nézetei", weeks: "Hetek", github: "GitHub" },
  en: { label: "Archive views", weeks: "Weeks", github: "GitHub" },
};

/** "Hetek / GitHub" under the archive's hero (G1 spec 4). */
export function ArchiveTabs({ current }: { current: "weeks" | "github" }) {
  const t = copy[useLanguage().language];
  const tab = (id: "weeks" | "github", href: string) => (
    <Link
      href={href}
      aria-current={current === id ? "page" : undefined}
      className="press-ink focus-ring flex min-h-10 items-center border-2 border-paper/30 px-4 font-mono text-xs aria-[current=page]:border-signal aria-[current=page]:text-signal"
    >
      {t[id]}
    </Link>
  );
  return (
    <nav aria-label={t.label} className="mx-auto flex max-w-6xl gap-2 px-4 pt-8 sm:px-10">
      {tab("weeks", "/archive")}
      {tab("github", "/archive/github")}
    </nav>
  );
}
```

  Az `ArchiveView` a `PageHero` után `<ArchiveTabs current="weeks" />`-t renderel.

  - **`app/(app)/archive/github-view.tsx`:** szerverkomponens.
    - Felül egy `PageHero` (`eyebrow="REPOS / REPÓK"`, `title="GITHUB"`, lead: „A heti Top 10 repói egy listában: mikor voltak fent, hányadikak lettek, és mit gondolsz róluk.” / „Every weekly Top 10 repo in one list: when it was up, how high it ranked, and what you think of it.”), alatta `<ArchiveTabs current="github" />`.
    - **Két chip-sor linkekből:**
      - értékelés: Mind / ❤ / 👍 / 👎 / Értékeletlen;
      - nyelv: Mind és a `languages`;
      - az aktív chip `aria-current="page"`;
      - minden link a `githubHref` segéddel épül, és megtartja a másik szűrőt.

```ts
/** The tab's link with `filters` merged in; page 1 and an empty filter stay out of the URL. */
export function githubHref(filters: { rating?: RatingFilter; language?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (filters.rating) params.set("rating", filters.rating);
  if (filters.language) params.set("lang", filters.language);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/archive/github?${query}` : "/archive/github";
}
```

    - **Egy sor (`<li>`):**
      - a `dislikedClass`-t kapja;
      - a repó neve linkként (`href={repo.url}`, `target="_blank"`), alatta a leírás;
      - egy mono sor: `nyelv · ★ csillag · pontszám/100 · W38–W40 · N hét · legjobb #K` (a hiányzó érték „—”);
      - és a `<RatingControl target={{ kind: "repo", id: repo.key }} initial={repo.rating} />`.
    - **Alul:** ha `more`, egy „Továbbiak” / „More” link `githubHref({ ...filters, page: filters.page + 1 })`-re.
    - **Üres állapot:** „Ehhez a szűrőhöz nincs repó.” / „No repo matches this filter.”
    - Minden szöveg egy `copy`-ból jön, `LocalizedText`-tel.
  - **`app/(app)/archive/(list)/github/page.tsx`:**

```tsx
import { redirect } from "next/navigation";
import { getGithubRepos, githubPage } from "@/lib/content";
import { ratingFilter } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";
import { GithubView } from "../../github-view";

export const dynamic = "force-dynamic";

export default async function GithubTabPage({ searchParams }: { searchParams: Promise<{ rating?: string; lang?: string; page?: string }> }) {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/archive/github");
  const query = await searchParams;
  const filters = { rating: ratingFilter(query.rating), language: query.lang || undefined, page: githubPage(query.page) };
  return <GithubView {...await getGithubRepos(reader.db, filters)} filters={filters} />;
}
```

- [ ] **Step 4: A Gyűjtemény (GREEN, 3).**
  - **`app/(app)/collection/collection-view.tsx`:** szerverkomponens.
    - `PageHero` (`eyebrow="FAVOURITES / KEDVENCEK"`, `title="GYŰJTEMÉNY"`, lead: „Amit szívvel jelöltél: hírek, posztok és repók, hetektől függetlenül.” / „What you marked with a heart: news, posts and repos, whatever the week.”).
    - Chip-linkek: Mind / Hírek / Posztok / Repók (`/collection`, `/collection?kind=item|post|repo`), az aktív `aria-current="page"`.
    - Sorok a `favorites` `kind` szerint szűrt listájából, egy-egy `<li>`:
      - a cím linkként: a külső `target="_blank" rel="noreferrer"`-rel, a poszt `next/link`-kel;
      - a `Localized` cím `LocalizedText`-tel, a sima szöveg úgy, ahogy van;
      - egy mono sor a típus nevével és a `detail`-lel;
      - és a `<RatingControl target={{ kind: favorite.kind, id: favorite.id }} initial={2} />`.
    - Üres állapot: „Még nincs kedvenced. A ❤ gombbal jelölhetsz híreket, posztokat és repókat.” / „No favourites yet. Mark news, posts and repos with the ❤ button.”
  - **`app/(app)/collection/page.tsx`:**

```tsx
import { redirect } from "next/navigation";
import { getFavorites } from "@/lib/content";
import type { RatingKind } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";
import { CollectionView } from "./collection-view";

export const dynamic = "force-dynamic";

const KINDS: RatingKind[] = ["item", "post", "repo"];

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/collection");
  const { kind } = await searchParams;
  return <CollectionView favorites={await getFavorites(reader.db)} kind={KINDS.find((known) => known === kind)} />;
}
```

  - **`app/(app)/collection/loading.tsx`:** a `ListSkeleton`, mint az `archive/(list)/loading.tsx`.
  - **Az előnézet:**
    - a `PREVIEW_VIEWS` kap egy `"github"` és egy `"collection"` elemet (az `archive-empty` után);
    - a `/dev/preview` renderel egy `<GithubView repos={previewGithubRepos} more languages={["C++", "Python", "Rust"]} filters={{ page: 1 }} />`-t és egy `<CollectionView favorites={previewFavorites} />`-t.

- [ ] **Step 5: Futtatás, próbák, ellenőrzés, commit.**
  - **Futtatás:** a Step 1 parancsa. Várt: zöld.
  - **Próbák:**
    - a `githubHref` `lang` ága törölve;
    - a „Továbbiak” `more` feltétele helyett mindig;
    - a gyűjtemény `kind` szűrője törölve;
    - a menü `mobileMore` törölve.
    - Mind piros.
  - **Az öt ellenőrzés.** Ha a `dup` klónt jelez a két chip-sor vagy a két nézet sorai között, közös `FilterChips` komponens jön az `app/components/`-be.
  - **Commit:**

```bash
git add "app/(app)/archive/archive-tabs.tsx" "app/(app)/archive/github-view.tsx" "app/(app)/archive/github-view.test.ts" "app/(app)/archive/(list)/github/page.tsx" "app/(app)/collection"
git commit -m "feat: add the archive's github tab and the collection of favourites" -- "app/(app)/archive" "app/(app)/collection" lib/nav.ts lib/nav.test.ts lib/fixtures.ts app/dev/preview/preview-nav.tsx app/dev/preview/page.tsx
```

### Task 8: Doksi, Playwright és zárás

**Files:** `CLAUDE.md`, `DESIGN.md`, `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `TODO.md`; a próbák szkriptjei a `.playwright-mcp/`-ben (git- és lint-ignorált), a végén törlődnek.

- [ ] **Step 1: Doksi.**
  - **CLAUDE.md:**
    - **Routes:** a `POST /api/state` sor `set_rating`-et kap, és a `400 invalid_target`, `invalid_rating` kódokat.
    - **Database:** új pont: `ratings` (own rows only, `target_kind`/`target_id`, a repó kisbetűs), és a `github_repos` nézet (`security_invoker`, az olvasó saját értékelésével).
    - **App shell:** a „One list” pontban a „dimmed hamarosan views” közül a Gyűjtemény él, és a mobil „Több” alatt van; új pont a `RatingsProvider`-ről (a shell adja, az előnézet memóriába ír).
  - **DESIGN.md → Components:** új `### RatingControl` szakasz: a hármas csoport, a `dislikedClass` (halvány és szaggatott), a Library-jelvény, és a kivonat a `dislikedClass` sorából.
  - **README.md → Migrations:** a táblázat új sora a `20261003000000_ratings_github_repos.sql`-hez a meglévő sorok formájában („ratings, github_top stars/language/score, the github_repos view”). A Codemap sorai a `/collection`-ről és az `/archive/github`-ról.
  - **ARCHITECTURE.md → Codemap:** a `collection/` és az `archive/(list)/github/` útvonal.
  - **AGENTS.md → Commands:** a preview nézetek listája kap egy `github|collection`-t.
  - **TODO.md:**
    - a „Kész” alá egy G1 sor;
    - a GitHub-radar pontban a G1 kész, a G2 és a G3 marad;
    - a „Következő lépések” elejére: „A G1 élesítése: a `20261003000000_ratings_github_repos.sql` futtatása **a deploy előtt** (a Radar lekérdezése az új oszlopokat olvassa), utána a merge.”

- [ ] **Step 2: Playwright** a dev serveren (a `.next/cache/turbopack` törlése után, TESTING.md → Pitfalls):
  1. **Radar** (1280): a kártya ❤ gombja `aria-pressed="true"` lesz, egy második ❤ törli. Egy 👎 elhalványítja a kártyát (`opacity` 0.6, `border-style` dashed). A Top 10 sorában van gombcsoport és pontszám.
  2. **`fail=1`:** egy ❤ után a gomb visszaáll, és a toast „Nem sikerült…”.
  3. **Review Focus 5:** ❤ a Radaron, aztán a Library nézet, aztán Vissza (`page.goBack()`): a kártya ❤-je megmaradt.
  4. **Library:** a 👎-os poszt kártyája a lista végén van, halványan; a ❤-es kártyán a jelvény.
  5. **GitHub-fül** (`view=github`): a sorok, a chipek hrefjei, a „Továbbiak”; egy ❤ a soron.
  6. **Gyűjtemény** (`view=collection`): a három sor, a chipek; egy ❤ levétele után a gomb nincs lenyomva.
  7. **360 és 1280 px-en:** a `radar`, `library`, `github` és `collection` nézeten nincs vízszintes görgetés, a konzol tiszta, és a gombcsoport gombjai érintéssel legalább 40 px-esek.

- [ ] **Step 3: Az öt ellenőrzés, commit.**

```bash
git commit -m "docs: document ratings, the github tab and the collection" -- CLAUDE.md DESIGN.md README.md ARCHITECTURE.md AGENTS.md TODO.md
```

  A próbákból jövő javítás a saját `fix:` commitjába megy, egy előbb elbukó teszttel, ha logikai.

### A záró review

Egy friss reviewer a legerősebb modellen nézi az egész branchet (`git diff google-sso...github-ratings`), a spec és ez a terv mellett. Külön figyel:
- a Review Focus öt sorára;
- az RLS-re és a nézet `auth.uid()`-jára (egy olvasó nem láthatja más értékelését);
- a migráció és a deploy sorrendjére;
- a `github_top` napi felülírására (a heti Top 10 minden futáskor újraíródik: a `github_repos` ettől még helyes-e);
- a zárt hetek gyorsítótárának `v3`-ára;
- és hogy az előnézet sehol nem ír valódi adatot.

A javítások egy körben jönnek, mindegyik egy előbb elbukó teszttel.
