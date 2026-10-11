# „Olvasd itt” és automatikus tükör — implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minden Radar-kártyán egy „Olvasd itt” gomb a saját Library-posztunkat nyitja, vagy a taiyaki chatben beküldi a cikket. A napi futás a hét legjobb híreit maga teszi be a Library-be, és külön napi cronok dolgozzák fel őket.

**Architecture:**
- **Sorba állítás:** a napi cron a `runDaily` után a `queueMirrors`-szal `pending` forrásokat ír a rendszer-fiók nevén.
- **Feldolgozás:** a meglévő `retryPendingSources` dolgozza fel őket a napi futásban, és három új `/api/cron/mirror` futásban is.
- **Lefoglalás:** a `processSource` lease-szel (`sources.claimed_at`) és összehasonlító frissítéssel foglal le egy forrást, így egyszerre csak egy futás dolgozik rajta.
- **A kártya:** egy gyorsítótár nélküli URL → poszt térképből tudja, hogy linket vagy chat-gombot mutasson.
- **A chat:** a shell egy kontextuson (`ReadHereContext`) át nyitja meg a linkkel.

**Tech Stack:** Next.js 16.3.4 (App Router, route handlers, `after()`), React 19.2 (`useEffectEvent`), Supabase (PostgREST, supabase-js), Vercel Cron (Hobby), `node --test` a `fakeDb`-vel és a render harness-szel.

**Spec:** `.claude/docs/specs/2026-09-30-read-here-mirror-design.md`

## Global Constraints

- **AGENTS.md hard rules:**
  - nincs `npx shadcn add`, nincs `supabase db push`, nincs push;
  - a migráció csak hozzáad, és a tulajdonos futtatja kézzel;
  - a Radar `item.id` append-only;
  - pontos verziójú függőségek, új függőség nincs;
  - a `lib/`-ben relatív `.ts` import;
  - komponensenként egy `{ hu, en }` copy-objektum;
  - nincs `NEXT_PUBLIC_` és nincs `dangerouslySetInnerHTML`;
  - az előnézet nem nyúl valódi adathoz;
  - commit: Conventional Commits, kisbetűs, felszólító mód, explicit pathspec, attribution nélkül.
- **Commit előtt** mind az öt ellenőrzés zöld: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`. A lint 0 hibát és 0 figyelmeztetést ad, a dup `Found 0 clones.`-t.
- **Tesztek:**
  - minden új teszt egy mutációs próbával bizonyítja, hogy nem üres: a hiba beírva elbukik, visszaállítva zöld;
  - a mockolt `console` hívásszámát mindig ellenőrizni kell;
  - a darabszámok deltaként: kiinduló szám **668**.
- **Szó szerint átvett értékek:**
  - `MIRROR_MIN_SCORE = 85`;
  - `CLAIM_LEASE_MS = 10 * 60_000`;
  - `LOOKUP_CHUNK = 30`;
  - a cronok időzítése: `/api/cron/daily` `0 5 * * *` (marad), `/api/cron/mirror` `0 7 * * *`, `0 8 * * *`, `0 9 * * *`;
  - a környezeti változó: `RADAR_MIRROR_USER_ID` (csak szerveroldali).
- **Szövegek:**
  - a gomb: HU `Olvasd itt`, EN `Read here`;
  - a sorban álló forrás válasza: HU `Már sorban van, pár perc és kész.`, EN `It's already in the queue; give it a few minutes.`
- **A migráció fájlja:** `supabase/migrations/20260930000000_source_claims.sql`, egy oszlop: `sources.claimed_at timestamptz`, nullable.
- **Buktatók** (TESTING.md → Pitfalls):
  - egy route-fájl mozgatása után a puszta `tsc` a `.next/types/validator.ts`-ben bukhat, ilyenkor előbb build kell;
  - a build és a futó `next dev` közös `.next/cache/turbopack`-et használ, ezért Playwright-mérés előtt ellenőrizni kell a kiszolgált CSS-t és JS-t.
- **A `node --test` útvonalában** minden `[` helyére `[[]` kell.

## Review Focus

1. **Az olvasó egy olyan cikknél kattint az „Olvasd itt”-re, amelyet a tükör már sorba tett**, de még nincs posztja. Elvárt: 409 `queued`, a feldolgozás azonnal elindul, és a chat ezt írja: „Már sorban van, pár perc és kész.” Ezt a 4. feladat tesztje rögzíti: `POST /api/sources starts a queued source that has no post yet…`.
2. **Két futás ugyanazt a forrást vinné egyszerre**, például egy duplán kézbesített cron vagy egy kattintás és egy cron. Elvárt: pontosan egy dolgozik rajta. A második is kimarad, ha az első lefoglalása után olvas. A 2. feladat két tesztje rögzíti ezt: `two processSource runs…` és `a fresh claim…`.
3. **Nincs beállítva a `RADAR_MIRROR_USER_ID`.** Elvárt: a napi kiadás megvan, `mirrored: 0`, egy figyelmeztetés, nincs lekérdezés. A 3. feladat tesztje rögzíti: `queueMirrors queues nothing without RADAR_MIRROR_USER_ID…`.
4. **Ugyanaz a cikk más URL-alakban érkezik** (`#fragment`, nagybetűs host). Elvárt: a sorba állítás és a kártya térképe egyformán normalizál, így a kártya megtalálja a tükrözött posztot. A 3. és az 5. feladat tesztje rögzíti.
5. **Elbukik a poszt-térkép lekérdezése.** Elvárt: a Radar megjelenik, a kártyák a chatet kínálják, és egy figyelmeztetés kerül a naplóba. Az 5. feladat tesztje rögzíti: `readHerePosts answers {} and logs once…`.

---

## Fájlok

| Fájl | Mit csinál | Feladat |
| --- | --- | --- |
| `lib/api.ts`, `lib/api.test.ts` | `isCronRequest`: a két cron közös jogosultság-ellenőrzése | 1 |
| `app/api/cron/daily/route.ts` (+ teszt) | a segédet használja; a `queueMirrors` a `runDaily` után; `mirrored` a válaszban | 1, 3 |
| `app/api/cron/mirror/route.ts` (+ teszt) | új: a sor feldolgozása a saját 300 mp-ével | 1 |
| `vercel.json` | három új cron | 1 |
| `supabase/migrations/20260930000000_source_claims.sql` | új: `sources.claimed_at` | 2 |
| `lib/pipeline/ingest.ts` (+ teszt) | a lefoglalás; a `processSource` `boolean`-t ad | 2 |
| `lib/pipeline/fake-db.ts` | `sources`: `upsert`, `.in`, awaitolható select | 3, 5 |
| `lib/pipeline/mirror.ts` (+ teszt) | új: `queueMirrors`, `MIRROR_MIN_SCORE` | 3 |
| `lib/my-sources.ts` (+ teszt) | a `duplicateSource` (az `existingPostId` helyett) és a `readHerePosts` | 4, 5 |
| `app/api/sources/route.ts` (+ teszt) | 409: a sorban álló forrást elindítja, `queued: true` | 4 |
| `lib/link-chat.ts` (+ teszt), `app/components/chat-thread.tsx` (+ teszt) | a `queued` válasz | 4 |
| `app/(app)/current-week-page.tsx`, `app/(app)/archive/[week]/page.tsx` | a térkép átadása | 5 |
| `app/components/story-card.tsx` | az „Olvasd itt” gomb | 6 |
| `app/components/digest-dashboard.tsx` | `posts` prop, `onReadHere` | 6 |
| `app/components/link-chat.tsx`, `app/components/app-shell.tsx` | `ReadHereContext`; a chat a sorban álló linket küldi | 6 |
| `app/components/shell.test.ts` | a kártya, a dashboard és a kontextus tesztjei | 6 |
| `lib/fixtures.ts`, `app/dev/preview/page.tsx` | `previewReadHerePosts` | 6 |
| dokumentáció, `.env.example`, `TODO.md` | | 7 |

---

### Task 1: Közös cron-jogosultság és a tükör-cron

**Files:**
- Modify: `lib/api.ts`, `lib/api.test.ts`
- Modify: `app/api/cron/daily/route.ts`
- Create: `app/api/cron/mirror/route.ts`, `app/api/cron/mirror/route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces: `export function isCronRequest(request: Request): boolean` (`lib/api.ts`); `GET /api/cron/mirror` → `200 { processed: number }` vagy `401 { error: "unauthorized" }`.

- [ ] **Step 1: A teszt** (`lib/api.test.ts`)

Az importsor: `import { isCronRequest, jsonError, postRoute } from "./api.ts";`, alá: `import { withEnv } from "./pipeline/mock-fetch.ts";`. A fájl végére:

```ts

