# Napi hírek — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esti napi futás, amely a heti szám mellé kiválasztja a nap Top 10-ét (3–5 rövid olvasmánnyal, történet szintű ismétlésszűréssel), a Library-tükörrel 2–3 perces briefet ír hozzájuk, és egy `/daily` nézetben mutatja őket.

**Architecture:** A `runDaily` 14:00 UTC-re költözik; a válogató prompt megkapja az elmúlt 14 nap címeit, a beszúrt sorokból (és a nap korábbi listájából) a `pickDailyTop` választ, az eredmény a `daily_top` táblába kerül. A `queueMirrors` a Top 10-et is tükrözi, az összefoglaló-hívás egy `brief` mezőt is ír a `posts`-ba. A `/daily` a `DigestDashboard` új `daily` scope-ja, a `getDaily` adatával.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase (Postgres, PostgREST), zod/v4, `node --test`, Tailwind 4.

**Spec:** `.claude/docs/specs/2026-10-12-daily-news-design.md`

## Global Constraints

- A migráció csak hozzáad; a tulajdonos futtatja kézzel az SQL Editorban, a deploy előtt. Soha `supabase db push`.
- A Radar `item.id` append-only: az `itemId()` bemenetei nem változnak; a `daily.test.ts` két rögzített id-je változatlan marad.
- `lib/` alatt relatív `.ts` importok, `@/` nélkül (kivéve a `lib/content.ts`, ami eddig is `@/`-t használ).
- Minden UI-szöveg egy `{ hu, en }` copy-objektumban, mindkét nyelven.
- Nincs új függőség. Nincs `NEXT_PUBLIC_` változó, nincs nyers HTML.
- Az előnézet nem nyúl valódi adathoz: új fixture-ök negatív id-vel ott, ahol id kell; írás csak a memóriás küldőkön át.
- Minden commit előtt: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`, a `dup` új klón nélkül.
- Commit: Conventional Commits, kisbetűs felszólító tárgy, explicit pathspec, attribution-sor nélkül. Push nincs.
- Időzítés (spec N2): `/api/cron/daily` `0 14 * * *`; `/api/cron/mirror` `0 15 * * *`, `0 16 * * *`, `0 17 * * *`.
- A Top 10 szabálya (spec N4): méret 10, rövid = `read_minutes <= 15`, legalább 3, legfeljebb 5 rövid, ha van belőle.
- A brief (spec N5): nyelvenként 3–5 bekezdés, 300–450 szó; üres, ha csak a leírás érhető el.
- A nap a budapesti dátum (`Europe/Budapest`).

## Review Focus

1. **Egy aznapi második futás (kézi `curl`) nem zsugoríthatja a nap listáját** a csak most beszúrt tételekre: a nap meglévő Top 10-e és az új tételek együtt versenyeznek (Task 2 teszteli).
2. **Egy 14 napnál régebben tárolt URL-t a modell újra kiválaszt:** az upsert eldobja, és nem kaphat `daily_top` sort, különben a külső kulcs miatt az egész futás elbukik (Task 2 teszteli).
3. **A futás késő este, a nyári/téli időszámítás határán:** a nap a budapesti dátum, nem az UTC-é (Task 1 teszteli).
4. **Egy telepítés utáni, régi alakú zárt hét a gyorsítótárban:** a `closed-week` kulcs verziója nő, így a régi alakú adat nem jön vissza (Task 5 teszteli).
5. **A `/daily` 18:00 előtt, vagy ha a futás elbukott:** a tegnapi lista látszik a dátumával és a „mai 18:00-ra készül” sorral, nem üres oldal (Task 7 teszteli).

---

### Task 1: A nap és a Top 10 kiválasztása (tiszta függvények)

**Files:**
- Create: `lib/pipeline/daily-top.ts`
- Test: `lib/pipeline/daily-top.test.ts`

**Interfaces:**
- Produces: `budapestDay(now: Date): string` (`"2026-10-12"`); `type DailyCandidate = { id: string; score: number; read_minutes: number }`; `pickDailyTop<T extends DailyCandidate>(items: T[]): T[]`; `DAILY_SIZE = 10`; `SHORT_MINUTES = 15`.

- [ ] **Step 1: A teszt**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { budapestDay, pickDailyTop, type DailyCandidate } from "./daily-top.ts";

const item = (id: string, score: number, minutes: number): DailyCandidate => ({ id, score, read_minutes: minutes });
const ids = (items: DailyCandidate[]) => items.map((entry) => entry.id);
const longs = (n: number, from: number) => Array.from({ length: n }, (_, i) => item(`L${i}`, from - i, 30));

// Spec N2, Review Focus 3. Kills the UTC date: 23:30 in Budapest is still that evening, 00:30 the next day,
// in summer (UTC+2) and in winter (UTC+1).
test("budapestDay is the date in Budapest, across midnight in summer and winter", () => {
  assert.equal(budapestDay(new Date("2026-07-01T21:30:00Z")), "2026-07-01");
  assert.equal(budapestDay(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
  assert.equal(budapestDay(new Date("2026-01-15T22:30:00Z")), "2026-01-15");
  assert.equal(budapestDay(new Date("2026-01-15T23:30:00Z")), "2026-01-16");
});

// Spec N4. Kills a list not cut at 10 or not ranked by score.
test("pickDailyTop takes the ten best by score when the short reads already fit", () => {
  const items = [...longs(8, 90), item("S1", 70, 5), item("S2", 69, 10), item("S3", 68, 15), item("X", 10, 4)];
  assert.deepEqual(ids(pickDailyTop(items)), ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "S1", "S2", "S3"].slice(0, 10));
});

// Spec N4. Kills too few short reads kept (the best long ones crowd them out) and the wrong long ones dropped:
// the lowest-scored long reads make room for the best short ones, and the list is ranked again.
test("pickDailyTop swaps the lowest long reads for the best short ones until three are short", () => {
  const items = [...longs(10, 90), item("S1", 60, 8), item("S2", 50, 15), item("S3", 40, 3), item("S4", 30, 2)];
  assert.deepEqual(ids(pickDailyTop(items)), ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "S1", "S2", "S3"]);
});

// Spec N4. Kills more than five short reads kept while long ones wait, and a swap that runs past the
// long reads there are.
test("pickDailyTop keeps at most five short reads, as far as long ones allow", () => {
  const shorts = Array.from({ length: 12 }, (_, i) => item(`S${i}`, 99 - i, 5));
  assert.deepEqual(ids(pickDailyTop([...shorts, ...longs(3, 50)])), ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "L0", "L1", "L2"]);
  const plenty = [...shorts, ...longs(9, 50)];
  assert.equal(pickDailyTop(plenty).filter((entry) => entry.read_minutes <= 15).length, 5);
});

// Kills a short day padded or a missing short read invented, a tie reordered, and a crash on no items.
test("pickDailyTop keeps a short day whole, ties in their given order, and nothing for nothing", () => {
  assert.deepEqual(ids(pickDailyTop([item("a", 50, 30), item("b", 80, 30)])), ["b", "a"]);
  assert.deepEqual(ids(pickDailyTop(longs(12, 90))), ids(longs(10, 90)));
  assert.deepEqual(ids(pickDailyTop([item("first", 70, 30), item("second", 70, 30)])), ["first", "second"]);
  assert.deepEqual(pickDailyTop([]), []);
});
```

A második teszt `slice(0, 10)`-je szándékos: a lista 11 tételből a 10 legjobbat adja (`X` kimarad).

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily-top.test.ts`
Expected: FAIL, `Cannot find module ... daily-top.ts`.

- [ ] **Step 3: A kód**

```ts
// The day's Top 10 (daily news spec N4), framework-free so node --test runs it.

const budapestDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" });

/** The day a run belongs to, as Budapest sees it ("2026-10-12"): a late manual run stays on its own evening. */
export const budapestDay = (now: Date) => budapestDate.format(now);

export const DAILY_SIZE = 10;
export const SHORT_MINUTES = 15;
const MIN_SHORT = 3;
const MAX_SHORT = 5;

export type DailyCandidate = { id: string; score: number; read_minutes: number };

/**
 * The ten best by score, with 3–5 short reads (≤ 15 minutes) whenever the day has them: the lowest-scored of
 * the other kind make room for the best of the wanted kind. Ties keep the given order (the model's answer).
 */
