# Apróságok 1 — a napi hírek robusztussága

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A napi hírek záró reviewjának elhalasztott apróságai: a nap listája minden aznapi tételből álljon (újrafuttatás, elbukott futás, az első este), a heti Top 3 frissüljön akkor is, ha a napi lista írása elbukik, és a `/daily` feliratai mindig igazat mondjanak.

**Architecture:** A `writeDailyTop` a nap jelöltjeit a `digest_items` aznapi (budapesti nap szerinti) soraiból veszi, nem a futás saját beszúrásaiból. A `refresh_must_read` a napi lista előtt fut. A `getDaily` tudja, hogy késik-e a mai lista, és hogy egy forrás végleg elakadt-e. A heti oldal hétfő délután előtt lezártként mutatja az előző hetet.

**Tech Stack:** Next.js 16, Supabase/PostgREST, `node --test`.

**Spec:** `.claude/docs/specs/2026-10-12-daily-news-design.md` (N4, N6, N8), a záró review minor pontjai (TODO.md → Halasztott apróságok → Napi hírek).

**Mód:** rövid terv, natív végrehajtás, egy záró review (a tulajdonos szokása kis csomagokra). Branch: `polish-daily-news`, a `main`-ről.

## Global Constraints

- Migráció nincs; a `daily_top` és a `digest_items` séma nem változik.
- A Radar `item.id` append-only; az `itemId()` bemenetei nem változnak.
- Minden UI-szöveg `{ hu, en }` copy-objektumban.
- Minden commit előtt: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`, új klón nélkül.
- Commit: Conventional Commits, kisbetűs, explicit pathspec, attribution nélkül. Push nincs.

## Review Focus

1. Egy aznapi második futás a reggeli tételeket is látja, de a tegnapiakat nem (a budapesti nap kezdete, nyári és téli időben).
2. A `daily_top` írásának hibája után a `refresh_must_read` már lefutott.
3. 18:00 után, mai lista nélkül, a felirat nem ígér 18:00-t.
4. Egy háromszor megszakadt forrás kártyája nem „készül…” örökre.
5. Hétfőn a 13 UTC-s futás előtt a `/` a lezárt hetet lezártként mutatja.

---

### Task 1: A nap jelöltjei a nap minden tételéből

**Files:**
- Modify: `lib/pipeline/daily-top.ts` (`budapestDayStart`)
- Modify: `lib/pipeline/daily.ts` (`writeDailyTop`, a hívás sorrendje)
- Modify: `lib/pipeline/fake-db.ts` (a generikus upsert beírja a sorait)
- Test: `lib/pipeline/daily-top.test.ts`, `lib/pipeline/daily.test.ts`

- [ ] **Step 1: A tesztek**

`lib/pipeline/daily-top.test.ts` (import: `budapestDayStart`):

```ts
// Review Focus 1. Kills the day's start taken in UTC, or with the wrong offset in summer or winter.
test("budapestDayStart is Budapest's midnight as a UTC instant, in summer and winter", () => {
  assert.equal(budapestDayStart(new Date("2026-07-01T15:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(budapestDayStart(new Date("2026-01-15T15:00:00Z")).toISOString(), "2026-01-14T23:00:00.000Z");
  assert.equal(budapestDayStart(new Date("2026-07-01T22:30:00Z")).toISOString(), "2026-07-01T22:00:00.000Z");
});
```

`lib/pipeline/daily.test.ts`: a „runDaily ranks only the items this run wrote” és az „a second run of the day keeps the earlier picks in the race” tesztek helyére:

```ts
// Polish 1, Review Focus 1. Kills a list built from this run's inserts only: a re-run after a failed one, or the
// first evening after a morning run, would rank only the few new items. Every item added since Budapest's
// midnight competes; yesterday's don't.
test("the day's Top 10 is picked from every item added today, whichever run added it", async (t) => {
  const { db } = await dailyRun(t, [{ title: "Evening", score: 60, minutes: 30 }], {
    rows: {
      digest_items: [
        { id: "morning-best", url: "https://old.test/m", score: 95, read_minutes: 5, created_at: "2026-09-23T05:00:00Z" },
        { id: "yesterday", url: "https://old.test/y", score: 99, read_minutes: 5, created_at: "2026-09-22T20:00:00Z" },
      ],
    },
  });
  const top = db.upserts.find((u) => u.table === "daily_top")?.values as { item_id: string }[];
  assert.deepEqual(top.map((row) => row.item_id).slice(0, 1), ["morning-best"]);
  assert.match(top[1].item_id, /-evening-/);
  assert.equal(top.length, 2);
});

// Polish 1, Review Focus 2. Kills the must-read refresh skipped when the daily list's write fails.
test("a failed daily_top write still leaves the week's Top 3 refreshed", async (t) => {
  const db = fakeDb(undefined, { tableWriteErrors: { daily_top: pgError("08006", "down") } });
  await assert.rejects(dailyRun(t, [{ title: "Story", score: 80, minutes: 5 }], {}, undefined, db));
  assert.deepEqual(db.rpcCalls.map((call) => call.name), ["refresh_must_read"]);
});
```

A `dailyRun` segéd ötödik, elhagyható paramétert kap: `db = fakeDb(undefined, tables)`, és azt használja (a negyedik, `now`, `undefined`-ra az alapértékét veszi). `pgError` import a `./fake-db.ts`-ből.

- [ ] **Step 2: Futtatás, bukik**

Run: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily-top.test.ts lib/pipeline/daily.test.ts`
Expected: FAIL (`budapestDayStart` nincs; a reggeli tétel nincs a listában; a hiba után nincs `refresh_must_read`).

- [ ] **Step 3: A kód**

`lib/pipeline/daily-top.ts`:

```ts
const HOUR = 3_600_000;

/** Budapest's midnight as an instant: 22:00 UTC the evening before in summer (UTC+2), 23:00 in winter (UTC+1). */
export function budapestDayStart(now: Date): Date {
  const day = budapestDay(now);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // The earlier candidate that already reads as `day` in Budapest is its midnight.
  const start = [2, 1].map((hours) => utcMidnight - hours * HOUR).find((instant) => budapestDay(new Date(instant)) === day);
  return new Date(start ?? utcMidnight);
}
```

`lib/pipeline/daily.ts`: a `writeDailyTop` aláírása `(db, now: Date)`, a törzse:

```ts
  // Every item added since Budapest's midnight competes, whichever run added it: a re-run, or the first evening after a
  // morning run, ranks the whole day, and the list only improves.
  const day = budapestDay(now);
  const { data, error } = await db
    .from("digest_items")
    .select("id, score, read_minutes")
    .gte("created_at", budapestDayStart(now).toISOString())
    .order("created_at");
  if (error) throw error;
  const daily = pickDailyTop((data ?? []) as DailyCandidate[]);
```

(a folytatás — az upsert és a régi rangok törlése — változatlan). A `runDaily`-ben a `refresh_must_read` hívás a `writeDailyTop` **elé** kerül, a hívás `writeDailyTop(db, now)`. A `fresh` változó csak az `inserted` számláló marad.

`lib/pipeline/fake-db.ts`, a generikus `upsert`: a megírt sorok bekerülnek a tábla fixture-sorai közé (mint a `posts` upsertjénél), így egy későbbi select látja őket:

```ts
        const written = () => { /* … változatlan … */ };
        const rows = written();
        if (!writeError) (tables.rows ??= {})[table] = [...(tables.rows?.[table] ?? []), ...rows];
```

(a `select` és a `then` ugyanazt a `rows`-t adja vissza). Ha egy meglévő teszt erre a beírásra érzékeny, ruling a naplóba.

- [ ] **Step 4: Futtatás, zöld** — a fenti parancs, PASS.
- [ ] **Step 5: Próbák:** `budapestDayStart` nélkül (`new Date(\`${day}T00:00:00Z\`)`) → bukjon nyári időben; a `.gte(...)` törlése → a tegnapi tétel bekerül; a `refresh_must_read` vissza a végére.
- [ ] **Step 6: Commit** — `fix: rank every item added today and refresh the top 3 before the daily list`

---

### Task 2: A `/daily` feliratai és az elakadt forrás

**Files:**
- Modify: `lib/pipeline/daily-top.ts` (`budapestHour`), `lib/content.ts` (`getDaily`: `late`, `attempts`)
- Modify: `lib/pipeline/util.ts`, `lib/pipeline/ingest.ts`, `app/api/sources/route.ts` (`MAX_ATTEMPTS` a `util.ts`-be költözik, hogy a `content.ts` ne húzza be az egész feldolgozót)
- Modify: `app/components/digest-dashboard.tsx` (copy: `dailyLate`, az angol `dailyIndex` / `dailyFeed`), `app/(app)/daily/page.tsx`, `lib/fixtures.ts`, `app/dev/preview/page.tsx`
- Test: `lib/content.test.ts`, `app/components/shell.test.ts`, `lib/pipeline/daily-top.test.ts`

- [ ] **Step 1: A tesztek**
  - `daily-top.test.ts`: `budapestHour(new Date("2026-07-01T16:30:00Z")) === 18`, télen `2026-01-15T16:30:00Z` → `17`.
  - `content.test.ts`, a „getDaily answers the latest day's list…” tesztbe: 2026-09-18 15:00 UTC (17:00) → `late: false`; a lista 09-17-i, 16:30 UTC (18:30) → `late: true`; mai lista mellett mindig `false`.
  - `content.test.ts`, a „getDaily gives each card the best long text there is” tesztbe egy ötödik forrás: `{ url: …/stuck, status: "pending", attempts: 3, posts: null }` → nincs bejegyzése a `briefs`-ben (a select-sztring: `"url, status, attempts, posts(id, brief, summary, key_points, overrides)"`).
  - `shell.test.ts`: a késő lista szövege: `dailyView({ daily: { ...previewDaily, late: true } })` → `/Today's list is late — showing the one from 2026\. 09\. 24\./`, és nincs benne „ready by 18:00”; az index `aria-label`-je `The day's stories`, a szakasz `THE DAY'S 10` (a meglévő `Today's stories` lekérdezések átírva).

- [ ] **Step 2: Futtatás, bukik** — `node --experimental-strip-types --no-warnings --test lib/pipeline/daily-top.test.ts lib/content.test.ts app/components/shell.test.ts`.

- [ ] **Step 3: A kód**

```ts
// lib/pipeline/daily-top.ts
const budapestClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", hourCycle: "h23" });
/** The hour on Budapest's clock (0–23): the daily list is due by 18. */
export const budapestHour = (now: Date) => Number(budapestClock.format(now));
export const DAILY_DUE_HOUR = 18;
```

A `getDaily` válasza: `late: day !== budapestDay(now) && budapestHour(now) >= DAILY_DUE_HOUR`; a `DailyData` típusba `late: boolean`. A pending ág: `else if (source.status === "pending" && (source.attempts as number) < MAX_ATTEMPTS)`.

`MAX_ATTEMPTS = 3` a `lib/pipeline/util.ts`-be kerül (`export const MAX_ATTEMPTS = 3;`, egy sor doc-kommenttel); az `ingest.ts` onnan importálja és továbbra is exportálja (`export { MAX_ATTEMPTS } from "./util.ts";`), így az `app/api/sources/route.ts` változatlan importja is működik.

A dashboard copy: `dailyLate: (day: string) => \`A mai lista késik — addig a ${day}-i látszik.\`` / `` `Today's list is late — showing the one from ${day}.` ``; az angol `dailyIndex: "The day's stories"`, `dailyFeed: "THE DAY'S 10"`. A `daily` prop típusa `{ today: boolean; late: boolean; briefs: … }`; a sor: `props.daily.late ? t.dailyLate(issue.label) : t.dailyStale(issue.label)`. Az oldal átadja a `late`-et; a `previewDaily` fixture `late: false`.

- [ ] **Step 4: Futtatás, zöld.**
- [ ] **Step 5: Próbák:** `>= DAILY_DUE_HOUR` → `>`; a `< MAX_ATTEMPTS` feltétel törlése; a `late` ág megfordítása.
- [ ] **Step 6: Commit** — `fix: say when the daily list is late and stop promising a brief for a stuck source`

---

### Task 3: Hétfőn a lezárt hét lezártként látszik

**Files:**
- Modify: `lib/pipeline/util.ts` (`isClosedWeek`), `lib/content.ts` (`archivedWeek` erre épül), `app/(app)/current-week-page.tsx`
- Test: `lib/pipeline/util.test.ts`

- [ ] **Step 1: A teszt** (`util.test.ts`):

```ts
// Polish 1, Review Focus 5. Kills last week shown as live on Monday before the evening run opens the new one.
test("isClosedWeek is true for any week before the current ISO week", () => {
  const monday = new Date("2026-09-28T10:00:00Z"); // W40's Monday morning
  assert.equal(isClosedWeek("2026-W39", monday), true);
  assert.equal(isClosedWeek("2026-W40", monday), false);
});
```

- [ ] **Step 2: Futtatás, bukik.**
- [ ] **Step 3: A kód:** `export const isClosedWeek = (week: string, now = new Date()) => week < isoWeek(now).id;` a `util.ts`-ben; az `archivedWeek` ezt hívja; a `CurrentWeekPage` `archived={isClosedWeek(radar.issue.id)}`-t ad a dashboardnak (így a fejléc „LEZÁRT KIADÁS”, a hero „lezárva”, amíg az esti futás meg nem nyitja az új hetet).
- [ ] **Step 4: Futtatás, zöld; próba:** `<` → `<=`.
- [ ] **Step 5: Commit** — `fix: show last week as closed on monday until the evening run opens the new one`

---

### Task 4: Dokumentáció és az öt ellenőrzés

- [ ] CLAUDE.md → How content gets in: a Top 10 „every item added since Budapest's midnight” (`budapestDayStart`), a `refresh_must_read` a napi lista előtt; Server path → `/daily`: a `late`; App shell: a hétfői lezárt hét.
- [ ] TODO.md: a napi hírek minor pontjai kipipálva, a Kész alá egy sor.
- [ ] Az öt ellenőrzés zöld; commit `docs: …`.
- [ ] Záró review (opus), egy javítási kör, a minorok a TODO-ba.