// X1, for both cron routes. Kills `Bearer undefined` matching an unset secret, an empty secret opening
// the route, and a compare that is case-insensitive, trims, or takes a prefix.
test("isCronRequest takes only the exact bearer of a set CRON_SECRET", (t) => {
  const request = (authorization?: string) => new Request("http://localhost/api/cron/x", { headers: authorization ? { authorization } : {} });
  const cases: [string | undefined, string | undefined, boolean][] = [
    [undefined, undefined, false],
    [undefined, "Bearer undefined", false],
    ["", "Bearer ", false],
    ["s3cret", undefined, false],
    ["s3cret", "Bearer wrong", false],
    ["s3cret", "s3cret", false],
    ["s3cret", "bearer s3cret", false],
    ["s3cret", "Bearer s3cret ", false],
    ["s3cret", "Bearer s3cre", false],
    ["s3cret", "Bearer s3cret", true],
  ];
  for (const [secret, header, expected] of cases) {
    withEnv(t, "CRON_SECRET", secret);
    assert.equal(isCronRequest(request(header)), expected, `${secret} / ${header}`);
  }
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test lib/api.test.ts; echo "exit=$?"`
Elvárt: `SyntaxError: The requested module './api.ts' does not provide an export named 'isCronRequest'`, `exit=1`.

- [ ] **Step 3: A segéd** (`lib/api.ts`, a `jsonError` után)

```ts

/** Vercel Cron's `Authorization: Bearer $CRON_SECRET`, which a manual run sends too. With the secret
 *  unset or empty no header can match, so a missing secret never opens a cron route. */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
```

- [ ] **Step 4: A napi cron a segédet használja** (`app/api/cron/daily/route.ts`)

Import: `import { isCronRequest, jsonError } from "@/lib/api";`. Ez:

```ts
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized");
  }
```

helyett:

```ts
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");
```

A meglévő 401-es mátrix-teszt (`the cron answers 401 without a CRON_SECRET…`) változatlanul zöld marad. Ez bizonyítja, hogy a csere viselkedést nem változtat.

- [ ] **Step 5: A tükör-cron tesztje** (`app/api/cron/mirror/route.test.ts`, új)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../lib/pipeline/fake-db.ts";
import { mockFetch, TEST_HOST, withEnv } from "../../../../lib/pipeline/mock-fetch.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/mirror", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

/** One pending source (id 4, a dead page), as the daily run's queue leaves it. */
function onePendingSource() {
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });
}

// Kills the route shipped without the check: every scraper's guess would spend model calls. The
// check's own cases are isCronRequest's test (lib/api.test.ts).
test("the mirror cron answers 401 to a wrong bearer and never opens the admin client", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  const response = await GET(cronRequest("Bearer wrong"));
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
  assert.equal(routeStub.adminCalls, 0);
});

// Spec 3. Kills the queue left unworked (the mirror's sources would wait for tomorrow's run).
test("the mirror cron works the pending sources and says how many it took", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  mockFetch(t, async () => new Response("", { status: 404 })); // the pending source's page
  onePendingSource();
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.deepEqual([response.status, await response.json()], [200, { processed: 1 }]);
});

// Kills the route's own deadline dropped (`retryPendingSources(db)`): with 181 s of its 300 s gone,
// no source may start. Only two Date.now() calls happen on this path: the route's `start`, then the
// start gate's check.
test("the mirror cron forwards its own deadline: with 181 s of the 300 s gone, it starts nothing", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  onePendingSource();
  const start = 1_000_000;
  let calls = 0;
  t.mock.method(Date, "now", () => (calls++ === 0 ? start : start + 181_000));
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.deepEqual([response.status, await response.json()], [200, { processed: 0 }]);
});
```

- [ ] **Step 6: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test app/api/cron/mirror/route.test.ts; echo "exit=$?"`
Elvárt: `ERR_MODULE_NOT_FOUND … app/api/cron/mirror/route.ts`, `exit=1`.

- [ ] **Step 7: A route** (`app/api/cron/mirror/route.ts`, új)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest, jsonError } from "@/lib/api";
import { retryPendingSources } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Three extra daily runs (vercel.json: 07, 08 and 09 UTC, after the daily run's 05:00–06:05 window) that
// only work the queue: the Library mirror's pending sources, and any submission a killed run left
// behind, each run with its own 300 s (spec 3).
export async function GET(request: NextRequest) {
  const start = Date.now();
  if (!isCronRequest(request)) return jsonError(401, "unauthorized");
  const processed = await retryPendingSources(createAdminClient(), start + maxDuration * 1000);
  return NextResponse.json({ processed });
}
```

- [ ] **Step 8: A cronok** (`vercel.json`)

A `"crons"` tömb:

```json
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 5 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 7 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 8 * * *" },
    { "path": "/api/cron/mirror", "schedule": "0 9 * * *" }
  ]
```

(A Vercel megengedi ugyanazt az útvonalat több időzítéssel: docs → Managing Cron Jobs → „Reading the cron schedule header”. A Hobby csomagon mindegyik naponta egyszer, a megadott órán belül bármikor indul.)

- [ ] **Step 9: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test lib/api.test.ts app/api/cron/mirror/route.test.ts app/api/cron/daily/route.test.ts; echo "exit=$?"`
Elvárt: `fail 0`. Ha a kimenetben napló jelenik meg (a halott oldal feldolgozása), az adott tesztben mockold azt a `console`-metódust, és ellenőrizd a hívásszámot.

| Mutáció | Elvárt bukás |
| --- | --- |
| `Boolean(secret) &&` törlése | `isCronRequest takes only the exact bearer…` (`undefined / Bearer undefined`) |
| a mirror route-ból az `if (!isCronRequest(request))…` sor törlése | `the mirror cron answers 401…` |
| `start + maxDuration * 1000` → nincs második argumentum | `the mirror cron forwards its own deadline…` |

- [ ] **Step 10: Az öt ellenőrzés, commit**

Elvárt: `ℹ tests 671` (+3).

```bash
git commit -m "feat: add the mirror cron, with one cron check for both routes" -- lib/api.ts lib/api.test.ts app/api/cron/daily/route.ts app/api/cron/mirror/route.ts app/api/cron/mirror/route.test.ts vercel.json
```

(Új fájlnál előbb `git add` az új útvonalakra: `git add app/api/cron/mirror`.)

---

### Task 2: A forrás lefoglalása (lease és összehasonlító frissítés)

**Files:**
- Create: `supabase/migrations/20260930000000_source_claims.sql`
- Modify: `lib/pipeline/ingest.ts`, `lib/pipeline/ingest.test.ts`
- Modify: `lib/my-sources.ts` (a `retrySource` `ponytail:` megjegyzése)

**Interfaces:**
- Produces:
  - `export const CLAIM_LEASE_MS = 10 * 60_000`;
  - `processSource(db, id, options?): Promise<boolean>`: `true`, ha ez a futás foglalta le és dolgozott rajta;
  - `retryPendingSources` csak a lefoglaltakat számolja.
- Consumes: a `sources.claimed_at` oszlop.

- [ ] **Step 1: A migráció** (`supabase/migrations/20260930000000_source_claims.sql`, új)

```sql
-- A pipeline run claims a source before it works on it (lib/pipeline/ingest.ts → processSource). The
-- daily cron, the three mirror crons and a reader's "Olvasd itt" can reach the same source, and Vercel
-- may deliver one cron twice. Only adds a column: safe to run before the code that reads it is deployed.
alter table public.sources add column if not exists claimed_at timestamptz;

comment on column public.sources.claimed_at is
  'When a pipeline run claimed this source; null when none holds it. A claim older than 10 minutes belongs to a run that died, and the next run takes it over.';
```

- [ ] **Step 2: A tesztek** (`lib/pipeline/ingest.test.ts`)

Az importlistába: `CLAIM_LEASE_MS`. A `retryPendingSources` tesztjei elé:

```ts

// Spec 3, Review Focus 2. Kills the claim dropped or made unconditional: both runs would extract,
// both would upsert the post and spend the model twice, and one's media cleanup could delete the
// other's images.
test("two processSource runs on one source at once: exactly one claims it and builds the post", async (t) => {
  mockDns(t);
  withGeminiKey(t);
  const db = fakeDb(undefined, { source: newSource(40), post: null });
  mockFetch(t, articleGeminiHandler(ARTICLE_HTML, { remove: [] }));
  const results = await Promise.all([processSource(db, 40), processSource(db, 40)]);
  assert.deepEqual([...results].sort(), [false, true]);
  assert.equal(db.postUpserts.length, 1);
  assert.equal(db.sourceUpdates.filter((update) => "attempts" in update).length, 2); // both tried; one matched
});

// Review Focus 2. Kills a run that reads after another's claim and takes it anyway (the compare-and-
// swap alone can't see it: the attempts it reads are already the new ones), and a dead run's claim
// that is never taken over.
test("a fresh claim leaves the source to its run; one older than CLAIM_LEASE_MS is taken over", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, async (url) => {
    fetched.push(url);
    return new Response("", { status: 404 });
  });
  const held = fakeDb(undefined, { source: { ...newSource(41), attempts: 1, claimed_at: new Date(Date.now() - 60_000).toISOString() }, post: null });
  assert.equal(await processSource(held, 41), false);
  assert.deepEqual([held.sourceUpdates, fetched], [[], []]);

  const dead = fakeDb(undefined, { source: { ...newSource(42), attempts: 1, claimed_at: new Date(Date.now() - CLAIM_LEASE_MS - 1_000).toISOString() }, post: null });
  assert.equal(await processSource(dead, 42), true);
  assert.equal(dead.sourceUpdates[0].attempts, 2);
});

// Kills the claim never released: every finished source would look held for 10 minutes, so a reader's
// "Újra" right after a failure would do nothing. (Two tests: mockFetch once per test body.)
test("a run that succeeds releases its claim", async (t) => {
  const done = await processArticle(t, 43);
  assert.equal(done.sourceUpdates.at(-1)?.claimed_at, null);
});