export function pickDailyTop<T extends DailyCandidate>(items: T[]): T[] {
  const order = new Map(items.map((entry, index) => [entry, index]));
  const byScore = (a: T, b: T) => b.score - a.score || order.get(a)! - order.get(b)!;
  const ranked = [...items].sort(byScore);
  const top = ranked.slice(0, DAILY_SIZE);
  const rest = ranked.slice(DAILY_SIZE);
  const isShort = (entry: T) => entry.read_minutes <= SHORT_MINUTES;
  const shortCount = () => top.filter(isShort).length;
  const swapIn = (wantShort: boolean) => {
    const out = top.findLastIndex((entry) => isShort(entry) !== wantShort);
    const into = rest.findIndex((entry) => isShort(entry) === wantShort);
    if (out === -1 || into === -1) return false;
    [top[out], rest[into]] = [rest[into], top[out]];
    return true;
  };
  while (shortCount() < MIN_SHORT && swapIn(true));
  while (shortCount() > MAX_SHORT && swapIn(false));
  return top.sort(byScore);
}
```

- [ ] **Step 4: Futtatás, zöld**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily-top.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Mutációs próbák** (`scratchpad/probe.py`): `<= SHORT_MINUTES` → `< SHORT_MINUTES`; a `findLastIndex` → `findIndex`; a `|| order.get…` törlése; az `"en-CA"` formázó `timeZone` törlése. Mindegyiket meg kell fognia egy tesztnek.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/daily-top.ts lib/pipeline/daily-top.test.ts
git commit -m "feat: pick the day's top 10 with three to five short reads"
```

---

### Task 2: A napi futás: ismétlésszűrés, a Top 10 írása, migráció, cronok

**Files:**
- Modify: `lib/pipeline/daily.ts` (`curatePrompt`, `runDaily`)
- Modify: `lib/pipeline/fake-db.ts` (a generikus `upsert` `.select()`-et kap)
- Modify: `lib/pipeline/daily.test.ts`, `app/api/cron/daily/route.test.ts`
- Create: `supabase/migrations/20261012000000_daily_top_and_brief.sql`
- Modify: `vercel.json`, `app/api/cron/mirror/route.ts` (komment)
- Create: `lib/cron-schedule.test.ts`

**Interfaces:**
- Consumes: `budapestDay`, `pickDailyTop`, `DailyCandidate` (Task 1).
- Produces: `curatePrompt(picked, repos, covered?: string[])`; a `runDaily` válasza `{ issue, candidates, shortlisted, inserted, repos, daily }`; a `daily_top` tábla (`day date`, `rank smallint`, `item_id text`); a `posts.brief jsonb` oszlop.

- [ ] **Step 1: A teszt-segéd: a `gte` szűr, az upsert `.select()`-et kap** (előbb ez, mert a tesztek erre épülnek). A `lib/pipeline/fake-db.ts` `tableQuery`-jében a `gte` eddig csak rögzített; mostantól szűr is (ISO-időbélyegek szövegként összevethetők; a mezőt nem tartalmazó sor átmegy, mint a `like`-nál):

```ts
    gte: (column: string, value: unknown) => {
      onGte(column, value);
      kept.push((row) => !(column in row) || String(row[column]) >= String(value));
      return record("gte", column, value);
    },
```

A generikus ágban a mostani

```ts
      upsert: async (values: unknown, options?: Record<string, unknown>) => {
        upserts.push({ table, values, options: options ?? {} });
        return { data: null, error: writeError ?? null };
      },
```

helyére:

```ts
      // Awaited as is, or through `.select(columns)`, which answers the rows written. With ignoreDuplicates
      // (ON CONFLICT DO NOTHING) a row whose `url` the table's fixture rows already hold is not written.
      upsert: (values: unknown, options?: Record<string, unknown>) => {
        upserts.push({ table, values, options: options ?? {} });
        const written = () => {
          const list = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
          const known = new Set((tables.rows?.[table] ?? []).map((row) => row.url));
          return options?.ignoreDuplicates ? list.filter((row) => !known.has(row.url)) : list;
        };
        return {
          select: async (columns = "*") => (writeError ? { data: null, error: writeError } : { data: written().map((row) => project(row, columns)), error: null }),
          then: (onFulfilled: (result: UpdateResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: null, error: writeError ?? null }).then(onFulfilled, onRejected),
        };
      },
```

- [ ] **Step 2: A tesztek** (`lib/pipeline/daily.test.ts` végére), és a meglévők igazítása:
  - az első `runDaily`-teszt elvárása: `{ issue: "2026-W39", candidates: 1, shortlisted: 1, inserted: 1, repos: 1, daily: 1 }`;
  - az első teszt a `curatedItem(0, "Fresh story")` tételt tegye a napi Top 10-be: `assert.deepEqual(upserted.daily_top.values, [{ day: "2026-09-23", rank: 1, item_id: item.id }])` és `assert.deepEqual(upserted.daily_top.options, { onConflict: "day,rank" })`;
  - a `db.deletes` elvárása bővül: `[{ table: "github_top", … }, { table: "daily_top", filters: [["day", "2026-09-23"], ["rank", 1, "gt"]] }]`.