test("a run that fails releases its claim too", async (t) => {
  mockFetch(t, async () => new Response("", { status: 404 }));
  const failed = fakeDb(undefined, { source: newSource(44), post: null });
  assert.equal(await processSource(failed, 44), true);
  assert.equal(failed.sourceUpdates.at(-1)?.claimed_at, null);
});
```

A meglévő, pontos payloadot rögzítő állításokat így kell módosítani. A `claimed_at` a lefoglalásnál egy időbélyeg, a záró írásban `null`:

| Sor (ma) | Régi | Új |
| --- | --- | --- |
| `ingest.test.ts:125` | `assert.deepEqual(db.sourceUpdates[0], { attempts: 1 });` | `assert.equal(db.sourceUpdates[0].attempts, 1);` és `assert.equal(typeof db.sourceUpdates[0].claimed_at, "string");` |
| `:220`, `:242`, `:309` | `{ error: "fetch 404" }` | `{ error: "fetch 404", claimed_at: null }` |
| `:225`, `:251` | `{ status: "failed", error: "fetch 404" }` | `{ status: "failed", error: "fetch 404", claimed_at: null }` |
| `:286` | `{ error: "storage down" }` | `{ error: "storage down", claimed_at: null }` |
| `:664` | `{ status: "failed", error: "duplicate key…" }` | ugyanaz, `claimed_at: null`-lal |

A sorszámok 2026-09-30-iak, ezért keresd meg őket így: `grep -n "sourceUpdates" lib/pipeline/ingest.test.ts`. A `:268`-as teszt (`failureWrite`) mezőnként olvas, azt ellenőrizd, de valószínűleg nem kell változtatni rajta.

- [ ] **Step 3: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test lib/pipeline/ingest.test.ts; echo "exit=$?"`
Elvárt: `does not provide an export named 'CLAIM_LEASE_MS'`, `exit=1`.

- [ ] **Step 4: A lefoglalás** (`lib/pipeline/ingest.ts`)

A `START_GATE_RESERVE_MS` után:

```ts

// A run's claim on its source (spec 3). Twice the routes' 300 s maxDuration: a claim older than this
// belongs to a run the platform killed, and the next run takes the source over.
export const CLAIM_LEASE_MS = 10 * 60_000;
```

A `Source` típus:

```ts
type Source = { id: number; url: string; kind: SourceKind; note: string | null; attempts: number; claimed_at?: string | null };
```

A `processSource` doc-kommentje és eleje:

```ts
/**
 * Turns a submitted source into a post, or refreshes an existing one, and answers whether this run
 * did the work. Only machine fields are written: `overrides` and `hidden_blocks` belong to the
 * submitter and are never touched here. Replaces only on success.
 *
 * It claims the source first (spec 3): a lease on `claimed_at` stops a run that reads the source
 * while another works on it, and a compare-and-swap on `attempts` stops two that read it at once.
 * A finished run releases the lease; one older than CLAIM_LEASE_MS is a dead run's and is taken over.
 * ponytail: a run that dies after its posts lookup throws keeps the lease for its full 10 minutes.
 */
export async function processSource(db: SupabaseClient, id: number, options: { deadline?: number } = {}): Promise<boolean> {
  const { data: source, error } = await db.from("sources").select("id, url, kind, note, attempts, claimed_at").eq("id", id).single<Source>();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  const now = Date.now();
  if (source.claimed_at && now - Date.parse(source.claimed_at) < CLAIM_LEASE_MS) return false;
  const { data: claimed, error: claimError } = await db
    .from("sources")
    .update({ attempts: source.attempts + 1, claimed_at: new Date(now).toISOString() })
    .eq("id", id)
    .eq("attempts", source.attempts)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) return false;
```

(Ez a `await updateSource(db, id, { attempts: source.attempts + 1 });` sort váltja ki.)

A két záró írás:

```ts
    await updateSource(db, id, { status: "done", error: null, claimed_at: null });
```

és

```ts
    await updateSource(db, id, { ...failureUpdate(saved || Boolean(existing), message), claimed_at: null });
```

A függvény végén, a `catch` blokk után: `return true;`.

A `retryPendingSources` ciklusa:

```ts
  let processed = 0;
  for (const row of data ?? []) {
    if (deadline !== undefined && deadline - Date.now() < START_GATE_RESERVE_MS) break;
    // Counts the runs that claimed their source: one another run holds is skipped, not counted.
    if (await processSource(db, row.id as number, { deadline })) processed++;
  }
  return processed;
```

Ha az `updateSource` típusa nem engedi a `claimed_at`-et (ellenőrizd a szignatúráját), bővítsd: `claimed_at?: string | null`.

- [ ] **Step 5: A `retrySource` megjegyzése** (`lib/my-sources.ts`)

A `// ponytail: the status CAS stops two overlapping clicks, not a click during the daily cron's own…` blokk helyére:

```ts
  // The status CAS below stops two overlapping clicks. A click during a cron's own run of this same
  // failed source is stopped by processSource's claim: the run holds `claimed_at`, so the retry's own
  // processSource finds the lease fresh and leaves it (spec 3). The attempts reset still gives the
  // retry a fresh 3-attempt cron budget.
```

- [ ] **Step 6: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test lib/pipeline/ingest.test.ts "app/api/sources/[[]id]/retry/route.test.ts" "app/api/posts/[[]id]/reextract/route.test.ts" app/api/cron/daily/route.test.ts app/api/cron/mirror/route.test.ts; echo "exit=$?"`
Elvárt: `fail 0`.

| Mutáció | Elvárt bukás |
| --- | --- |
| `.eq("attempts", source.attempts)` törlése | `two processSource runs on one source at once…` |
| a lease-sor (`if (source.claimed_at && …) return false;`) törlése | `a fresh claim leaves the source to its run…` |
| `< CLAIM_LEASE_MS` → `< Infinity` | ugyanaz (a halott futás lease-e) |
| a `claimed_at: null` kivétele a sikeres záró írásból | `a run that succeeds releases its claim` |
| a `claimed_at: null` kivétele a hibás záró írásból | `a run that fails releases its claim too` |
| `if (await processSource(…)) processed++` → `await processSource(…); processed++` | `retryPendingSources…` (a meglévő darabszámos tesztek egyike, vagy a `two runs` teszt) |

- [ ] **Step 7: Az öt ellenőrzés, commit**

Elvárt: `ℹ tests 675` (+4).

```bash
git add supabase/migrations/20260930000000_source_claims.sql
git commit -m "feat: claim a source before working on it, with a lease against double runs" -- supabase/migrations/20260930000000_source_claims.sql lib/pipeline/ingest.ts lib/pipeline/ingest.test.ts lib/my-sources.ts
```

---

### Task 3: A tükör sorba állítása

**Files:**
- Modify: `lib/pipeline/fake-db.ts` (`sources.upsert`, `sourceUpserts`, `sourceUpsertError`)
- Create: `lib/pipeline/mirror.ts`, `lib/pipeline/mirror.test.ts`
- Modify: `app/api/cron/daily/route.ts`, `app/api/cron/daily/route.test.ts`

**Interfaces:**
- Produces:
  - `export const MIRROR_MIN_SCORE = 85`;
  - `export async function queueMirrors(db: SupabaseClient, issueId: string, systemUserId?: string): Promise<number>` (`lib/pipeline/mirror.ts`);
  - a napi cron válasza: `{ …digest, mirrored, retriedSources }`, illetve `500 { error: "daily_failed", retriedSources, mirrored }`.
- Consumes: `parseSubmittedUrl`, `detectSource` (`lib/pipeline/util.ts`).

- [ ] **Step 1: A `fakeDb` `sources.upsert`-je** (`lib/pipeline/fake-db.ts`)

A `FakeIngestTables`-be, a `sourceInsertError` mellé:

```ts
  /** Forces `sources`' `upsert(...).select()` (queueMirrors) to resolve with this error. */
  sourceUpsertError?: PostgrestErrorShape;
```

A visszaadott db típusába és objektumába, a `sourceInserts` mellé:

```ts
  /** Every `sources` UPSERT (queueMirrors), in call order: its rows and options. */
  sourceUpserts: { values: Record<string, unknown>[]; options: Record<string, unknown> }[];
```

A `sources` táblaobjektumba, az `insert` után:

```ts
        // queueMirrors' insert-or-skip. Like PostgREST's ignoreDuplicates (ON CONFLICT DO NOTHING), a row
        // whose `url` is already in `sources` is skipped, and `.select()` answers only the rows it inserted.
        upsert: (values: Record<string, unknown>[], options?: Record<string, unknown>) => ({
          select: async () => {
            sourceUpserts.push({ values, options: options ?? {} });
            if (tables.sourceUpsertError) return { data: null, error: tables.sourceUpsertError };
            const known = new Set(lookedUp.map((row) => row.url));
            const fresh = values.filter((row) => !known.has(row.url));
            return { data: fresh.map((_, index) => ({ id: lookedUp.length + index + 1 })), error: null };
          },
        }),
```

(A `sourceUpserts` tömböt a többivel együtt kell deklarálni a `fakeDb` elején, és a visszaadott objektumba is fel kell venni.)

- [ ] **Step 2: A tesztek** (`lib/pipeline/mirror.test.ts`, új)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "./fake-db.ts";
import { MIRROR_MIN_SCORE, queueMirrors } from "./mirror.ts";
import { withEnv } from "./mock-fetch.ts";

const item = (url: string, score: number, mustRead = false, issue = "2026-W40") => ({ issue_id: issue, url, score, must_read: mustRead });

// Spec 2, Review Focus 4. Kills a threshold off by one (84 in, or 85 out), the Top 3 left out below it,
// another week's items taken, the URL stored raw (a #fragment or an upper-case host would miss the
// card's lookup and a later paste), the kind not detected, a duplicate URL sent twice in one upsert
// (Postgres refuses that), and rows not stamped with the system account.
test("queueMirrors queues the week's 85+ items and its Top 3 under the system account, normalized", async () => {
  const db = fakeDb(undefined, {
    rows: {
      digest_items: [
        item("https://BLOG.test/a#section", MIRROR_MIN_SCORE),
        item("https://blog.test/a", 96),
        item("https://github.com/owner/tool", 90),
        item("https://blog.test/top-but-low", 70, true),
        item("https://blog.test/b", MIRROR_MIN_SCORE - 1),
        item("https://blog.test/other-week", 99, true, "2026-W39"),
      ],
    },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 3);
  assert.deepEqual(db.sourceUpserts, [
    {
      values: [
        { url: "https://blog.test/a", kind: "article", submitted_by: "system-user" },
        { url: "https://github.com/owner/tool", kind: "github", submitted_by: "system-user" },
        { url: "https://blog.test/top-but-low", kind: "article", submitted_by: "system-user" },
      ],
      options: { onConflict: "url", ignoreDuplicates: true },
    },
  ]);
});

// Kills a member's own submission overwritten (ignoreDuplicates dropped), or counted as newly queued.
test("queueMirrors leaves a URL already in sources alone, and counts only what it newly queued", async () => {
  const db = fakeDb(undefined, {
    sources: [{ id: 1, url: "https://blog.test/a", submitted_by: "member", status: "done" }],
    rows: { digest_items: [item("https://blog.test/a", 95), item("https://blog.test/new", 95)] },
  });
  assert.equal(await queueMirrors(db, "2026-W40", "system-user"), 1);
  assert.deepEqual(db.sourceUpserts[0].options, { onConflict: "url", ignoreDuplicates: true });
});

// Review Focus 3. Kills a mirror that queues under no one (submitted_by is NOT NULL: the upsert would
// fail every day) or reads the week anyway, and a private URL queued past parseSubmittedUrl.
test("queueMirrors queues nothing without RADAR_MIRROR_USER_ID, saying so once, and skips a URL a submission would refuse", async (t) => {
  withEnv(t, "RADAR_MIRROR_USER_ID", undefined);
  const warn = t.mock.method(console, "warn", () => {});
  const unset = fakeDb(undefined, { rows: { digest_items: [item("https://blog.test/a", 95)] } });
  assert.equal(await queueMirrors(unset, "2026-W40"), 0);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(unset.queries, []);

  const privateOnly = fakeDb(undefined, { rows: { digest_items: [item("http://10.0.0.1/x", 95)] } });
  assert.equal(await queueMirrors(privateOnly, "2026-W40", "system-user"), 0);
  assert.deepEqual(privateOnly.sourceUpserts, []);
});
```

- [ ] **Step 3: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test lib/pipeline/mirror.test.ts; echo "exit=$?"`
Elvárt: `ERR_MODULE_NOT_FOUND … lib/pipeline/mirror.ts`, `exit=1`.

- [ ] **Step 4: A `queueMirrors`** (`lib/pipeline/mirror.ts`, új)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectSource, parseSubmittedUrl, type SourceKind } from "./util.ts";

/** A Radar item scoring at least this goes into the Library by itself, with the week's Top 3 (spec 2). */
export const MIRROR_MIN_SCORE = 85;

/**
 * The automatic Library mirror (spec 2): queues the week's best items, every one scoring at least
 * MIRROR_MIN_SCORE and the Top 3, as `pending` sources under the system account. A URL already in
 * `sources` (a member's own submission, or an earlier day's mirror) is left as it is. The daily cron
 * calls it after runDaily; retryPendingSources works the queue there and in the mirror crons.
 * Answers how many sources it newly queued; 0, with one warning, without the account.
 */
export async function queueMirrors(db: SupabaseClient, issueId: string, systemUserId = process.env.RADAR_MIRROR_USER_ID): Promise<number> {
  if (!systemUserId) {
    console.warn("RADAR_MIRROR_USER_ID is not set, so the Library mirror queued nothing");
    return 0;
  }
  const { data, error } = await db.from("digest_items").select("url, score, must_read").eq("issue_id", issueId);
  if (error) throw error;
  // The same normalizing a member's submission gets, so the card's lookup and a later paste find this row.
  // Keyed by URL: two items can normalize to one, and one upsert may not carry the same key twice.
  const rows = new Map<string, { url: string; kind: SourceKind; submitted_by: string }>();
  for (const item of data ?? []) {
    if (item.score < MIRROR_MIN_SCORE && !item.must_read) continue;
    const url = parseSubmittedUrl(item.url as string);
    if (url && !rows.has(url.toString())) rows.set(url.toString(), { url: url.toString(), kind: detectSource(url), submitted_by: systemUserId });
  }
  if (!rows.size) return 0;
  const { data: queued, error: queueError } = await db.from("sources").upsert([...rows.values()], { onConflict: "url", ignoreDuplicates: true }).select("id");
  if (queueError) throw queueError;
  return queued?.length ?? 0;
}
```

(A `Map` a beszúrás sorrendjét tartja, ezért a teszt `values` sorrendje a `digest_items` sorrendje. Az első `https://blog.test/a` a 85-ös `#section`-ös. Ez fontos, mert a 96-os már duplikátum.)

- [ ] **Step 5: A napi cron** (`app/api/cron/daily/route.ts`)

Importok: `import { queueMirrors } from "@/lib/pipeline/mirror";` és `import { isoWeek } from "@/lib/pipeline/util";`. A `runDaily` hívása után, a `revalidateTag` előtt:

```ts
  // After the digest, so today's items and Top 3 count (spec 2); after a failed one too, so the week's
  // earlier best still get queued. A failure here is logged, never the day's answer.
  const mirrored = await queueMirrors(db, isoWeek(new Date()).id).catch((error: unknown) => {
    console.error("library mirror queue failed", error);
    return 0;
  });
```

A két válasz:

```ts
  if (!digest) return jsonError(500, "daily_failed", { retriedSources: retried, mirrored });
  return NextResponse.json({ ...digest, mirrored, retriedSources: retried });
```

- [ ] **Step 6: A napi cron tesztjei** (`app/api/cron/daily/route.test.ts`)

- `failedDigestWithOnePendingSource`: a `withEnv` sorok után `withEnv(t, "RADAR_MIRROR_USER_ID", undefined);`. A figyelmeztetést a helper már mockolja.
- `a failed digest still retries…`: elvárt `[500, { error: "daily_failed", retriedSources: 1, mirrored: 0 }]`.
- `the route forwards its own deadline…`: elvárt `[500, { error: "daily_failed", retriedSources: 0, mirrored: 0 }]`.
- `a good cron run answers the digest…`: `withEnv(t, "RADAR_MIRROR_USER_ID", "system-user");`, elvárt JSON `{ issue, candidates: 0, shortlisted: 0, inserted: 0, repos: 0, mirrored: 0, retriedSources: 0 }`, a `warn` hívásszáma marad `feeds.length`.
- Új teszt a fájl végére:

```ts

// Spec 2. Kills a mirror failure that takes the day's answer with it (the route would 500 though the
// digest is in), or one swallowed without a log.
test("a failing mirror queue is logged once, and the digest still answers 200 with mirrored 0", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "RADAR_MIRROR_USER_ID", "system-user");
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  mockFetch(t, async (url) => {
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return geminiResponse({ items: [], github: [] });
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits: [] });
    if (url.startsWith("https://api.github.com/")) return Response.json({ items: [] });
    return new Response("", { status: 404 });
  });
  routeStub.admin = fakeDb(undefined, {
    pending: [],
    rows: { digest_items: [{ issue_id: isoWeek(new Date()).id, url: "https://blog.test/best", score: 95, must_read: true }] },
    sourceUpsertError: pgError("08006", "connection failure"),
  });
  const response = await GET(cronRequest("Bearer s3cret"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mirrored, 0);
  assert.equal(error.mock.callCount(), 1);
});
```

(Importok: `pgError` a `fake-db.ts`-ből.)

- [ ] **Step 7: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test lib/pipeline/mirror.test.ts app/api/cron/daily/route.test.ts lib/pipeline/fake-db.test.ts; echo "exit=$?"`
Elvárt: `fail 0`.

| Mutáció | Elvárt bukás |
| --- | --- |
| `item.score < MIRROR_MIN_SCORE` → `<=` | `queueMirrors queues the week's 85+ items…` |
| `&& !item.must_read` törlése | ugyanaz (a `top-but-low` kimarad) |
| `url.toString()` → `item.url` (nyers URL) | ugyanaz |
| `ignoreDuplicates: true` → `false` | `…leaves a URL already in sources alone…` |
| a `!systemUserId` ág törlése | `…queues nothing without RADAR_MIRROR_USER_ID…` |
| a route-ban a `.catch(...)` törlése | `a failing mirror queue is logged once…` |

- [ ] **Step 8: Az öt ellenőrzés, commit**

Elvárt: `ℹ tests 679` (+4).

```bash
git add lib/pipeline/mirror.ts lib/pipeline/mirror.test.ts
git commit -m "feat: queue the week's best radar items for the library mirror" -- lib/pipeline/fake-db.ts lib/pipeline/mirror.ts lib/pipeline/mirror.test.ts app/api/cron/daily/route.ts app/api/cron/daily/route.test.ts
```

---

### Task 4: A 409 elindítja a sorban álló forrást, és a chat megmondja

**Files:**
- Modify: `lib/my-sources.ts`, `lib/my-sources.test.ts` (a `duplicateSource` az `existingPostId` helyett)
- Modify: `app/api/sources/route.ts`, `app/api/sources/route.test.ts`
- Modify: `lib/link-chat.ts`, `lib/link-chat.test.ts`
- Modify: `app/components/chat-thread.tsx`, `app/components/chat-thread.test.ts`

**Interfaces:**
- Produces:
  - `export type DuplicateSource = { id: number; status: string; postId?: number }`;
  - `export async function duplicateSource(db: SupabaseClient, url: string): Promise<DuplicateSource | undefined>`;
  - a route 409-e: `{ error: "already_submitted", postId }` | `{ error: "already_submitted", queued: true }` | `{ error: "already_submitted" }`;
  - `ChatNotice` → `{ kind: "already_submitted"; postId: number | null; queued?: true }`.
- Consumes: a `processSource` lefoglalása (2. feladat).

- [ ] **Step 1: A `duplicateSource` tesztjei** (`lib/my-sources.test.ts`)

Az import: `existingPostId` → `duplicateSource`. A három `existingPostId` teszt helyére:

```ts
// Kills: the post id read off the wrong embed shape, or the id and status the route acts on dropped.
test("duplicateSource answers the source's id and status, and its post's id when it has one", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", status: "done", posts: { id: 9 } }] });
  assert.deepEqual(await duplicateSource(db, "https://blog.test/post"), { id: 4, status: "done", postId: 9 });
});

// Kills: a source with no post yet answered as if it had one (a postId key of undefined or null counts).
test("duplicateSource leaves postId out when the duplicate link has no post yet", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 4, url: "https://blog.test/post", status: "pending", posts: null }] });
  const found = await duplicateSource(db, "https://blog.test/post");
  assert.deepEqual(found, { id: 4, status: "pending" });
  assert.ok(found && !("postId" in found));
});

// Kills: a lookup failure left unlogged, or thrown instead of answered: the 409 the caller already
// decided on must still go out, just plain.
test("duplicateSource answers undefined and logs once when the lookup itself fails", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await duplicateSource(db, "https://blog.test/post"), undefined);
  assert.equal(warn.mock.calls.length, 1);
});
```

- [ ] **Step 2: A route tesztjei** (`app/api/sources/route.test.ts`)

A meglévő három 409-es teszt változatlanul érvényes. A `post lookup itself fails` teszt ugyanazzal a hívásszámmal marad zöld, mert a `duplicateSource` egyszer naplóz. A 409-es tesztek után:

```ts

const duplicate = pgError("23505", 'duplicate key value violates unique constraint "sources_url_key"');

// Spec 3, Review Focus 1. Kills a queued mirror left for the next cron (the reader who asked to read
// it would wait hours), started on the reader's own client (it can't update sources), or answered
// without `queued` (the chat would say someone else sent it in).
test("POST /api/sources starts a queued source that has no post yet, and says it is queued", async () => {
  reader({ sourceInsertError: duplicate, sources: [{ id: 4, url: "https://blog.test/post", status: "pending", posts: null }] });
  const admin = fakeDb();
  routeStub.admin = admin;
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [409, { error: "already_submitted", queued: true }]);
  assert.deepEqual(await scheduledSourceIds(admin), [4]);
});

// Kills a start for a source that already failed (only its submitter's "Újra" or the cron's retry
// may run it again) or that is done.
test("POST /api/sources starts nothing for a duplicate that failed or is done", async () => {
  for (const status of ["failed", "done"]) {
    reader({ sourceInsertError: duplicate, sources: [{ id: 4, url: "https://blog.test/post", status, posts: null }] });
    const response = await submit({ url: "https://blog.test/post" });
    assert.deepEqual([response.status, await response.json()], [409, { error: "already_submitted" }], status);
    assert.deepEqual(routeStub.scheduled, [], status);
  }
});
```

(Ha a `reader()` helper nem nullázza a `routeStub.scheduled`-et, a ciklusban hívd meg a `resetRoute()`-ot is. A helper ma `resetRoute()`-tal kezd.)

- [ ] **Step 3: A chat tesztjei** (`lib/link-chat.test.ts`, `app/components/chat-thread.test.ts`)

`lib/link-chat.test.ts`, a `send: every refusal…` teszt `cases` tömbjébe, a két 409-es sor után:

```ts
    [answer(409, { error: "already_submitted", queued: true }), { kind: "already_submitted", postId: null, queued: true }],
```

A `memoryTransport: a duplicate of a postless source…` teszt helyére:

```ts
// Kills the preview answering a queued duplicate unlike the real route (Minor 5 of the taiyaki plan:
// the route omits postId entirely, and now says `queued` for a pending source).
test("memoryTransport: a duplicate of a pending source with no post answers queued, with no postId key", async () => {
  const preview = memoryTransport([source(-1, "pending", { url: "https://blog.test/dup" })], false);
  const { status, body } = await preview.submit("https://blog.test/dup", null);
  assert.equal(status, 409);
  assert.deepEqual(body, { error: "already_submitted", queued: true });
  assert.ok(!("postId" in body));
});
```

`app/components/chat-thread.test.ts`, az `every local reply says what happened…` tesztben a `notices` tömbbe, a `{ kind: "already_submitted", postId: null }` sor után:

```ts
    { kind: "already_submitted", postId: null, queued: true },
```

és az elvárt listába, a `"Taiyaki: Ezt már beküldte valaki.",` sor után:

```ts
    "Taiyaki: Már sorban van, pár perc és kész.",
```

- [ ] **Step 4: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts app/api/sources/route.test.ts lib/link-chat.test.ts app/components/chat-thread.test.ts; echo "exit=$?"`
Elvárt: `does not provide an export named 'duplicateSource'` (a `my-sources.test.ts`-ben) és több `fail`, `exit=1`.

- [ ] **Step 5: A `duplicateSource`** (`lib/my-sources.ts`)

Az `existingPostId` (a doc-kommentjével együtt) helyére:

```ts
/** The source a duplicate submission ran into (`sources.url` is unique), with its post once there is one. */
export type DuplicateSource = { id: number; status: string; postId?: number };

/**
 * The source already holding `url`, once a duplicate submission's insert fails on `sources.url`'s
 * unique constraint (`POST /api/sources`): the reader's "already in" answer points at its post (the
 * link chat's "MEGNYITÁS →"), and a pending one with no post yet gets started (spec 3). `undefined`
 * when there is no row or the lookup itself fails; a failure is logged, never thrown, so the 409 the
 * caller already decided on still goes out, just plain.
 */
export async function duplicateSource(db: SupabaseClient, url: string): Promise<DuplicateSource | undefined> {
  const { data, error } = await db.from("sources").select("id, status, posts(id)").eq("url", url).maybeSingle();
  if (error) {
    console.warn("duplicate source lookup failed", error);
    return undefined;
  }
  if (!data) return undefined;
  const postId = embeddedPost(data.posts)?.id;
  return { id: data.id as number, status: data.status as string, ...(postId === undefined ? {} : { postId }) };
}
```

A `lib/my-sources.ts` 26. sora körüli megjegyzés az `existingPostId`-ra hivatkozik (`(`existingPostId` doesn't)`). Írd át `duplicateSource`-ra.

- [ ] **Step 6: A route** (`app/api/sources/route.ts`)

Import: `import { duplicateSource } from "@/lib/my-sources";`. A 23505-ös ág:

```ts
  if (error?.code === "23505") {
    const existing = await duplicateSource(reader.db, url.toString());
    // Already in: point the submitter at its post, once there is one (the chat's "MEGNYITÁS →").
    if (existing?.postId !== undefined) return jsonError(409, "already_submitted", { postId: existing.postId });
    if (existing?.status === "pending") {
      // Still waiting for a run, like a mirror the daily cron queued: start it now instead of at the
      // next cron (spec 3). processSource's claim leaves it alone if a run already holds it.
      after(() => processSource(createAdminClient(), existing.id));
      return jsonError(409, "already_submitted", { queued: true });
    }
    return jsonError(409, "already_submitted");
  }
```

- [ ] **Step 7: A chat** (`lib/link-chat.ts`, `app/components/chat-thread.tsx`)

`lib/link-chat.ts`:

```ts
export type ChatNotice =
  | { kind: "no_link" | "more_links" | "invalid_url" | "network" | "signed_out" }
  | { kind: "already_submitted"; postId: number | null; queued?: true };
```

A `noticeFor` 409-es ága:

```ts
  if (status === 409 && body.error === "already_submitted") {
    const postId = typeof body.postId === "number" ? body.postId : null;
    return body.queued === true ? { kind: "already_submitted", postId, queued: true } : { kind: "already_submitted", postId };
  }
```

A `memoryTransport` `submit`-jében ez:

```ts
        if (existing) return { status: 409, body: { error: "already_submitted", ...(existing.post ? { postId: existing.post.id } : {}) } };
```

helyett:

```ts
        if (existing) {
          const extra = existing.post ? { postId: existing.post.id } : existing.status === "pending" ? { queued: true } : {};
          return { status: 409, body: { error: "already_submitted", ...extra } };
        }
```

A doc-kommentben a mondat „`postId` present only when that source already has a post, same as `existingPostId`” helyett: „`postId` present only when that source already has a post, `queued` when it is pending without one, as the real route answers”.

`app/components/chat-thread.tsx`, a copy-ba: HU `queued: "Már sorban van, pár perc és kész.",`, EN `queued: "It's already in the queue; give it a few minutes.",` (az `already_submitted` után). A `NoticeText`-ben: `<p>{t.already_submitted}</p>` → `<p>{notice.queued ? t.queued : t.already_submitted}</p>`.

- [ ] **Step 8: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts app/api/sources/route.test.ts lib/link-chat.test.ts app/components/chat-thread.test.ts; echo "exit=$?"`
Elvárt: `fail 0`.

| Mutáció | Elvárt bukás |
| --- | --- |
| a route-ban az `existing?.status === "pending"` ág törlése | `…starts a queued source…` |
| `=== "pending"` → `!== "done"` | `…starts nothing for a duplicate that failed or is done` (`failed`) |
| `createAdminClient()` → `reader.db` | `…starts a queued source…` (a `scheduledSourceIds(admin)` üres) |
| a `noticeFor` `queued` ágának törlése | `send: every refusal…` |
| `notice.queued ? t.queued :` törlése | `every local reply says what happened…` |

- [ ] **Step 9: Az öt ellenőrzés, commit**

Elvárt: `ℹ tests 681` (+2; a `duplicateSource` három tesztje az `existingPostId` hármát váltja).

```bash
git commit -m "feat: start a queued source when a reader asks for it, and say it is queued" -- lib/my-sources.ts lib/my-sources.test.ts app/api/sources/route.ts app/api/sources/route.test.ts lib/link-chat.ts lib/link-chat.test.ts app/components/chat-thread.tsx app/components/chat-thread.test.ts
```

---

### Task 5: Melyik hírnek van már posztja

**Files:**
- Modify: `lib/pipeline/fake-db.ts` (`sources`: `.in` és awaitolható select)
- Modify: `lib/my-sources.ts`, `lib/my-sources.test.ts` (`readHerePosts`)
- Modify: `app/(app)/current-week-page.tsx`, `app/(app)/archive/[week]/page.tsx`

**Interfaces:**
- Produces:
  - `export async function readHerePosts(db: SupabaseClient, items: { id: string; url: string }[]): Promise<Record<string, number>>`, ami item id → post id;
  - a `DigestDashboard` `posts` propja: a 6. feladat használja.

- [ ] **Step 1: A `fakeDb`** (`lib/pipeline/fake-db.ts`)

- A `Filter` típus: `op: "eq" | "neq" | "lt" | "in"`.
- A `passes`-ben, az `if (op === "eq")` sor elé: `if (op === "in") return (value as unknown[]).includes(row[column]);`.
- A `sourcesQuery` `query` objektumába, a `lt: filter("lt"),` után:

```ts
    in: filter("in"),
    // Awaited without single() or limit(), as readHerePosts' `.in(...)` lookup is: every row of the
    // one-row fixtures (`sources`/`source`) that passes the filters.
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(error ? { data: null, error } : { data: matching(lookedUp).map((row) => project(row, columns)), error: null }).then(resolve, reject),
```

Ha a `tsc` a `then` miatt a `query` típusára panaszkodik, a `query`-t típusozd `Record<string, unknown>`-ként, vagy a `then`-t tedd egy `Object.assign`-nal hozzá. A lényeg: a lánc `await`-elhető legyen.

- [ ] **Step 2: A tesztek** (`lib/my-sources.test.ts`)

Import: `readHerePosts` a `./my-sources.ts`-ből. A fájl végére:

```ts

// Spec 1, Review Focus 4. Kills a lookup by the raw item URL (a #fragment or an upper-case host misses
// the normalized row the mirror and a submission store), a post given to the wrong item, a source with
// no post given one, and a URL a submission refuses looked up at all.
test("readHerePosts maps each item to the post made from its normalized URL, and leaves the rest out", async () => {
  const db = fakeDb(undefined, {
    sources: [
      { id: 1, url: "https://blog.test/a", posts: { id: 11 } },
      { id: 2, url: "https://blog.test/queued", posts: null },
    ],
  });
  const posts = await readHerePosts(db, [
    { id: "local-2026w40-a-1", url: "https://BLOG.test/a#section" },
    { id: "local-2026w40-queued-2", url: "https://blog.test/queued" },
    { id: "local-2026w40-new-3", url: "https://blog.test/new" },
    { id: "local-2026w40-private-4", url: "http://10.0.0.1/x" },
  ]);
  assert.deepEqual(posts, { "local-2026w40-a-1": 11 });
});

// Kills the lookup cut to its first chunk: a busy week's 31st story would never find its post.
test("readHerePosts looks up every chunk of a long week", async () => {
  const urls = Array.from({ length: 31 }, (_, index) => `https://blog.test/${index}`);
  const db = fakeDb(undefined, { sources: urls.map((url, index) => ({ id: index + 1, url, posts: { id: 100 + index } })) });
  const posts = await readHerePosts(db, urls.map((url, index) => ({ id: `item-${index}`, url })));
  assert.equal(Object.keys(posts).length, 31);
  assert.equal(posts["item-30"], 130);
});

// Review Focus 5. Kills a lookup failure thrown (the Radar page would error) or swallowed without a log.
test("readHerePosts answers {} and logs once when the lookup fails, so the cards offer the chat instead", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.deepEqual(await readHerePosts(db, [{ id: "a", url: "https://blog.test/a" }]), {});
  assert.equal(warn.mock.callCount(), 1);
});
```

- [ ] **Step 3: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts; echo "exit=$?"`
Elvárt: `does not provide an export named 'readHerePosts'`, `exit=1`.