```ts
// Spec N3. Kills the covered titles left out of the prompt (the model would repeat a story told yesterday),
// the list unbounded (14 days can hold 350 items), and the one-story-one-item rule dropped.
test("curatePrompt lists what the last 14 days already covered, and asks for one item per story", () => {
  const covered = Array.from({ length: 450 }, (_, i) => `Covered story ${i}`);
  const prompt = curatePrompt(picked, [], covered);
  assert.match(prompt, /ALREADY COVERED[^\n]*\n- Covered story 0\n/);
  assert.match(prompt, /- Covered story 399\n/);
  assert.doesNotMatch(prompt, /Covered story 400/);
  assert.match(prompt, /same story/);
  assert.doesNotMatch(curatePrompt(picked, []), /ALREADY COVERED/);
});

/** A run whose model curates `items` from one feed item each, with the given scores and minutes. */
async function dailyRun(t: TestContext, picks: { title: string; score: number; minutes: number }[], tables: Parameters<typeof fakeDb>[1] = {}) {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  const rss = `<rss><channel>${picks.map((p, i) => `<item><title>${p.title}</title><link>https://blog.test/${i}</link><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;
  let prompt = "";
  mockFetch(t, async (url, init) => {
    if (url === feeds[0].url) return new Response(rss);
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      prompt = geminiPrompt(init);
      return geminiResponse({ items: picks.map((p, i) => ({ ...curatedItem(i, p.title), score: p.score, readMinutes: p.minutes })), github: [] });
    }
    return new Response("", { status: 404 });
  });
  const db = fakeDb(undefined, tables);
  const result = await runDaily(db, new Date("2026-09-23T14:00:00Z"));
  return { db, result, prompt: () => prompt };
}

// Spec N3. Kills the recent lookup still asking for URLs only: the titles feed the ALREADY COVERED block.
test("runDaily hands the model the titles stored in the last 14 days", async (t) => {
  const { prompt } = await dailyRun(t, [{ title: "New", score: 80, minutes: 5 }], {
    rows: { digest_items: [{ url: "https://old.test/a", title: { hu: "Régi", en: "Old story" } }] },
  });
  assert.match(prompt(), /ALREADY COVERED[^\n]*\n- Old story\n/);
});

// Review Focus 2. Kills a daily_top row for an item the upsert ignored (its URL was stored more than 14 days
// ago): the foreign key would fail the whole run. Only the rows written count.
test("runDaily ranks only the items this run wrote", async (t) => {
  // Stored long ago: past the 14-day lookup, so the model sees it, but the upsert skips it.
  const { db, result } = await dailyRun(t, [{ title: "Kept", score: 80, minutes: 5 }, { title: "Old", score: 99, minutes: 5 }], {
    rows: { digest_items: [{ url: "https://blog.test/1", created_at: "2026-08-01T00:00:00Z" }] },
  });
  const top = db.upserts.find((u) => u.table === "daily_top")?.values as { item_id: string }[];
  assert.equal(top.length, 1);
  assert.match(top[0].item_id, /kept/);
  assert.equal(result.inserted, 1);
});

// Review Focus 1. Kills a second run of the day replacing the list with only its own new items: the day's
// earlier Top 10 and the new items compete together, so the list only improves.
test("a second run of the day keeps the earlier picks in the race", async (t) => {
  const earlier = { day: "2026-09-23", digest_items: { id: "earlier-best", score: 95, read_minutes: 5 } };
  const { db } = await dailyRun(t, [{ title: "Later", score: 60, minutes: 30 }], { rows: { daily_top: [earlier] } });
  const top = db.upserts.find((u) => u.table === "daily_top")?.values as { rank: number; item_id: string }[];
  assert.deepEqual(top.map((row) => row.rank), [1, 2]);
  assert.equal(top[0].item_id, "earlier-best");
  assert.match(top[1].item_id, /-later-/);
});
```

A `dailyRun`-hoz a fájl tetején: `import { test, type TestContext } from "node:test";`.

- [ ] **Step 3: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily.test.ts`
Expected: FAIL (a `curatePrompt` harmadik paramétere, a `daily` mező, a `daily_top` írás hiányzik).

- [ ] **Step 4: A kód** (`lib/pipeline/daily.ts`)

Import: `import { budapestDay, pickDailyTop, type DailyCandidate } from "./daily-top.ts";`, és `const MAX_COVERED = 400;`.

A `curatePrompt` aláírása és a PART 1 sorai:

```ts
export function curatePrompt(picked: Candidate[], repos: Repo[], covered: string[] = []): string {
```

a `- Skip promotions: …` sor után új sor:

```ts
- One story, one item: when several NEWS entries report the same story, keep the one from the primary source (the lab, company or author) and skip the rest.${covered.length ? "\n- Skip a story the ALREADY COVERED list below already told, unless it brings a substantial new development." : ""}
```

és a `NEWS:` előtt:

```ts
${covered.length ? `ALREADY COVERED (the last 14 days' stories):\n${covered.slice(0, MAX_COVERED).map((title) => `- ${title}`).join("\n")}\n\n` : ""}NEWS:
```

A `runDaily`-ben a recent lekérdezés:

```ts
  // Anything already stored in the last two weeks is not news again, by URL here and by story in the prompt.
  const { data: recent, error: recentError } = await db
    .from("digest_items")
    .select("url, title")
    .gte("created_at", new Date(now.getTime() - 14 * DAY).toISOString())
    .order("created_at", { ascending: false });
  if (recentError) throw recentError;
  const known = new Set((recent ?? []).map((row) => row.url as string));
  const covered = (recent ?? []).map((row) => (row.title as { en?: string } | null)?.en).filter((title): title is string => Boolean(title));
```

a hívás: `curatePrompt(picked, repos, covered)`.

Az `items` beszúrása:

```ts
  let fresh: DailyCandidate[] = [];
  if (items.length) {
    // ignoreDuplicates: an existing row (same URL) is never rewritten — ids are permanent. The rows answered
    // are the ones written, so an item the upsert skipped never gets a daily_top row.
    const { data, error } = await db.from("digest_items").upsert(items, { onConflict: "url", ignoreDuplicates: true }).select("id, score, read_minutes");
    if (error) throw error;
    fresh = (data ?? []) as DailyCandidate[];
  }
```

a `github_top` blokk után:

```ts
  const daily = await writeDailyTop(db, budapestDay(now), fresh);
```

a visszatérés: `return { issue: week.id, candidates: candidates.length, shortlisted: picked.length, inserted: fresh.length, repos: top.length, daily };`

és a fájl végére:

```ts
/**
 * The day's Top 10 (spec N4, N6): the day's earlier picks and this run's new items compete together, so a
 * second run of the day can only improve the list. Answers how many it ranked.
 */
async function writeDailyTop(db: SupabaseClient, day: string, fresh: DailyCandidate[]): Promise<number> {
  const { data: kept, error } = await db.from("daily_top").select("digest_items(id, score, read_minutes)").eq("day", day);
  if (error) throw error;
  const earlier = (kept ?? []).map((row) => row.digest_items as unknown as DailyCandidate | null).filter((item): item is DailyCandidate => item !== null);
  const known = new Set(earlier.map((item) => item.id));
  const daily = pickDailyTop([...earlier, ...fresh.filter((item) => !known.has(item.id))]);
  if (!daily.length) return 0;
  const { error: upsertError } = await db.from("daily_top").upsert(daily.map((item, index) => ({ day, rank: index + 1, item_id: item.id })), { onConflict: "day,rank" });
  if (upsertError) throw upsertError;
  // Like github_top: an earlier run's ranks past today's list would stay behind.
  const { error: trimError } = await db.from("daily_top").delete().eq("day", day).gt("rank", daily.length);
  if (trimError) throw trimError;
  return daily.length;
}
```

- [ ] **Step 5: A route tesztjei:** az `app/api/cron/daily/route.test.ts` „a good cron run…” elvárásában `daily: 0` is (`{ issue, candidates: 0, shortlisted: 0, inserted: 0, repos: 0, daily: 0, mirrored: 0, retriedSources: 0 }`).

- [ ] **Step 6: Migráció** (`supabase/migrations/20261012000000_daily_top_and_brief.sql`)

```sql
-- Daily news (.claude/docs/specs/2026-10-12-daily-news-design.md): the day's Top 10 and each post's 2–3 minute brief.
-- Only adds. Run it BEFORE deploying the daily-news code: the daily run writes daily_top, the Radar's query
-- embeds it, and ingest writes posts.brief.

create table if not exists public.daily_top (
  day date not null,
  rank smallint not null check (rank between 1 and 10),
  item_id text not null references public.digest_items (id) on delete cascade,
  primary key (day, rank)
);
create index if not exists daily_top_item_id on public.daily_top (item_id);
alter table public.daily_top enable row level security;
drop policy if exists "readers see daily top" on public.daily_top;
create policy "readers see daily top" on public.daily_top for select to authenticated using (true);
grant select on public.daily_top to authenticated;

alter table public.posts add column if not exists brief jsonb;
```

- [ ] **Step 7: Cronok.** `vercel.json` `crons`:

```json
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 14 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 15 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 16 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 17 * * *" }
  ]
```

`app/api/cron/mirror/route.ts` 8. sorának kommentje: `// Three extra daily runs (vercel.json: 15, 16 and 17 UTC, after the daily run's 14:00–15:05 window) that`.

`lib/cron-schedule.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };

// Daily news spec N2. Hobby crons fire within the hour, in UTC: the run at 14 and the mirror rounds at 15–17 keep
// the day's list ready by 18:00 in Budapest, summer and winter. Kills a schedule moved without the spec.
test("the daily run fires at 14 UTC and its mirror rounds at 15, 16 and 17", () => {
  assert.deepEqual(config.crons, [
    { path: "/api/cron/daily", schedule: "0 14 * * *" },
    { path: "/api/cron/mirror", schedule: "0 15 * * *" },
    { path: "/api/cron/mirror", schedule: "0 16 * * *" },
    { path: "/api/cron/mirror", schedule: "0 17 * * *" },
  ]);
});
```

- [ ] **Step 8: Futtatás, zöld**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily.test.ts lib/pipeline/fake-db.test.ts lib/cron-schedule.test.ts "app/api/cron/daily/route.test.ts"`
Expected: PASS.

- [ ] **Step 9: Mutációs próbák:** a `.filter((item) => !known.has(item.id))` és az `earlier` kihagyása a `pickDailyTop` hívásból; a `.select("id, score, read_minutes")` helyett `items` használata; a `MAX_COVERED` vágás törlése.

- [ ] **Step 10: Commit**

```bash
git add lib/pipeline/daily.ts lib/pipeline/daily.test.ts lib/pipeline/fake-db.ts app/api/cron/daily/route.test.ts app/api/cron/mirror/route.ts supabase/migrations/20261012000000_daily_top_and_brief.sql vercel.json lib/cron-schedule.test.ts
git commit -m "feat: rank the day's top 10 in the evening run, without repeating covered stories"
```

---

### Task 3: A tükör a nap Top 10-ét is felveszi

**Files:**
- Modify: `lib/pipeline/mirror.ts`
- Test: `lib/pipeline/mirror.test.ts`

**Interfaces:**
- Consumes: a `daily_top` tábla (Task 2).

- [ ] **Step 1: A teszt** (`lib/pipeline/mirror.test.ts` végére)

```ts
// Daily news spec N5. Kills the day's Top 10 left out below 85 points (its card would have no brief), and an
// item outside it queued.
test("queueMirrors also queues the items ranked in a daily Top 10, whatever their score", async () => {
  const db = fakeDb(undefined, {
    rows: {
      digest_items: [
        { ...item("https://blog.test/daily", 60), daily_top: [{ rank: 4 }] },
        { ...item("https://blog.test/plain", 60), daily_top: [] },
      ],
    },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 1);
  assert.deepEqual(db.sourceUpserts[0].values, [{ url: "https://blog.test/daily", kind: "article", submitted_by: "system-user" }]);
});
```

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/mirror.test.ts`
Expected: FAIL (0 helyett 1 várt).

- [ ] **Step 3: A kód** (`lib/pipeline/mirror.ts`): a select `"url, score, must_read, daily_top(rank)"`, a feltétel

```ts
    const inDailyTop = Array.isArray(item.daily_top) && item.daily_top.length > 0;
    if (item.score < MIRROR_MIN_SCORE && !item.must_read && !inDailyTop) continue;
```

és a doc-komment első mondata: `queues the week's best items, every one scoring at least MIRROR_MIN_SCORE, the Top 3 and every day's Top 10, as \`pending\` sources…`.

- [ ] **Step 4: Futtatás, zöld** — Run: ugyanaz. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/mirror.ts lib/pipeline/mirror.test.ts
git commit -m "feat: mirror every daily top 10 item into the library"
```

---

### Task 4: A brief az összefoglalóban

**Files:**
- Create: `lib/brief.ts`, `lib/brief.test.ts`
- Modify: `lib/pipeline/summary.ts`, `lib/pipeline/ingest.ts`
- Modify (fixture): `lib/pipeline/ingest.test.ts`, `lib/pipeline/summary.test.ts`, `lib/pipeline/extract/index.test.ts`, `lib/pipeline/extract/media.test.ts`

**Interfaces:**
- Produces: `briefSchema` (zod), `type Brief = { hu: string[]; en: string[] }`, `readBrief(raw: unknown): Brief | null`; a `posts.brief` írása.

- [ ] **Step 1: A tesztek**

`lib/brief.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readBrief } from "./brief.ts";

// Spec N5, N8. Kills a post made before briefs (null), an empty brief (only the description was available) or
// a malformed one reaching the card as if it were a brief: each falls back to the summary.
test("readBrief answers a brief only when both languages have paragraphs", () => {
  const brief = { hu: ["Első.", "Második."], en: ["First.", "Second."] };
  assert.deepEqual(readBrief(brief), brief);
  assert.equal(readBrief(null), null);
  assert.equal(readBrief({ hu: [], en: [] }), null);
  assert.equal(readBrief({ hu: ["Csak magyar."], en: [] }), null);
  assert.equal(readBrief({ hu: "nem lista", en: ["x"] }), null);
});
```

`lib/pipeline/summary.test.ts`: az `okSummary`-be `brief: { hu: [], en: [] }`, és új teszt:

```ts
// Spec N5. Kills the brief left out of the instructions (the model would skip it), its length or language
// rule lost, and a brief asked for when only the page's description was available.
test("summarize asks for a 300–450 word brief in both languages, and none without the text", async (t) => {
  withGeminiKey(t);
  const prompt = capturePrompt(t);
  await summarize(fakeDb(), extracted, "");
  assert.match(prompt(), /brief: .*3–5 short paragraphs, 300–450 words in each language/);
  await summarize(fakeDb(), { ...extracted, meta: { extractionFailed: true } }, "");
  assert.match(prompt(), /leave brief empty/);
});
```

`lib/pipeline/ingest.test.ts`: az `okSummary`-be `brief: { hu: ["Bekezdés."], en: ["Paragraph."] }`; a kulcslista (`"blocks_hu",` után) `"brief",`; és a kulcslista-teszt végére `assert.deepEqual(db.postUpserts[0].brief, okSummary.brief);`.

`lib/pipeline/extract/index.test.ts` (107. sor) és `lib/pipeline/extract/media.test.ts` (`noChapters` és a 102. sor körüli válasz): `brief: { hu: [], en: [] }` a `tags` mellé.

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/brief.test.ts lib/pipeline/summary.test.ts lib/pipeline/ingest.test.ts`
Expected: FAIL (`brief.ts` hiányzik, a prompt nem kéri, az upsert nem írja).

- [ ] **Step 3: A kód**

`lib/brief.ts`:

```ts
import { z } from "zod/v4";

/** A post's 2–3 minute brief (daily news spec N5): 3–5 paragraphs per language; empty when only the page's description was available. */
export const briefSchema = z.object({ hu: z.array(z.string()).max(6), en: z.array(z.string()).max(6) });
export type Brief = z.infer<typeof briefSchema>;

/** `posts.brief` as stored: null for a post made before briefs, an empty brief, or anything that doesn't parse. */
export function readBrief(raw: unknown): Brief | null {
  const parsed = briefSchema.safeParse(raw);
  return parsed.success && parsed.data.hu.length > 0 && parsed.data.en.length > 0 ? parsed.data : null;
}
```

`lib/pipeline/summary.ts`: import `import { briefSchema } from "../brief.ts";`, a sémába `brief: briefSchema,`, a `SUMMARY_INSTRUCTIONS`-be a `keyPoints` sor után:

```
- brief: a 2–3 minute read for someone deciding whether to open the original: 3–5 short paragraphs, 300–450 words in each language — what happened, the key details and numbers, why it matters to an AI engineer, and any caveats. Your own words, never the source's sentences.
```

a `failed` szöveg vége: `…and at most 3 key points, and leave brief empty."`.

`lib/pipeline/ingest.ts` `buildPost` visszatérése: `key_points: generated.keyPoints,` után `brief: generated.brief,`.

- [ ] **Step 4: Futtatás, zöld**

Run: `node --experimental-strip-types --no-warnings --test lib/brief.test.ts lib/pipeline/summary.test.ts lib/pipeline/ingest.test.ts lib/pipeline/extract/index.test.ts lib/pipeline/extract/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brief.ts lib/brief.test.ts lib/pipeline/summary.ts lib/pipeline/summary.test.ts lib/pipeline/ingest.ts lib/pipeline/ingest.test.ts lib/pipeline/extract/index.test.ts lib/pipeline/extract/media.test.ts
git commit -m "feat: write a two to three minute brief with every library post"
```

---

### Task 5: Az adat: `getDaily`, a heti „NAP TOP” jel

**Files:**
- Modify: `data/digest-types.ts` (`DigestItem.dailyRank`, `DailyBrief`)
- Modify: `lib/my-sources.ts` (`itemSources`, a `readHerePosts` erre épül)
- Modify: `lib/content.ts` (`ITEM_COLUMNS`, `toDigestItem`, `getDaily`, `closed-week` v4)
- Test: `lib/content.test.ts`, `lib/my-sources.test.ts`

**Interfaces:**
- Consumes: `readBrief` (Task 4), `budapestDay`, `DAILY_SIZE` (Task 1).
- Produces:
  - `DigestItem.dailyRank?: number`;
  - `type DailyBrief = { kind: "brief"; paragraphs: Record<Language, string[]> } | { kind: "post"; summary: Localized; keyPoints: Record<Language, string[]> } | { kind: "pending" }`;
  - `itemSources(db, items: { id: string; url: string }[], columns: string): Promise<Map<string, Record<string, unknown>> | null>` (item id → a forrás sora; `null`, ha a lekérdezés elbukott);
  - `type DailyData = { issue: CurrentIssue; today: boolean; items: DigestItem[]; briefs: Record<string, DailyBrief>; posts: Record<string, number> }`;
  - `getDaily(db: SupabaseClient, now?: Date): Promise<DailyData>`.

- [ ] **Step 1: A tesztek** (`lib/content.test.ts`)
  - a „getRadar asks for…” teszt select-sztringje: `digest_items(id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why, created_at, daily_top(rank))`;
  - a closed-week teszt kulcsa: `["closed-week", "v4"]`;
  - az import-listába `getDaily`;
  - új tesztek:

```ts
// Daily news spec N7. Kills the weekly card's DAY TOP mark lost in the mapping, and one invented for an item
// that never made a daily list.
test("getRadar marks the items ranked in a daily Top 10", async () => {
  const db = fakeDb(undefined, { rows: { issues: [issueRow("2026-W38", { digest_items: [{ ...itemRow("a", 90), daily_top: [{ rank: 3 }] }, { ...itemRow("b", 80), daily_top: [] }] })] } });
  const radar = await getRadar(db, "2026-W38");
  assert.deepEqual(radar?.items.map((item) => item.dailyRank), [3, undefined]);
});

const dailyRow = (day: string, rank: number, id: string, minutes = 6) => ({ day, rank, digest_items: { ...itemRow(id, 90 - rank), issue_id: "2026-W38", read_minutes: minutes } });

// Spec N7, N8, Review Focus 5. Kills an older day's ranks mixed in (the limit reaches past a short day), the
// rank order lost, the week taken from the clock instead of the items, and `today` judged in UTC.
test("getDaily answers the latest day's list in rank order, with its week and whether it is today's", async () => {
  const db = fakeDb(undefined, {
    rows: { daily_top: [dailyRow("2026-09-17", 1, "x"), dailyRow("2026-09-18", 1, "a"), dailyRow("2026-09-18", 2, "b")] },
  });
  const daily = await getDaily(db, new Date("2026-09-18T21:30:00Z"));
  assert.deepEqual(daily.items.map((item) => item.id), ["a", "b"]);
  assert.equal(daily.issue.id, "2026-W38");
  assert.equal(daily.issue.label, "2026. 09. 18.");
  assert.equal(daily.today, true);
  assert.equal((await getDaily(db, new Date("2026-09-18T22:30:00Z"))).today, false);
});

// Spec N8. Kills each fallback step: the brief over the summary, the submitter's summary over the model's,
// "being written" only for a pending source, and nothing for a failed one; "Olvasd itt" for every post.
test("getDaily gives each card the best long text there is", async () => {
  const urls = ["brief", "summary", "pending", "failed"].map((name) => `https://arxiv.org/abs/${name}`);
  const db = fakeDb(undefined, {
    rows: { daily_top: ["brief", "summary", "pending", "failed"].map((id, i) => dailyRow("2026-09-18", i + 1, id)) },
    sources: [
      { url: urls[0], status: "done", posts: { id: 1, brief: { hu: ["B"], en: ["B"] }, summary: text("S"), key_points: { hu: [], en: [] }, overrides: {} } },
      { url: urls[1], status: "done", posts: { id: 2, brief: null, summary: text("S"), key_points: { hu: ["k"], en: ["k"] }, overrides: { summary: text("Mine") } } },
      { url: urls[2], status: "pending", posts: null },
      { url: urls[3], status: "failed", posts: null },
    ],
  });
  const daily = await getDaily(db, new Date("2026-09-18T15:00:00Z"));
  assert.deepEqual(daily.briefs, {
    brief: { kind: "brief", paragraphs: { hu: ["B"], en: ["B"] } },
    summary: { kind: "post", summary: text("Mine"), keyPoints: { hu: ["k"], en: ["k"] } },
    pending: { kind: "pending" },
  });
  assert.deepEqual(daily.posts, { brief: 1, summary: 2 });
});