- [ ] **Step 4: A `readHerePosts`** (`lib/my-sources.ts`)

Import: `import { MINE_LIMIT, parseSubmittedUrl, type SourceKind } from "./pipeline/util.ts";`. A fájl végére:

```ts

/** URLs per `.in(...)` lookup: a week's hundred or so stay far under PostgREST's URL-length limit. */
const LOOKUP_CHUNK = 30;

/**
 * Item id → the Library post already made from its URL: a card's "Olvasd itt" opens it (spec 1). The
 * URLs go through parseSubmittedUrl, as a submission's and the mirror's do, so both sides compare the
 * same string. A failed lookup answers {} and is logged: the card then offers the chat, whose 409 still
 * points at the post. Never cached: a post can appear any day, for an open week or a closed one.
 */
export async function readHerePosts(db: SupabaseClient, items: { id: string; url: string }[]): Promise<Record<string, number>> {
  const idsByUrl = new Map<string, string[]>();
  for (const item of items) {
    const url = parseSubmittedUrl(item.url)?.toString();
    if (url) idsByUrl.set(url, [...(idsByUrl.get(url) ?? []), item.id]);
  }
  const urls = [...idsByUrl.keys()];
  const chunks = Array.from({ length: Math.ceil(urls.length / LOOKUP_CHUNK) }, (_, index) => urls.slice(index * LOOKUP_CHUNK, (index + 1) * LOOKUP_CHUNK));
  const answers = await Promise.all(chunks.map((chunk) => db.from("sources").select("url, posts(id)").in("url", chunk)));
  const posts: Record<string, number> = {};
  for (const { data, error } of answers) {
    if (error) {
      console.warn("read-here post lookup failed", error);
      return {};
    }
    for (const row of data ?? []) {
      const post = embeddedPost(row.posts);
      if (post) for (const id of idsByUrl.get(row.url as string) ?? []) posts[id] = post.id;
    }
  }
  return posts;
}
```

- [ ] **Step 5: Az oldalak**

`app/(app)/current-week-page.tsx`, import: `import { readHerePosts } from "@/lib/my-sources";`. A return:

```tsx
  // After the Radar, not beside it: both need its answer (the week's id, its items). Beside each other.
  const [seed, posts] = await Promise.all([getReaderSeed(reader.db, radar.issue.id), readHerePosts(reader.db, radar.items)]);
  return <DigestDashboard {...radar} scope={scope} seed={seed} posts={posts} />;
```

(A régi `// After the Radar, not beside it: the latest week's id comes from its answer.` megjegyzés helyére.)

`app/(app)/archive/[week]/page.tsx`, import ugyanaz, a vége:

```tsx
  if (!radar) notFound();
  // After the week, not beside it: the lookup needs its items. Never cached, unlike a closed week itself.
  const posts = await readHerePosts(reader.db, radar.items);
  return <DigestDashboard archived {...radar} seed={seed} posts={posts} />;
```

A `DigestDashboard` még nem ismeri a `posts` propot, ezért a `tsc` itt hibázik. A prop a 6. feladat 3. lépésében jön. Ezt a két oldal-módosítást ezért **a 6. feladattal együtt commitold**, ebben a feladatban csak a `lib` részt.

- [ ] **Step 6: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts lib/pipeline/fake-db.test.ts; echo "exit=$?"`
Elvárt: `fail 0`.

| Mutáció | Elvárt bukás |
| --- | --- |
| `parseSubmittedUrl(item.url)?.toString()` → `item.url` | `readHerePosts maps each item…` |
| `chunks.map(...)` → `chunks.slice(0, 1).map(...)` | `readHerePosts looks up every chunk…` |
| `return {};` (hibaágon) → `continue;` + nincs `console.warn` | `readHerePosts answers {} and logs once…` |

- [ ] **Step 7: Az öt ellenőrzés, commit** (az oldalak nélkül)

Elvárt: `ℹ tests 684` (+3).

```bash
git commit -m "feat: find the library post of each radar item" -- lib/pipeline/fake-db.ts lib/my-sources.ts lib/my-sources.test.ts
```

---

### Task 6: Az „Olvasd itt” gomb és a chat bekötése

**Files:**
- Modify: `app/components/story-card.tsx`
- Modify: `app/components/digest-dashboard.tsx`
- Modify: `app/components/link-chat.tsx`, `app/components/app-shell.tsx`
- Modify: `app/(app)/current-week-page.tsx`, `app/(app)/archive/[week]/page.tsx` (az 5. feladatból)
- Modify: `lib/fixtures.ts`, `app/dev/preview/page.tsx`
- Test: `app/components/shell.test.ts`

**Interfaces:**
- Consumes: a `readHerePosts` (5. feladat).
- Produces:
  - `CardActions.onReadHere: (item: DigestItem, opener: HTMLButtonElement) => void`;
  - `CardProps.postId?: number`;
  - `DigestDashboard` `posts?: Record<string, number>`;
  - `export type ReadHere = (url: string, opener: HTMLButtonElement) => void`, `export const ReadHereContext`, `export function useReadHere(): ReadHere` (`link-chat.tsx`);
  - a `LinkChat` új, opcionális propjai: `queuedLink?: string | null`, `onQueuedLinkTaken?: () => void`;
  - `previewReadHerePosts` (`lib/fixtures.ts`).

- [ ] **Step 1: A tesztek** (`app/components/shell.test.ts`)

- Importok: a `link-chat.tsx`-ből a `ReadHereContext` is: `const { CHAT_PANEL_ID, LinkChat, ReadHereContext, TaiyakiButton } = await import("./link-chat.tsx");`.
- A fixture-importba: `digestItem`.
- A reader-store importba: `EMPTY_ITEM_STATE`.
- A `cardActions`: `const cardActions = { onOpen: noop, onToggle: noop, onAddTodo: noop, onReadHere: noop };`.
- A `withShellProviders` a harmadik providerrel:

```ts
/** Wraps a component in the providers the shell gives it: the language (LocalizedText, SubmitForm,
 *  DigestDashboard), the refresh bar (SubmitForm, LinkChat) and "Olvasd itt" (DigestDashboard). */