// Spec N8. Kills a crash or a made-up day before the first list: no day, the current week, nothing to show.
test("getDaily before any list answers an empty, not-today day in the current week", async () => {
  const daily = await getDaily(fakeDb(undefined, { rows: { daily_top: [] } }), new Date("2026-09-18T15:00:00Z"));
  assert.deepEqual([daily.items, daily.today, daily.issue.id, daily.issue.label], [[], false, "2026-W38", "—"]);
});

// Kills a failed query answered as an empty day (the page would say "no list yet" during an outage).
test("getDaily throws on a failed query", async () => {
  await assert.rejects(getDaily(fakeDb(undefined, { tableErrors: { daily_top: pgError("08006", "down") } })), /daily query failed/);
});
```

(A `fakeDb` `sources` kulcsa a `sourcesQuery` sorait adja; ha a meglévő segéd a `.in(...)`-t nem szűri, a teszt a négy sort mind megkapja, ami itt ugyanaz.)

`lib/my-sources.test.ts`: a meglévő `readHerePosts`-tesztek változatlanul zöldek maradnak (a refaktor mértéke).

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/content.test.ts lib/my-sources.test.ts`
Expected: FAIL (`getDaily` nincs, a select-sztring és a kulcs eltér).

- [ ] **Step 3: A típusok** (`data/digest-types.ts`): a `DigestItem`-be, az `addedAt` után:

```ts
  /** Its rank in the day's Top 10 when it made one (daily news spec N7): the weekly card's DAY TOP mark. */
  dailyRank?: number;
```

és a fájl végére:

```ts
/** A daily Top 10 card's long text (daily news spec N5, N8): the post's brief, else its summary and key points,
 *  else "being written" while its source waits. No entry: the item's own summary. */
export type DailyBrief =
  | { kind: "brief"; paragraphs: Record<Language, string[]> }
  | { kind: "post"; summary: Localized; keyPoints: Record<Language, string[]> }
  | { kind: "pending" };
```

- [ ] **Step 4: `itemSources`** (`lib/my-sources.ts`): a `readHerePosts` URL-térképe és lekérdezése közös segédbe kerül.

```ts
/** Each item's `sources` row, by the URL a submission of it would normalize to, 30 URLs a query. `columns`
 *  must include `url`. Null when a lookup fails (logged): a page shows its cards without the extras then. */
export async function itemSources(db: SupabaseClient, items: { id: string; url: string }[], columns: string): Promise<Map<string, Record<string, unknown>> | null> {
  const idsByUrl = new Map<string, string[]>();
  for (const item of items) {
    const url = parseSubmittedUrl(item.url)?.toString();
    if (url) idsByUrl.set(url, [...(idsByUrl.get(url) ?? []), item.id]);
  }
  const answers = await inChunks([...idsByUrl.keys()], (chunk) => db.from("sources").select(columns).in("url", chunk));
  const byItem = new Map<string, Record<string, unknown>>();
  for (const { data, error } of answers) {
    if (error) {
      console.warn("item source lookup failed", error);
      return null;
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) for (const id of idsByUrl.get(row.url as string) ?? []) byItem.set(id, row);
  }
  return byItem;
}

export async function readHerePosts(db: SupabaseClient, items: { id: string; url: string }[]): Promise<Record<string, number>> {
  const sources = await itemSources(db, items, "url, posts(id)");
  const posts: Record<string, number> = {};
  for (const [id, row] of sources ?? []) {
    const post = embeddedPost(row.posts);
    if (post) posts[id] = post.id;
  }
  return posts;
}
```

Ha a `readHerePosts` meglévő tesztje a figyelmeztetés szövegét (`read-here post lookup failed`) ellenőrzi, a teszt kapja az új szöveget.

- [ ] **Step 5: `lib/content.ts`**

Importok: `import type { DailyBrief, Language } from "@/data/digest-types";` (a meglévő típus-importba), `import { readBrief } from "@/lib/brief";`, `import { itemSources } from "@/lib/my-sources";`, `import { budapestDay, DAILY_SIZE } from "@/lib/pipeline/daily-top";`, és az `isoWeek` már importálva van.

```ts
const ITEM_COLUMNS = "id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why, created_at, daily_top(rank)";
const RADAR_COLUMNS = `id, updated_at, digest_items(${ITEM_COLUMNS}), github_top(repo, focus, url, stars, language, score)`;

type ItemRow = Record<string, unknown> & { daily_top?: { rank: number }[] | null };

/** A digest_items row (ITEM_COLUMNS) as the cards' DigestItem. */
function toDigestItem(row: ItemRow): DigestItem {
  const dailyRank = row.daily_top?.[0]?.rank;
  return {
    id: row.id as string,
    category: row.category as DigestItem["category"],
    mustRead: row.must_read as boolean,
    score: row.score as number,
    readMinutes: row.read_minutes as number,
    publishedAt: row.published_at as string,
    publishedLabel: publishedLabel(row.published_at as string),
    addedAt: row.created_at as string,
    source: row.source as string,
    url: row.url as string,
    tags: row.tags as DigestItem["tags"],
    title: row.title as Localized,
    summary: row.summary as Localized,
    why: row.why as Localized,
    ...(dailyRank ? { dailyRank } : {}),
  };
}
```

A `getRadar`-ban `items: latest.digest_items.map((row) => toDigestItem(row as ItemRow)),`. A `closedWeek` kulcsa `["closed-week", "v4"]` (a `RadarData` alakja `dailyRank`-kal bővült: ARCHITECTURE.md → Invariants).

```ts
export type DailyData = { issue: CurrentIssue; today: boolean; items: DigestItem[]; briefs: Record<string, DailyBrief>; posts: Record<string, number> };

/**
 * The latest day's Top 10 (daily news spec N7) with each card's long text (N8) and its Library post. A failed
 * list query throws, like getRadar; a failed post lookup only costs the briefs.
 */
export async function getDaily(db: SupabaseClient, now = new Date()): Promise<DailyData> {
  const { data, error } = await db
    .from("daily_top")
    .select(`day, rank, digest_items(issue_id, ${ITEM_COLUMNS})`)
    .order("day", { ascending: false })
    .order("rank")
    .limit(DAILY_SIZE);
  if (error) throw queryFailed("daily", error);
  const rows = (data ?? []) as unknown as { day: string; rank: number; digest_items: ItemRow | null }[];
  // The latest day, and only its rows: the limit can reach past a short day into the one before.
  const day = rows.reduce<string | null>((latest, row) => (latest === null || row.day > latest ? row.day : latest), null);
  const own = rows.filter((row) => row.day === day && row.digest_items).sort((a, b) => a.rank - b.rank);
  const items = own.map((row) => toDigestItem(row.digest_items!));
  const issue: CurrentIssue = {
    id: (own[0]?.digest_items?.issue_id as string | undefined) ?? isoWeek(now).id,
    label: day ? `${day.replaceAll("-", ". ")}.` : "—",
    updated: "",
    archiveAt: "",
  };
  const sources = await itemSources(db, items, "url, status, posts(id, brief, summary, key_points, overrides)");
  const briefs: Record<string, DailyBrief> = {};
  const posts: Record<string, number> = {};
  for (const [id, source] of sources ?? []) {
    const post = source.posts as { id: number; brief: unknown; summary: Localized; key_points: Record<Language, string[]>; overrides: unknown } | null;
    if (post) {
      posts[id] = post.id;
      const brief = readBrief(post.brief);
      briefs[id] = brief
        ? { kind: "brief", paragraphs: brief }
        : { kind: "post", summary: readOverrides(post.overrides).summary ?? post.summary, keyPoints: post.key_points };
    } else if (source.status === "pending") {
      briefs[id] = { kind: "pending" };
    }
  }
  return { issue, today: day === budapestDay(now), items, briefs, posts };
}
```

A régi `items: latest.digest_items.map((row) => ({ … }))` blokk törlődik (a `toDigestItem` váltja).

- [ ] **Step 6: Futtatás, zöld**

Run: `node --experimental-strip-types --no-warnings --test lib/content.test.ts lib/my-sources.test.ts lib/client-bundle.test.ts`
Expected: PASS.

- [ ] **Step 7: Mutációs próbák:** a `row.day === day` szűrés törlése; a `readOverrides(...).summary ??` törlése; a `status === "pending"` ág törlése; `v4` → `v3`.

- [ ] **Step 8: Commit**

```bash
git add data/digest-types.ts lib/my-sources.ts lib/my-sources.test.ts lib/content.ts lib/content.test.ts
git commit -m "feat: read the latest day's top 10 with each card's brief"
```

---

### Task 6: A menü: Napi, a mobil sáv, a Keresés a „Több” alatt

**Files:**
- Modify: `lib/nav.ts`, `app/components/nav-parts.tsx` (`navIcons`), `app/components/app-shell.tsx` (a „Több” keresőgombja bezárja a lapot)
- Test: `lib/nav.test.ts`, `app/components/shell.test.ts`

**Interfaces:**
- Produces: `NavId` += `"daily"`; a `/daily` útvonal a menüben; `switchesLanguageInPlace("/daily") === true`.

- [ ] **Step 1: A tesztek**
  - `lib/nav.test.ts`: az aktív-elem tesztbe `assert.equal(activeNavId("/daily"), "daily");`; a helyben váltó útvonalak listájába `"/daily"`; a mobil-teszt elejére `assert.deepEqual(MOBILE_BAR_NAV.map(({ id }) => id), ["radar", "daily", "library"]);` és `assert.equal(inMobileMore("search"), true);`.
  - `app/components/shell.test.ts`: a mobil sáv tesztje (`the mobile bar reads …`) új címmel és elvárással: `test("the mobile bar reads Radar, Napi, the taiyaki, Könyvtár, Több", …)` → `["Radar", "Napi", "Link bedobása", "Könyvtár", "Több"]`; a pending-dot teszt keresőgombjai: `assert.deepEqual(hiddenSpanCounts(searchButtons), [0]);` (csak az oldalsávé van a markupban, a „Több” lap portálban van).

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts app/components/shell.test.ts`
Expected: FAIL.

- [ ] **Step 3: A kód**

`lib/nav.ts`:

```ts
export type NavId = "radar" | "daily" | "companies" | "library" | "github" | "search" | "archive" | "collection";
```

a `NAV_ITEMS`-ben a Radar után `{ id: "daily", href: "/daily", label: { hu: "Napi", en: "Daily" } },`, a keresés: `{ id: "search", href: null, mobileMore: true, label: { hu: "Keresés", en: "Search" } },`; az `IN_PLACE_LANGUAGE` listába `/^\/daily\/?$/`.

`app/components/nav-parts.tsx`: import `Sunset` a lucide-react-ből, és `daily: Sunset,` a `navIcons`-ba.

`app/components/app-shell.tsx`, a „Több” lap `NavEntry`-jében:

```tsx
                  onSearch={() => {
                    setMoreOpen(false);
                    onSearch();
                  }}
```

- [ ] **Step 4: Futtatás, zöld** — Run: ugyanaz. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts app/components/nav-parts.tsx app/components/app-shell.tsx app/components/shell.test.ts
git commit -m "feat: add the daily view to the menu and move search under more on phones"
```

---

### Task 7: A `/daily` nézet

**Files:**
- Modify: `app/components/story-card.tsx` (`brief`, `rank`, a „RÖVID” és a „NAP TOP” jel)
- Modify: `app/components/digest-dashboard.tsx` (`scope: "daily"`, `daily` prop)
- Create: `app/(app)/daily/page.tsx`, `app/(app)/daily/loading.tsx`
- Modify: `lib/fixtures.ts`, `app/dev/preview/page.tsx`, `app/dev/preview/preview-nav.tsx`
- Test: `app/components/shell.test.ts`, `app/components/page-skeletons.test.ts`

**Interfaces:**
- Consumes: `DailyBrief`, `DigestItem.dailyRank` (Task 5), `getDaily`, `DailyData` (Task 5), `SHORT_MINUTES` (Task 1).
- Produces: `CardProps.brief?: DailyBrief`, `CardProps.rank?: number`; `DigestDashboard` `scope?: "companies" | "daily"`, `daily?: { today: boolean; briefs: Record<string, DailyBrief> }`; fixture: `previewDailyItems: DigestItem[]`, `previewDaily: { today: boolean; briefs: Record<string, DailyBrief> }`, `previewDailyIssue: CurrentIssue`.

- [ ] **Step 1: A fixture-ök** (`lib/fixtures.ts`, a `previewItems` után):

```ts
/** The daily view (daily news spec N7): five cards, two of them short, each long-text state of N8 once. */
export const previewDailyIssue: CurrentIssue = { id: "2026-W39", label: "2026. 09. 24.", updated: "", archiveAt: "" };
export const previewDailyItems: DigestItem[] = [
  digestItem("research-2026-W39-daily-brief", { category: "research", score: 94, readMinutes: 22 }),
  digestItem("companies-2026-W39-daily-short", { category: "companies", score: 88, readMinutes: 6 }),
  digestItem("local-2026-W39-daily-post", { score: 81, readMinutes: 18 }),
  digestItem("local-2026-W39-daily-pending", { score: 77, readMinutes: 12 }),
  digestItem("research-2026-W39-daily-plain", { category: "research", score: 70, readMinutes: 40 }),
];
const paragraphs = (lang: string) => [1, 2, 3].map((n) => `${lang} ${n}. bekezdés: mi történt, a fontos számok, és miért számít egy AI-mérnöknek.`);
export const previewDaily: { today: boolean; briefs: Record<string, DailyBrief> } = {
  today: false,
  briefs: {
    "research-2026-W39-daily-brief": { kind: "brief", paragraphs: { hu: paragraphs("HU"), en: paragraphs("EN") } },
    "companies-2026-W39-daily-short": { kind: "brief", paragraphs: { hu: paragraphs("HU"), en: paragraphs("EN") } },
    "local-2026-W39-daily-post": {
      kind: "post",
      summary: { hu: "A poszt saját összefoglalója.", en: "The post's own summary." },
      keyPoints: { hu: ["Első pont", "Második pont"], en: ["First point", "Second point"] },
    },
    "local-2026-W39-daily-pending": { kind: "pending" },
  },
};
```

A `DailyBrief` típus az import-sorba: `import type { ArchiveIssue, CurrentIssue, DailyBrief, DigestItem, GithubTopEntry } from "../data/digest-types.ts";`. A `previewItems` `companies-2026-W39-mistral` tétele kapja meg a heti jelet: `digestItem("companies-2026-W39-mistral", { category: "companies", score: 86, dailyRank: 4 })`.

- [ ] **Step 2: A tesztek** (`app/components/shell.test.ts` végére: az ottani `withShellProviders` angolul renderel, így a saját provider-csomagolás nem kell, és nem lesz klón). Az import-listába (`../../lib/fixtures.ts`) `previewDaily, previewDailyIssue, previewDailyItems`.