const withShellProviders = <P extends object>(Component: ComponentType<P>, props: P) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "en" } as ComponentProps<typeof LanguageProvider>,
      createElement(RefreshProvider, null, createElement(ReadHereContext, { value: noop }, createElement(Component, props))),
    ),
  );
```

A fájl végére:

```ts

// Spec 1. Kills the link to the post missing (the reader would be sent through the chat for a post
// that exists), the chat button offered for a URL a submission refuses (its send would only say
// "invalid_url"), and the button missing for a public link.
test("a card's Read here opens the Library post when there is one, asks the chat for a public link, and is absent otherwise", () => {
  const card = (url: string, postId?: number) =>
    render(createElement(StoryCard, { item: digestItem("local-2026w40-x-1", { url }), state: EMPTY_ITEM_STATE, hasTodo: false, language: "en", actions: cardActions, postId }));
  assert.equal(card("https://blog.test/a", 7).querySelector('a[href="/library/7"]')?.textContent?.trim(), "Read here");
  const buttons = [...card("https://blog.test/a").querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Read here");
  assert.equal(buttons.length, 1);
  assert.equal(card("http://10.0.0.1/a").body.textContent?.includes("Read here"), false);
});

// Spec 1. Kills `posts` not reaching the cards, or reaching the wrong one.
test("DigestDashboard gives each card its Library post from `posts`", () => {
  const item = previewItems.find((candidate) => !candidate.mustRead)!;
  const doc = withShellProviders(DigestDashboard, {
    issue: previewIssue,
    items: previewItems,
    githubTop10: previewGithub,
    preview: { data: previewReader, failWrites: false },
    posts: { [item.id]: 42 },
  });
  assert.equal(doc.querySelector(`[data-card-id="${item.id}"] a[href="/library/42"]`)?.textContent?.trim(), "Read here");
  assert.equal(doc.querySelectorAll('a[href^="/library/"]').length, 1);
});

// Like useRefresh. Kills a useReadHere that quietly does nothing without the shell: the button would
// mark the story read and open nothing.
test("useReadHere outside AppShell throws, naming where the provider lives", () => {
  const bare = () =>
    render(
      createElement(
        LanguageProvider,
        { initial: "en" } as ComponentProps<typeof LanguageProvider>,
        createElement(RefreshProvider, null, createElement(DigestDashboard, { issue: previewIssue, items: previewItems, githubTop10: previewGithub, preview: { data: previewReader, failWrites: false } })),
      ),
    );
  assert.throws(bare, /useReadHere must be used inside AppShell \(app\/components\/app-shell\.tsx\)/);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

`node --experimental-strip-types --no-warnings --test app/components/shell.test.ts; echo "exit=$?"`
Elvárt: bukás, mert a `ReadHereContext` nem létezik: `Cannot read properties of undefined`, vagy a `createElement(undefined…)` hibája. `exit=1`.

- [ ] **Step 3: A kártya** (`app/components/story-card.tsx`)

- Importok: `import Link from "next/link";`; a lucide-ba `BookOpen`; `import { parseSubmittedUrl } from "@/lib/pipeline/util";`; `import { PendingDot } from "./nav-parts";`.
- A copy-ba: HU `readHere: "Olvasd itt",`, EN `readHere: "Read here",` (az `open` után).
- A `CardActions`-be:

```ts
  /** "Olvasd itt" with no Library post yet: the link chat sends the item's URL (spec 1). `opener` gets
   *  the focus back when the chat closes. */
  onReadHere: (item: DigestItem, opener: HTMLButtonElement) => void;
```

- A `CardProps`:

```ts
export type CardProps = {
  item: DigestItem;
  state: ItemState;
  hasTodo: boolean;
  language: Language;
  actions: CardActions;
  /** The Library post already made from the item's URL (readHerePosts): "Olvasd itt" opens it. */
  postId?: number;
};
```

- A `CardFooter` doc-kommentje: `/** [Open] [Olvasd itt] [rating: milestone B] [Later] [+ to-do] … [Read]: every action in one row at the bottom, in thumb reach. */`. A szignatúrája: `function CardFooter({ item, state, hasTodo, language, actions, postId }: CardProps)`. A „Megnyitás” `</Button>` zárása után, a `{/* Milestone B … */}` sor elé:

```tsx
      {/* Spec 1: our own post when there is one; otherwise the chat sends the link, unless a submission would refuse it. */}
      {postId !== undefined ? (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}`} onClick={() => actions.onOpen(item)}>
            <BookOpen /> {t.readHere} <PendingDot />
          </Link>
        </Button>
      ) : (
        parseSubmittedUrl(item.url) && (
          <Button
            variant="brutal"
            className="min-h-10"
            onClick={(event) => {
              actions.onOpen(item);
              actions.onReadHere(item, event.currentTarget);
            }}
          >
            <BookOpen /> {t.readHere}
          </Button>
        )
      )}
```

(A DESIGN.md `<Button asChild variant="ink" className="min-h-10">` részlete változatlan marad: a „Megnyitás” sorához nem nyúlunk.)

- [ ] **Step 4: A dashboard** (`app/components/digest-dashboard.tsx`)

- Import: `import { useReadHere } from "./link-chat";`.
- A propokba: `/** Item id → its Library post (readHerePosts): the cards' "Olvasd itt" opens it. */ posts?: Record<string, number>;`.
- A hookok közé, a `useReaderState` után: `const readHere = useReadHere();`.
- Az `actions`-be: `onReadHere: (item, opener) => readHere(item.url, opener),`.
- A `cardProps`-ba: `postId: props.posts?.[item.id],`.

- [ ] **Step 5: A kontextus és a chat** (`app/components/link-chat.tsx`)

- Az importokba: `createContext`, `useContext`, `useEffectEvent` (a `react`-ből).
- A `LinkChat` elé:

```tsx
/** A card's "Olvasd itt" for an article with no post yet (spec 1): opens the chat and sends `url`; the
 *  button that asked gets the focus back when the chat closes, like a taiyaki. */
export type ReadHere = (url: string, opener: HTMLButtonElement) => void;

/** Given by the app shell, which owns the chat's open state. */
export const ReadHereContext = createContext<ReadHere | null>(null);

export function useReadHere(): ReadHere {
  const readHere = useContext(ReadHereContext);
  if (!readHere) throw new Error("useReadHere must be used inside AppShell (app/components/app-shell.tsx)");
  return readHere;
}
```

- A `LinkChat` propjai: `queuedLink?: string | null;` (doc: `/** A card's "Olvasd itt" link, sent once the panel is open. */`) és `onQueuedLinkTaken?: () => void;`.
- A `send` ketté válik. Ez a mai függvény:

```tsx
  async function send() {
    const sent = await chat.send(text);
    …
    if (!sent) return;
    setText("");
    // Send pressed from the keyboard has the focus; the next link goes in the field.
    input.current?.focus();
    // The Library list shows the new submission too, …
    if (pathname === "/library" || pathname === "/dev/preview") refresh();
  }
```

helyett:

```tsx
  /** Sends `message` (the field's text, or a card's "Olvasd itt" link); true when it went in. */
  async function submit(message: string): Promise<boolean> {
    const sent = await chat.send(message);
    // The reader's own send ends at its answer, even for a reader who scrolled up. Pinned directly once it
    // has settled, in the next frame, after React has committed it, rather than armed for the observer: a
    // send that changes no size (a deduped signed_out, a full thread whose dropped entry was as tall) would
    // leave that armed, and the next unrelated resize would pull the reader down.
    requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    // The Library list shows the new submission too, as it does after its own form's. The preview has one
    // path for all its views, so there every view refreshes.
    if (sent && (pathname === "/library" || pathname === "/dev/preview")) refresh();
    return sent;
  }

  async function send() {
    if (!(await submit(text))) return;
    setText("");
    // Send pressed from the keyboard has the focus; the next link goes in the field.
    input.current?.focus();
  }

  // A card's "Olvasd itt" (spec 1): its link goes in once the panel is open, as if the reader had pasted
  // it. The field keeps whatever the reader was typing.
  const takeQueuedLink = useEffectEvent((link: string) => {
    onQueuedLinkTaken?.();
    void submit(link);
  });
  useEffect(() => {
    if (open && queuedLink) takeQueuedLink(queuedLink);
  }, [open, queuedLink]);
```

Ez az effect a `chat.open()` effect **után** álljon a forrásban, mert a React a deklaráció sorrendjében futtatja őket. Így a panel előbb megnyílik és betölt, aztán küld. A két meglévő megjegyzés szó szerint átkerül, ahogy fent áll.

- [ ] **Step 6: A shell** (`app/components/app-shell.tsx`)

- Importok: `useCallback`; a `./link-chat`-ből `ReadHereContext` és `type ReadHere`.
- A `chatOpener` után:

```tsx
  // A card's "Olvasd itt" (spec 1): the chat opens with the card's link, and the card's button gets the
  // focus back, like a taiyaki does. The link waits here until the open panel takes it.
  const [queuedLink, setQueuedLink] = useState<string | null>(null);
  const readHere = useCallback<ReadHere>((url, opener) => {
    chatOpener.current = opener;
    setQueuedLink(url);
    setChatOpen(true);
  }, []);