```ts
const dailyView = (overrides: Partial<ComponentProps<typeof DigestDashboard>> = {}) =>
  withShellProviders(DigestDashboard, {
    issue: previewDailyIssue,
    items: previewDailyItems,
    githubTop10: [],
    scope: "daily",
    daily: previewDaily,
    preview: { data: previewReader, failWrites: false },
    ...overrides,
  });

// Daily news spec N7. Kills the cards out of rank order or without their anchors, the index not linking them,
// and the category chips shown on a list that has no categories.
test("the daily view lists its cards in rank order, each with an anchor the index links to", () => {
  const doc = dailyView();
  assert.deepEqual([...doc.querySelectorAll("article[id]")].map((card) => card.id), ["daily-1", "daily-2", "daily-3", "daily-4", "daily-5"]);
  assert.deepEqual([...doc.querySelectorAll('nav[aria-label="Today\'s stories"] a')].map((link) => link.getAttribute("href")), ["#daily-1", "#daily-2", "#daily-3", "#daily-4", "#daily-5"]);
  assert.equal(doc.querySelector('nav[aria-label="Categories"]'), null);
  assert.match(doc.body.textContent ?? "", /5 stories · 2 short/);
});

// Spec N4, N7. Kills the SHORT mark on a long read, or missing from a short one (≤ 15 minutes).
test("only the daily view's short reads carry the SHORT mark", () => {
  const marked = [...dailyView().querySelectorAll("article[id]")].filter((card) => /SHORT/.test(card.textContent ?? "")).map((card) => card.id);
  assert.deepEqual(marked, ["daily-2", "daily-4"]);
});

// Spec N8. Kills each long-text state shown wrong: the brief's paragraphs, the post's summary and key points,
// "being written" with the item's own summary, and the plain summary with no entry.
test("each daily card shows the best long text it has", () => {
  const cards = [...dailyView().querySelectorAll("article[id]")].map((card) => card.textContent ?? "");
  assert.match(cards[0], /EN 1\. bekezdés.*EN 3\. bekezdés/s);
  assert.match(cards[2], /The post's own summary\..*First point.*Second point/s);
  assert.match(cards[3], /A two-sentence summary.*The full brief is being written…/s);
  assert.match(cards[4], /A two-sentence summary/);
  assert.doesNotMatch(cards[4], /being written/);
});

// Spec N8, Review Focus 5. Kills yesterday's list shown as today's, and an empty day shown as a blank page.
test("an older daily list says so, and no list at all says when the first one comes", () => {
  assert.match(dailyView().body.textContent ?? "", /An earlier list \(2026\. 09\. 24\.\) — today's is ready by 18:00\./);
  assert.doesNotMatch(dailyView({ daily: { ...previewDaily, today: true } }).body.textContent ?? "", /An earlier list/);
  assert.match(dailyView({ items: [], daily: { today: false, briefs: {} } }).body.textContent ?? "", /No daily list yet/);
});

// Spec N7. Kills the weekly cards' DAY TOP mark missing, or put on an item that was never in a daily list.
test("the weekly view marks the items of a daily Top 10", () => {
  const doc = withShellProviders(DigestDashboard, { issue: previewIssue, items: previewItems, githubTop10: previewGithub, preview: { data: previewReader, failWrites: false } });
  const marked = [...doc.querySelectorAll("article[data-card-id]")].filter((card) => /DAY TOP · 4\./.test(card.textContent ?? "")).map((card) => card.getAttribute("data-card-id"));
  assert.deepEqual([...new Set(marked)], ["companies-2026-W39-mistral"]);
});
```

`app/components/page-skeletons.test.ts`: a `loadings` listába `["/daily", (await import("../(app)/daily/loading.tsx")).default],` (a „six loading.tsx” címben a szám heted lesz: `each of the seven loading.tsx`).

- [ ] **Step 3: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts app/components/page-skeletons.test.ts`
Expected: FAIL (a `daily` scope, a fixture-ök és a loading hiányzik).

- [ ] **Step 4: A kártya** (`app/components/story-card.tsx`)

Copy (`hu` / `en`): `short: "RÖVID"` / `"SHORT"`, `dayTop: "NAP TOP"` / `"DAY TOP"`, `keyPoints: "FŐ PONTOK"` / `"KEY POINTS"`, `briefPending: "A részletes összefoglaló készül…"` / `"The full brief is being written…"`.

Importok: `import type { DailyBrief, DigestItem, Language } from "@/data/digest-types";`, `import { SHORT_MINUTES } from "@/lib/pipeline/daily-top";`.

`CardProps`-ba:

```ts
  /** The daily view's long text for the card (daily news spec N8); the weekly cards have none. */
  brief?: DailyBrief;
  /** The card's place in the daily Top 10: its number, its #daily-N anchor and the SHORT mark. */
  rank?: number;
```

A `StoryCard` `article`-je: `id={props.rank ? \`daily-${props.rank}\` : undefined}`. A meta-oszlop első eleme elé:

```tsx
          {props.rank !== undefined && <p className="font-display text-4xl leading-none text-signal lg:mb-3">{String(props.rank).padStart(2, "0")}</p>}
```

az olvasási idő `<p>`-je után:

```tsx
          {props.rank !== undefined && item.readMinutes <= SHORT_MINUTES && <p className="bg-signal px-1.5 font-bold text-ink lg:mt-2 lg:inline-block">{t.short}</p>}
```

A „NAP TOP” jel a `CardText`-be kerül (így a Top 3 kártyán és a feedben is megjelenik), a forrás-link elé:

```tsx
      {rank === undefined && item.dailyRank !== undefined && (
        <p className="mb-1 inline-block border border-ink px-1.5 font-mono text-[11px] text-ink">
          {t.dayTop} · {item.dailyRank}.
        </p>
      )}
```

(a `CardText` paraméterlistájába `rank` és `brief` is)

A `CardText`-ben az összefoglaló `<p>` helyére:

```tsx
      <CardBody item={item} brief={brief} language={language} />
```

és új komponens a fájlban:

```tsx
/** The card's text under the title: the daily brief's paragraphs, the post's summary and key points, or the
 *  item's own summary, with a note while the brief is being written (daily news spec N8). */
function CardBody({ item, brief, language }: { item: DigestItem; brief?: DailyBrief; language: Language }) {
  const t = copy[language];
  const text = "mt-4 max-w-[75ch] text-base leading-7 text-ink/72";
  if (brief?.kind === "brief") {
    return (
      <div className="mt-4 max-w-[75ch] space-y-3 text-base leading-7 text-ink/80">
        {brief.paragraphs[language].map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    );
  }
  if (brief?.kind === "post") {
    return (
      <>
        <p className={text}>{brief.summary[language]}</p>
        {brief.keyPoints[language].length > 0 && (
          <div className="mt-4 max-w-[75ch]">
            <p className="font-mono text-[11px] tracking-[0.15em] text-ink/55">{t.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              {brief.keyPoints[language].map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <p className={text}>{item.summary[language]}</p>
      {brief?.kind === "pending" && <p className="mt-2 font-mono text-xs text-ink/55">{t.briefPending}</p>}
    </>
  );
}
```

A `MustReadCard` nem kap `brief`-et (a `CardText` `brief` nélkül az eredeti összefoglalót mutatja).

- [ ] **Step 5: A dashboard** (`app/components/digest-dashboard.tsx`)

Copy (`hu` / `en`):
- `dailyTitle: "NAPI"` / `"DAILY"`;
- `dailyLead: "A nap 10 legfontosabb híre, mindegyikhez 2–3 perces összefoglalóval."` / `"The day's 10 most important stories, each with a 2–3 minute brief."`;
- `dailyCount: (count: number, short: number) => \`${count} hír · ebből ${short} rövid\`` / `` `${count} stories · ${short} short` ``;
- `dailyStale: (day: string) => \`Korábbi lista (${day}) — a mai 18:00-ra készül.\`` / `` `An earlier list (${day}) — today's is ready by 18:00.` ``;
- `dailyIndex: "A nap hírei"` / `"Today's stories"`;
- `dailyFeed: "A NAP 10 HÍRE"` / `"TODAY'S 10"`;
- `emptyDaily: "Még nincs napi lista. Az első este 18:00-ra készül el."` / `"No daily list yet. The first one is ready by 18:00."`;
- a `schedule` sorok: `"NAPI 14:00 UTC · ZÁRÁS VAS 24:00"` / `"DAILY 14:00 UTC · FREEZE SUN 24:00"`.

(A copy-objektum `as const`; a két függvény-mező mindkét nyelven ugyanazzal az aláírással.)

Props: `scope?: "companies" | "daily";` és

```ts
    /** /daily (daily news spec N7): whether the list is today's, and each card's long text. */
    daily?: { today: boolean; briefs: Record<string, DailyBrief> };
```

A törzsben: `const dailyView = props.scope === "daily";`; a `top` sor `const top = dailyView ? [] : companies ? dailyTop(items) : items.filter((item) => item.mustRead);`; a `feed` sor elé `dailyView ? items :`; a chip-sáv feltétele `!companies && !dailyView`; a `sample` doboz feltétele `&& !dailyView`; az `emptyFeed`: `const emptyFeed = dailyView ? t.emptyDaily : companies ? companiesEmpty : radarEmpty;`.

A `cardProps`-ba: `brief: props.daily?.briefs[item.id],`. A hero:
- a cím: `{dailyView ? t.dailyTitle : companies ? t.companiesTitle : "AI WEEKLY"}`;
- a lead: `{dailyView ? t.dailyLead : companies ? t.companiesLead : t.lead}`;
- a mobil állapotsor és a jobb oldali doboz helyett, ha `dailyView`:

```tsx
                  <p className="mt-3 font-mono text-xs text-paper/70">
                    {t.dailyCount(items.length, items.filter((item) => item.readMinutes <= SHORT_MINUTES).length)}
                    {props.daily && !props.daily.today && items.length > 0 && <span className="block text-signal">{t.dailyStale(issue.label)}</span>}
                  </p>
```

(a meglévő mobil `<p>` és az „archive” doboz `!dailyView &&` feltételt kap).

A feed szakasz `dailyView` esetén a tartalomjegyzékkel kezdődik, és a kártyák a rangot kapják:

```tsx
                <section className="mt-9">
                  <SectionLabel icon={dailyView ? Sunset : Newspaper} label={dailyView ? t.dailyFeed : companies ? t.companiesFeed : t.feed} />
                  {dailyView && items.length > 0 && (
                    <nav aria-label={t.dailyIndex} className="mb-6 border-2 border-ink bg-paper p-4">
                      <ol className="space-y-1 font-mono text-xs">
                        {items.map((item, index) => (
                          <li key={item.id}>
                            <a href={`#daily-${index + 1}`} className="focus-ring flex min-h-8 items-baseline gap-3 hover:text-signal">
                              <span className="text-signal">{String(index + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.title[language]}</span>
                              <span className="text-ink/55">{item.score}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    </nav>
                  )}
                  <div className="space-y-4">
                    {feed.map((item, index) => (
                      <StoryCard key={item.id} {...cardProps(item)} rank={dailyView ? index + 1 : undefined} />
                    ))}
```

Importok: `Sunset` a lucide-react listába, `import type { CurrentIssue, DailyBrief, DigestItem, GithubTopEntry } from "@/data/digest-types";`, `import { SHORT_MINUTES } from "@/lib/pipeline/daily-top";`.

- [ ] **Step 6: Az oldal**

`app/(app)/daily/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getDaily, getRatings, getReaderSeed } from "@/lib/content";
import { radarTargets } from "@/lib/ratings";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The latest day's Top 10 with its briefs (daily news spec N7). */
export default async function DailyPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/daily");
  const daily = await getDaily(reader.db);
  // After getDaily: both need its answer (the items' week, the items).
  const [seed, ratings] = await Promise.all([getReaderSeed(reader.db, daily.issue.id), getRatings(reader.db, radarTargets(daily.items, []))]);
  return (
    <DigestDashboard
      issue={daily.issue}
      items={daily.items}
      githubTop10={[]}
      scope="daily"
      daily={{ today: daily.today, briefs: daily.briefs }}
      seed={seed}
      posts={daily.posts}
      ratings={ratings}
    />
  );
}
```

`app/(app)/daily/loading.tsx`:

```tsx
import { RadarSkeleton } from "@/app/components/page-skeletons";

export default function Loading() {
  return <RadarSkeleton />;
}
```

- [ ] **Step 7: Az előnézet.** `app/dev/preview/preview-nav.tsx` `PREVIEW_VIEWS` listájába `"daily"` és `"daily-empty"` a `"companies"` után; `app/dev/preview/page.tsx` importjaiba `previewDaily, previewDailyIssue, previewDailyItems`, és a nézetek közé:

```tsx
      {(view === "daily" || view === "daily-empty") && (
        <DigestDashboard
          key={`${view}:${failWrites}`}
          scope="daily"
          issue={previewDailyIssue}
          items={view === "daily" ? previewDailyItems : []}
          githubTop10={[]}
          daily={view === "daily" ? previewDaily : { today: true, briefs: {} }}
          preview={{ data: previewReader, failWrites }}
          posts={previewReadHerePosts}
          ratings={previewRatings}
        />
      )}
```

- [ ] **Step 8: Futtatás, zöld**

Run: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts app/components/page-skeletons.test.ts lib/design-excerpts.test.ts lib/design-tokens.test.ts lib/client-bundle.test.ts`
Expected: PASS. Ha a `design-excerpts` egy megváltozott kivonatot jelez (a `story-card.tsx` vagy a `digest-dashboard.tsx` sorai), a DESIGN.md kivonatát kell a forrásból újramásolni.

- [ ] **Step 9: Mutációs próbák:** a `<= SHORT_MINUTES` → `<`; a `pending` ág jegyzetének törlése; a `!props.daily.today` feltétel megfordítása; a `rank` nélküli `id`.

- [ ] **Step 10: Futásidejű próba** (`npm run dev`, Playwright): `/dev/preview?view=daily` és `daily-empty` 360 és 1280 px-en; nincs vízszintes görgetés; a tartalomjegyzék linkje a kártyára ugrik; a nyelvváltó helyben vált; a mobil sávban Radar, Napi, taiyaki, Könyvtár, Több; a „Több” lap Keresés gombja bezárja a lapot és megnyitja a keresőt; `?view=radar`-on a „NAP TOP · 2.” jel.

- [ ] **Step 11: Commit**

```bash
git add app/components/story-card.tsx app/components/digest-dashboard.tsx "app/(app)/daily/page.tsx" "app/(app)/daily/loading.tsx" lib/fixtures.ts app/dev/preview/page.tsx app/dev/preview/preview-nav.tsx app/components/shell.test.ts app/components/page-skeletons.test.ts
git commit -m "feat: show the day's top 10 with their briefs on the daily page"
```

---

### Task 8: Dokumentáció és az öt ellenőrzés

**Files:**
- Modify: `.claude/CLAUDE.md`, `.claude/docs/DESIGN.md`, `.claude/docs/ARCHITECTURE.md`, `README.md`, `.claude/docs/TODO.md`, `AGENTS.md`

- [ ] **Step 1: CLAUDE.md**
  - How content gets in → 1.: `Vercel Cron (\`vercel.json\`, \`0 14 * * *\`, 14:00 UTC; ready by 18:00 in Budapest)`; a felsorolás végére új pont: „picks the day's Top 10 from the rows it wrote and the day's earlier picks (`pickDailyTop`, `lib/pipeline/daily-top.ts`: by score, 3–5 reads of ≤ 15 minutes) and writes `daily_top` for the Budapest day (`budapestDay`), trimming stale ranks”; a curate pont: „…with the last 14 days' titles as ALREADY COVERED and one item per story”; a mirror: „every item of the current week scoring at least 85, the week's Top 3 and every daily Top 10”; `GET /api/cron/mirror` (15, 16 és 17 UTC); a válasz `{ issue, candidates, shortlisted, inserted, repos, daily, mirrored, retriedSources }`.
  - 2. lépés 5. pont: „`summarize` (`ingest_article`) writes the bilingual title, summary, key points, tags and the 2–3 minute `brief` (`lib/brief.ts`; empty without the text)…”.
  - Server path: új sor `/daily` → „`getDaily`: the latest day's `daily_top` with its items (1), then `itemSources` for the briefs and posts (⌈items / 30⌉), `getReaderSeed` ∥ `getRatings`”. A gyorsítótár kulcsa `["closed-week", "v4"]`.
  - App shell → One list: a „Napi” elem; Mobile: „five slots: Radar, Napi, the taiyaki, Library, Több”, a `MOBILE_MORE_NAV` most AI cégek, GitHub repók, Keresés, Archívum, Gyűjtemény; a „Több” keresőgombja bezárja a lapot.
  - Database: új pont a `daily_top`-ról (readers `select`, csak a titkos kulcs ír; `day` a budapesti dátum) és a `posts.brief`-ről.
  - Data contract: `DigestItem.dailyRank`, `DailyBrief`.
  - Az identity pages listájába `/daily` („nine identity pages”).
- [ ] **Step 2: DESIGN.md:** a Components alá „Daily view” rész: a hero („NAPI//”, a darabszám-sor, a „Korábbi lista” sor signal színnel), a tartalomjegyzék (2 px ink keret, mono, signal sorszám), a kártya rangja (display, signal), a „RÖVID” jel (signal háttér) és a heti „NAP TOP · N.” jel (1 px ink keret), a brief bekezdései `max-w-[75ch]`. A mobil sáv leírása Radar, Napi, taiyaki, Library, Több.
- [ ] **Step 3: ARCHITECTURE.md:** a codemap `app/(app)/` alá `daily/`; a `lib/` alá `brief.ts`, `pipeline/daily-top.ts`; az Invariants closed-week mondata változatlan (a kulcs-emelés szabálya most is áll).
- [ ] **Step 4: README.md:** a migrációs táblába `| 7 | \`20261012000000_daily_top_and_brief.sql\` | \`daily_top\` (the day's Top 10) and \`posts.brief\`. On the shared project, run it before deploying the code that reads them |`; a cron-időpontok (05:00 → 14:00 UTC, a tükör 15–17 UTC) ahol szerepelnek.
- [ ] **Step 5: AGENTS.md:** az előnézeti nézetek listájába `daily|daily-empty`.
- [ ] **Step 6: TODO.md:** a „Napi hírek” sor kipipálva, a Kész alá egy sor; a Következő lépések alá a kiadás sora: „A kiadás: a `daily-news` PR … a migráció a deploy előtt, migráció kell, új függőség nincs; első este: a `/daily` 18:00-ra kész…”.
- [ ] **Step 7: Az öt ellenőrzés**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Expected: mind zöld, `Found 0 clones.`

- [ ] **Step 8: Commit**

```bash
git add .claude/CLAUDE.md .claude/docs/DESIGN.md .claude/docs/ARCHITECTURE.md README.md AGENTS.md .claude/docs/TODO.md
git commit -m "docs: describe the daily run, the daily view and their data in the guides"
```