```

- A `<DesktopNav …>…</DesktopNav>` elem köré: `<ReadHereContext value={readHere}>` … `</ReadHereContext>`. A `MobileNav` nem kell bele, mert a kártyák a `DesktopNav` gyerekei között vannak.
- A `LinkChat` hívásába: `queuedLink={queuedLink} onQueuedLinkTaken={() => setQueuedLink(null)}`.

Ha a DESIGN.md → Page shell részlete (`lib/design-excerpts.test.ts`) az `AppShell` returnjét idézi, másold újra szó szerint a szerkesztett forrásból.

- [ ] **Step 7: Az oldalak és az előnézet**

- Az 5. feladat 5. lépésének két oldal-módosítása most kerül be.
- `lib/fixtures.ts`, a `previewReadPostIds` után:

```ts
/** The preview's "Olvasd itt" links: this item already has a post (a fixture's negative id, so the real
 *  /library/-1 route 404s before any query); every other readable card asks the chat, whose preview
 *  transport never reaches the API. */
export const previewReadHerePosts: Record<string, number> = { "local-2026-W39-read": -1 };
```

- `app/dev/preview/page.tsx`, a `previewReadHerePosts` importja, és a radar- és companies-`DigestDashboard`-ba `posts={previewReadHerePosts}`.

- [ ] **Step 8: Futtatás, zöld; mutációk**

`node --experimental-strip-types --no-warnings --test app/components/shell.test.ts lib/design-excerpts.test.ts lib/client-bundle.test.ts lib/fixtures.test.ts; echo "exit=$?"`
Elvárt: `fail 0`. A kliens-bundle őr zöld marad: a `story-card.tsx` a `util.ts`-ből a `parseSubmittedUrl`-t importálja, és abban nincs zod.

| Mutáció | Elvárt bukás |
| --- | --- |
| a kártyán `postId !== undefined ?` → `false ?` | `a card's Read here opens the Library post…` |
| `parseSubmittedUrl(item.url) &&` törlése | ugyanaz (a privát URL-nél is van gomb) |
| a dashboardon `postId: props.posts?.[item.id],` törlése | `DigestDashboard gives each card its Library post…` |
| a `useReadHere`-ben a `throw` → `return () => {}` | `useReadHere outside AppShell throws…` |

- [ ] **Step 9: Az öt ellenőrzés, a futásidejű próba, commit**

Elvárt: `ℹ tests 687` (+3). A curl-ciklus (global-constraints) mind a 23 nézetre `200 <nézet> 0`.

```bash
git commit -m "feat: add read here to every radar card, through the post or the link chat" -- app/components/story-card.tsx app/components/digest-dashboard.tsx app/components/link-chat.tsx app/components/app-shell.tsx "app/(app)/current-week-page.tsx" "app/(app)/archive/[week]/page.tsx" lib/fixtures.ts app/dev/preview/page.tsx app/components/shell.test.ts
```

(Ha a DESIGN.md-részletet újra kellett másolni, a `DESIGN.md` is kerüljön a pathspecbe.)

---

### Task 7: Dokumentáció, környezet és a végső ellenőrzés

**Files:** `.env.example`, `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `SECURITY.md`, `TESTING.md`, `DESIGN.md`, `TODO.md`, és a spec `Állapot` sora.

Minden fájlt szerkesztés előtt olvass újra. Minden tényt a kódon ellenőrizz: ahol a kód mást csinál, mint ami itt áll, azt írd le, amit a kód csinál. A tény egy helyen álljon, a többi hely hivatkozzon rá.

- [ ] **Step 1: `.env.example`**, a `# --- Pipeline ---` rész végére:

```
# Optional. The Library mirror's system account: Supabase → Authentication → Users → Add user, Auto
# Confirm; nobody signs in with it. The daily run queues the week's best items (85+ points and the Top 3)
# under this user's id. Without it the mirror queues nothing, and the rest runs as before.
RADAR_MIRROR_USER_ID=
```

- [ ] **Step 2: `README.md`**
  - **Environment táblázat:** új sor: `RADAR_MIRROR_USER_ID` | no | a rendszer-fiók UUID-ja a Library-tükörhöz.
  - **Migrations táblázat:** 5. sor: `20260930000000_source_claims.sql` | `sources.claimed_at`, a futások lefoglalása. A shared projekten a kód előtt kell futtatni.
  - **Deploy, 3. pont:** a `/api/cron/mirror` 07, 08 és 09 UTC-kor, a sor feldolgozására.
  - **A beállítás lépései közé** (Supabase): a rendszer-fiók felvétele. *Authentication → Users → Add user*, Auto Confirm, a UUID a `RADAR_MIRROR_USER_ID`-be.
  - **Content and copyright:** egy pont arról, hogy a napi futás a hét legjobbjait maga is tükrözi, ugyanazokkal a védelmekkel.
  - **What it is (Radar bekezdés):** a kártyák „Olvasd itt”-je.
- [ ] **Step 3: `CLAUDE.md`**
  - **How content gets in, 1.:** a `queueMirrors` a `runDaily` után (85+ és Top 3, a rendszer-fiók, `ignoreDuplicates`), a `mirrored` a válaszban, és a `/api/cron/mirror` három futása.
  - **2., 1. lépés:** „Bumps `attempts`” → a lefoglalás: lease (`claimed_at`, `CLAIM_LEASE_MS`), összehasonlító frissítés és a feloldás.
  - **A 409:** `queued`, és a feldolgozás indítása.
  - **Server path:** a `/` és a `/archive/[week]` sora a `readHerePosts`-szel. A `/`-on párhuzamos, 30 URL-enként egy lekérdezés; a `/archive/[week]`-en egy kör utána.
  - **App shell → Link chat:** az „Olvasd itt” a `ReadHereContext`-en át nyitja meg a panelt, és a panel a nyitás után küld.
  - **Routes:** a `POST /api/sources` 409-e (`postId` | `queued` | sima), és új sor: `GET /api/cron/mirror`.
  - **Database → RLS → `sources`:** a `claimed_at`-et csak az admin kliens írja.
- [ ] **Step 4: `ARCHITECTURE.md`**
  - **Codemap:** `lib/pipeline/mirror.ts`, `app/api/cron/mirror/`.
  - **Bird's eye view:** a napi pipeline a legjobbakat a Library-be is sorba teszi.
  - **Invariants:** új pont: „Egy forráson egyszerre egy futás dolgozik (`processSource` lefoglalása; a mechanika a CLAUDE.md-ben).”
- [ ] **Step 5: `SECURITY.md`** (Reader vs admin client): a `queueMirrors` a cronban fut, az admin klienssel. A rendszer-fióknak nincs jelszava, senki nem lép be vele. A `RADAR_MIRROR_USER_ID` nem titok, de csak szerveroldali.
- [ ] **Step 6: `TESTING.md`** (Helpers → fakeDb):
  - `sources`: `upsert(...).select()` (`sourceUpserts`, `sourceUpsertError`, DO NOTHING a meglévő URL-en);
  - `.in(column, values)`;
  - `await`-elhető select.
- [ ] **Step 7: `DESIGN.md`** (Components → story-card): az akciósor „Open (`ink`), Olvasd itt (`brutal`, a Library ikonjával), Later…”.
- [ ] **Step 8: `TODO.md`**
  - Az „Olvasás a saját oldalunkon a Radarból is” pont → a „Kész” alá, dátummal (`date +%F`).
  - A „Következő lépések” elejére a tulajdonos teendői, sorrendben: 1. migráció (SQL Editor), 2. rendszer-fiók, 3. `RADAR_MIRROR_USER_ID` a Vercelben, 4. push.
  - A spec fejléce marad `jóváhagyva`.
- [ ] **Step 9: A végső ellenőrzés**
  1. `node --experimental-strip-types --no-warnings --test lib/design-excerpts.test.ts lib/truthful-sites.test.ts; echo "exit=$?"`, zöld.
  2. Az öt ellenőrzés: `ℹ tests 687`, `Found 0 clones.`, a lint 0 figyelmeztetéssel.
  3. A curl-ciklus mind a 23 nézetre.
  4. **Playwright az előnézeten** (`bringToFront`, `nav=full` süti, friss CSS a pitfall szerint; 360 és 1280 px):
     - `view=radar`: a `local-2026-W39-read` kártyáján `a[href="/library/-1"]` „Read here”/„Olvasd itt”;
     - egy másik kártya „Olvasd itt”-jére kattintva kinyílik a chat panel (`#taiyaki-panel`), és a szál végén megjelenik az új, függő bejegyzés a kártya URL-jével (memoryTransport);
     - a kártya olvasott lesz;
     - Esc után a fókusz a kártya gombján van (`document.activeElement.textContent`);
     - `&fail=1`-gyel a küldés „Nem ment át, próbáld újra.”-t mond;
     - `view=companies`: a kártyákon ott a gomb;
     - vízszintes görgetés sehol;
     - a konzolban új hiba és figyelmeztetés nincs;
     - a dev napló szerint egyetlen `GET /api/sources` vagy `POST /api/sources` sem ment ki: az előnézet a memóriás küldőt használja.
- [ ] **Step 10: Commit**

```bash
git commit -m "docs: document read here and the library mirror" -- .env.example README.md CLAUDE.md ARCHITECTURE.md SECURITY.md TESTING.md DESIGN.md TODO.md
```

### A záró review

Egy erős (opus) reviewer a teljes branchen. A kiemelt kockázatai:

1. **A lefoglalás:** a lease, az összehasonlító frissítés és a feloldás minden úton: siker, hiba, a posts-lookup dobása, egy újrakinyerés, egy „Újra”.
2. **A cron-jogosultság:** mindkét route, és az, hogy a `CRON_SECRET` üres értékkel se nyisson.
3. **A normalizálás:** a `queueMirrors`, a `readHerePosts` és a beküldés ugyanazt a sztringet adja-e.
4. **A 409-es indítás:** csak `pending`, poszt nélküli forrásnál, az admin klienssel.
5. **A chat bekötése:** a sorrend (nyitás, aztán küldés), a fókusz visszaadása, a mező szövegének megőrzése.
6. **Az előnézet** elszigetelése.
7. **A dokumentáció** pontossága.

Utána egy javító kör és egy szűkített újraellenőrzés.
