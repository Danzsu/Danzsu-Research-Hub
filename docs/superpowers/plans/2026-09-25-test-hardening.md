# Teszt-keményítés és CI — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tesztcsomag megfogja a 2026-09-25-i audit túlélő mutánsait. A route handlerek, a `safeFetch` minden hívóhelye, a `fakeDb` szűrői és a blokk-id-k tesztet kapnak, a törékeny osztálynév-tesztek eltűnnek, a `Progress` átadja az értékét a Radixnak, és minden push és PR a GitHub Actions CI-ban futtatja az öt ellenőrzést.

**Architecture:**
- **A `fakeDb` hűsége az első lépés.** Az `.eq` / `.neq` / `.lt` szűrők értéke számít, a `single()` PostgREST-alakú hibát ad (`PGRST116`), és `pgError()` építi a többit. Erre épülnek a tulajdonos-ellenőrzés és a route-ok tesztjei.
- **Route-teszt réteg függőség nélkül.**
  - A `lib/test/tsx-hooks.ts` csere-térképe három bejegyzéssel bővül: `@/lib/supabase/server` és `next/server` → `lib/test/route-hooks.ts`, `server-only` → üres modul.
  - A `route-hooks.ts` egyetlen kis fájl: regisztrálja a hookot, és ő maga a két modul helyettese (`getReader`, `getViewer`, `createAdminClient`, a sorba álló `after()`, a valódi `NextResponse`).
  - A route-teszt előbb ezt importálja, aztán `await import("./route.ts")`-szal a route-ot, ahogy a komponens-tesztek a `render.ts`-t.
- **Új tesztek a hívóhelyeken, nem a segédekben.** Az SSRF-, határ-, pipeline- és id-tesztek egy-egy audit-próbát ölnek meg. Ahol az auditban nem volt próba, új, N-jelű próba készül.
- **Átírások és egy hibajavítás.** A „rewrite or delete” lista tesztjei viselkedésre állnak át. A `components/ui/progress.tsx` továbbadja a `value`-t a Root-nak.
- **CI.** Egy workflow, egy job, az öt ellenőrzés. Az actionök teljes SHA-ra rögzítve, a Dependabot csak az actionöket frissíti, 7 napos cooldownnal.

**Tech Stack:** Node 24.16.0 (`node:test`, `module.register`, type stripping), Next.js 16.3.4 (`next/server.js`), React 19.2.6, linkedom 0.18.13, sharp 0.35.4, zod 3.25.76 (`zod/v4`), radix-ui 1.6.7 (`@radix-ui/react-progress` 1.1.16), pnpm 11.25.0 (corepack), GitHub Actions (`actions/checkout` v7.0.1, `actions/setup-node` v7.0.0), Dependabot.

**Spec:**
- `.superpowers/sdd/test-audit.md`: az audit. Ennek a 2. fejezet próbatáblája a bizonyíték, amit minden új tesztnek meg kell ölnie. A 3. fejezet a hiánytérkép, a 4. a megközelítés kritikája és a route-réteg prototípusa, az 5. az ajánlások: a top-15 teszt, a „rewrite or delete” lista, és a sorrend.
- `.superpowers/sdd/e2e-ui-run.md`: a kézi UI-kör, háttérnek.
- A tulajdonos 2026-09-25-i döntései. Kötelezők, szó szerint lent, a „Döntések” szakaszban.
- A koordinátor hibajelentése a `Progress`-ről (ugyanott).

**Előfeltétel és sorrend:**
- A UX-A bekerült a `main`-be (fast-forward, `main` = `ac8c36d`). Új ág: `git switch -c test-hardening main`. Ez a terv a taiyaki link-chat és az M2 előtt fut.
- A terv minden kódját és elvárt kimenetét egy `git archive HEAD` másolaton ellenőriztem. A kiindulás az audit commitja volt (`45dcb3c`), amire rámásoltam a `main` öt azóta változott fájlját. Ezen a másolaton ellenőriztem:
  - a végállapot 474 tesztjét;
  - a `tsc`, a `lint`, a `build` és a `dup` zöld futását;
  - az audit 81 próbáját és a 13 új próbát (az eredmény a 10. feladatban).
- **Minden fájlt olvass újra szerkesztés előtt.** Ha a terv „előtte” részlete eltér a fájltól, a fájl az irányadó, és csak ennek a tervnek a változtatását vidd át.

## Egyeztetés az audittal és a kóddal

1. **Az audit `45dcb3c`-n készült, a `main` most `ac8c36d`.** Közben öt fájl változott:
   - `app/components/shell.test.ts` (új, 9 statikus smoke render);
   - `lib/test/next-stub.ts` (`usePathname`);
   - `page-header.tsx`, `submit-form.tsx`, `app/dev/preview/post/page.tsx` (hibajavítások).

   A próbák egyik fájlja sem változott. A kiinduló tesztszám így **452** (443 + 9). A smoke rendereket ez a terv nem tervezi újra, csak a `ReaderPanel` tesztjét és egy új `Progress`-tesztet ír a fájlba (9. feladat).
2. **A `fakeDb` szűrői.** Az audit által ellenőrzött javítás („a sor csak akkor jön vissza, ha a fixture-ben nincs meg az oszlop, vagy `row[col] === v`”) itt minden szűrőre érvényes: a `sources` lookup, a pending lista `eq` / `neq` / `lt` szűrője és a `posts` select is ez alapján dönt.
   - Ezzel 443-ból 442 teszt zöld maradt. Az egy bukó teszt, a `retryPendingSources(): with plenty of time left, every pending source is processed`, csak azért ment át, mert a lookup nem nézte az id-t: egyetlen `source` fixture (id 1) állt a 2-es és a 3-as forrás helyén is. A fixture három sorra bővül (1. feladat).
   - A `tsc` a `rpcError` új típusa miatt két `{ code: … }` fixture-t jelez a `post-edit.test.ts`-ben. Ezek `pgError(...)`-ra cserélődnek.
3. **E3 és E7.** Az E3-at a meglévő `requestReextract: a successful claim …` teszt megöli, amint a szűrő számít, mert a fixture-ben `id: 1`, `source_id: 5`. Az E7-hez olyan fixture kell, amelyben az `id` és a `source_id` eltér. Az új teszt ilyet ad (`id: 7`, `source_id: 3`).
4. **A route-réteg** (az audit 4. fejezetének prototípusa alapján, ellenőrizve):
   - A Node ESM magától nem oldja fel a `next/server`-t: `ERR_MODULE_NOT_FOUND`, mert a `next` csomagnak nincs `exports` térképe. A `next/server.js` működik.
   - A valódi `after()` kérésen kívül dob („`after` was called outside a request scope”), ezért a helyettes sorba állítja a feladatot.
   - A csere-térkép a meglévő `tsx-hooks.ts`-be kerül, nem egy második hook-fájlba. Egy külön hook vagy megismételné az `@/`-feloldást, vagy egy második `register`-lánc kellene hozzá. A helyettes exportoknak amúgy is a fő szálon futó modulban kell lenniük.
   - A `lib/content.ts`-t mostantól betölti egy teszt (a state route-é). A `server-only` üres modul, a `lib/supabase/server.ts` továbbra sem töltődik be. A CLAUDE.md és a README „never loaded by tests” mondata ezért változik (10. feladat).
5. **A `components/` alatti teszt nem futna.** Az `npm test` globja csak a `lib/**` és az `app/**` alatt keres, ezért a `Progress` tesztje az `app/components/shell.test.ts`-be kerül.
6. **A build nem kér env-et.** Ellenőrizve egy tiszta `git archive` másolaton, `.env` fájl és Supabase- vagy modellkulcs nélkül: a `next build` lefut, és csak a `/manifest.webmanifest` statikus. A CI-nak ezért nem kell helyőrző sem, titok végképp nem. Csak a `NEXT_TELEMETRY_DISABLED=1` kerül bele.
7. **A „lógó válasz” teszt.**
   - A `FETCH_TIMEOUT_MS` 10 s, így egy valódi várakozás minden futáshoz 10 s-ot adna, pedig ma a teljes `npm test` kb. 3 s. A `node:test` óra-mockja nem éri el az `AbortSignal.timeout`-ot.
   - A megoldás: a teszt az `AbortSignal.timeout`-ot órának stubolja (`t.mock.method`, magától visszaáll). A kért ms-t feljegyzi, és 1 ms-os jelet ad vissza.
   - A lógás maga valódi: a válasz csak az abort jelre ér véget. Ha a jel nem jutna el a fetch-ig, a teszt a saját 5 s-os timeoutján bukna el.
   - Az audit panasza a régi spy-tesztre az volt, hogy G1 csak mellékesen bukott rajta. Ezt a G1b-teszt oldja meg (a privát címre soha nem megy kérés).
8. **linkedom és `assert`.** Egy linkedom-csomópont az `assert.equal(node, null)`-ban hibánál ~25 s-ig fut, aztán `RangeError: Array buffer allocation failed`-del áll le, mert a Node az egész dokumentumot próbálja kiírni. A V1 és az R1 próbánál futott bele ebbe a prototípus.
   - Az új tesztek ezért primitívet hasonlítanak (attribútum, `textContent`, darabszám).
   - A négy meglévő ilyen sor (`post-blocks.test.ts` 51., 57. és 94. sora, `post-editor.test.ts` 71. sora) darabszámra áll át (9. feladat).
9. **A `post-article.test.ts` törlése és az M2.** Az M2 terv 7. és 10. feladata ezt a fájlt bővíti. A törlés után ott a fájl újra létrejön a fejlécével (az importok és a `renderArticle` segéd). Ez a TODO.md M2-sorába kerül (2. feladat).
10. **A `Task` ↔ `model_settings_task_check` teszt** (az audit „next after these” listájának utolsó tétele) már az M2 terv 1. feladatában van (`TASKS`), ezért ez a terv csak a TODO-ban hivatkozik rá.

## Döntések

**A tulajdonos döntései (2026-09-25), kötelezők:**

1. **A GitHub Actions CI jóvá van hagyva.**
   - Minden pushon és PR-en lefut az öt ellenőrzés: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run dup`.
   - Az actionök teljes commit-SHA-ra rögzítve, a tag kommentben.
   - Telepítés: `corepack pnpm@11.25.0 install --frozen-lockfile`, Node 24-en.
   - `.github/dependabot.yml` csak a `github-actions`-re, `cooldown: { default-days: 7 }`-vel.
   - Legkisebb jogosultság a `permissions:` alatt.
   - A `main` branch-védelme a tulajdonos kézi lépése, a TODO.md-be kerül.
2. **A Playwright e2e és a DB-tesztek a CI-ban NINCSENEK jóváhagyva.** Opcióként, a költségükkel együtt kerülnek a TODO.md-be, ez a terv nem tervezi meg őket.
3. **A keményítés maga, új függőség nélkül:**
   - a `fakeDb` hűsége (`.eq`, `neq`, `lt` értéke számít, PostgREST-alakú hibák);
   - a route-teszt réteg (loader hook a prototípus szerint);
   - route-tesztek: cron, `/media`, sources, state és a `posts/[id]` route-ok;
   - az audit top-15 tesztje;
   - a „rewrite or delete” lista;
   - az `assignIds` id-jeinek rögzítése.

**A koordinátor hibajelentése (kötelező, a UI-feladatba):** a `components/ui/progress.tsx:9-26` kiveszi a `value`-t a propokból, és nem adja tovább a `<ProgressPrimitive.Root>`-nak. A Radix `Progress`-e ilyenkor `null`-t vesz értéknek (`value: valueProp = null`, ellenőrizve a `@radix-ui/react-progress` 1.1.16 forrásában). Így minden sáv, az élő `ReaderPanel` heti sávja is, `data-state="indeterminate"`, és nincs `aria-valuenow`.
- A javítás: a `value` továbbadása. A `max`-ot a kód nem veszi ki, az a `...props`-szal már most is átmegy.
- A teszt: `aria-valuenow`, valamint `data-state="loading"` / `"complete"`.
- Mutációs próba: a továbbadás nélkül a teszt bukik.

**A terv döntései:**
- Ruling: a CI Node-ja pontosan `24.16.0` (2026-05-21, a nodejs.org `dist/index.json` szerint), nem a legújabb 24.21.0. A CLAUDE.md szerint a render harness csak a 24.16-on ellenőrzött. A 24.16 corepacket is hoz (0.35.0), ez kell a `corepack pnpm@11.25.0`-hoz. A verzió a `node-version` egyetlen sora, szándékosan emeljük.
- Ruling: `runs-on: ubuntu-24.04`, nem `ubuntu-latest`, mert a supply-chain szabály mozgó címkét nem enged.
- Ruling: nincs CI-cache. A `setup-node` pnpm-cache-e a PATH-on lévő `pnpm`-et keresné, a corepack-es hívás mellett ez nincs ott. Egy `actions/cache` egy újabb rögzítendő action lenne. A telepítés a lockfile-ból kb. fél perc.
- Ruling: `on: push` és `pull_request`, ahogy a döntés kéri. Egy PR-ág pusha így kétszer fut. Ha zavar, egy `concurrency` blokk egy sor.
- Ruling: `persist-credentials: false` a checkouton, mert a jobnak nem kell a token a `.git/config`-ban.
- Ruling: a `fakeDb` „hiányzó oszlop átmegy” szabálya marad. Így nem kell minden ritka fixture-t átírni. Az ára: egy rossz oszlopon olvasó kódot csak olyan fixture fog meg, amelyben mindkét oszlop megvan, és eltér (Review Focus 2.).
- Ruling: a `post-blocks.test.ts` négy osztálynév-tesztje egyetlen elrendezés-tesztté olvad: a 75ch-s prózaszélesség és a képaláírás a keretben. A keret, az árnyék és a mono betű a böngészős kör dolga.
- Ruling: az új próbák N1–N13 jelet kapnak, és a 10. feladat újrafuttatásában az audit 81 próbája mellett futnak.

## A kiválasztott GitHub Actions

A tageket és a SHA-kat hitelesítés nélkül kérdeztem le, 2026-09-25-én:

```bash
git ls-remote https://github.com/actions/checkout "refs/tags/v7*"
curl -s "https://api.github.com/repos/actions/checkout/releases?per_page=8"
curl -s "https://api.github.com/repos/actions/checkout/commits/3d3c42e5aac5ba805825da76410c181273ba90b1"
git ls-remote https://github.com/actions/setup-node "refs/tags/v7*"
curl -s "https://api.github.com/repos/actions/setup-node/releases?per_page=8"
curl -s "https://api.github.com/repos/actions/setup-node/commits/820762786026740c76f36085b0efc47a31fe5020"
```

| Action | Tag | Commit SHA | Kiadás (release) | Commit dátuma | Kor 2026-09-25-én | Futtató |
| --- | --- | --- | --- | --- | --- | --- |
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-20 | 2026-07-17 | 67 nap | `node24` |
| `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` | 2026-07-14 | 2026-07-14 | 73 nap | `node24` |

Mindkét tag „könnyű” tag: a `git ls-remote` kimenetében nincs `^{}` sor, a tag SHA-ja maga a commit, és a `/commits/<sha>` API ugyanazt adja vissza. Mindkettő a legfrissebb kiadás a saját fő ágán, és mindkettő jóval 7 napnál idősebb.

## Global Constraints

- **Ág:** `git switch -c test-hardening main`. A push a tulajdonosé.
- **Node és tesztek:**
  - Node `>=22.13.0`, a CI-ban pontosan `24.16.0`.
  - Futtatás: `node --experimental-strip-types --no-warnings --test`.
  - Egy `[id]`-t tartalmazó út `[[]id]`-ként írandó, a `[...path]` `[[]...path]`-ként, különben 0 tesztet futtat, és 0-val lép ki. A `(app)` zárójele szó szerint értendő. Az `ℹ tests` sor soha nem lehet 0.
- **A tesztek viselkedést rögzítenek, nem osztálynevet.** Kivétel a meghagyott `min-h-10` / `opacity-40` (a 40 px-es célterület és a kontraszt követelmény) és a `max-w-[75ch]` (egyetlen elrendezés-teszt).
- **linkedom-csomópontot soha ne adj az `assert`-nek.** Hibánál a Node az egész dokumentumot kiírná (~25 s, `RangeError: Array buffer allocation failed`). Attribútumot, `textContent`-et vagy darabszámot hasonlíts.
- **Új függőség nincs.**
  - A `package.json` és a `pnpm-lock.yaml` nem változik.
  - A `pnpm-workspace.yaml` érintetlen: `minimumReleaseAge: 10080`, `minimumReleaseAgeIgnoreMissingTime: false`, `strictDepBuilds: true`, `allowBuilds` (`sharp`, `unrs-resolver`).
- **GitHub Actions:**
  - teljes commit-SHA, utána `# <tag>` komment, és csak legalább 7 napos kiadás;
  - `runs-on: ubuntu-24.04`, `node-version: 24.16.0`;
  - `.github/dependabot.yml`: csak `package-ecosystem: github-actions`, `cooldown: { default-days: 7 }`.
- **Legkisebb jogosultság:** `permissions: contents: read`, `persist-credentials: false`. A workflowban nincs `secrets.*`, és nincs benne Supabase- vagy modellkulcs.
- **Titok nélküli build:** a `next build` env nélkül lefut. Ha egyszer mégis kellene érték, csak nem titkos helyőrző kerülhet a build lépés `env:`-jébe, valódi titok soha.
- **Nincs helyi futtatókörnyezet:** a CI a GitHub felhőjében fut. Semmi nem ütemeződik a felhasználó gépén.
- **Duplikáció:** minden feladat végén `npm run dup` → `Found 0 clones.` Segédfüggvény előtt `grep -rn`.
- **`lib/` importok:** relatív `.ts` import, a `lib/test/route-hooks.ts`-ben is. `@/` csak a három Next-only szerver-modulban (`lib/content.ts`, `lib/language.ts`, `lib/supabase/server.ts`).
- **Védett tesztek:** biztonsági vagy adatintegritási tesztet gyengíteni tilos. Ilyenek:
  - `safeHref`, `safeNext`, `isPrivateAddress`, `parseSubmittedUrl`;
  - a literál id-k (`daily.test.ts`, `blocks.test.ts`);
  - a CAS-szűrők (`post-edit.test.ts`, `translate.test.ts`);
  - a fordítás 21 elutasító esete: a 8. feladatban táblázatba költözik, ugyanazzal a névvel és ugyanazzal az adattal;
  - `failureUpdate` és a tulajdonos-ellenőrzés.

  Fixture-t csak akkor szabad átírni, ha a teszt a szűrők figyelmen kívül hagyása miatt ment át, és a feladat ezt kimondja.
- **Mutációs próba:** mindig ideiglenes. Alkalmazd, futtasd a megnevezett tesztfájlt, lásd a FAIL-t, állítsd vissza. Utána a `git diff --stat` csak a feladat saját változását mutatja.
- **Tilos:**
  - `npx shadcn add`. A `components/ui/progress.tsx` kézzel írt fájl (CLAUDE.md, Hand-authored components), kézzel szerkeszthető.
  - `supabase db push`.
- **Commitok:** Conventional Commits, kisbetűs, felszólító módú angol tárgy, attribúciós sor nélkül, explicit pathspec-kel (`git add <fájlok>`, aztán `git commit -m`).

## Review Focus

1. **Egy csak 401-et váró route-teszt akkor is zöld, ha a helyettes nincs bekötve.** Ez akkor fordul elő, ha a route egy másik modulpéldányt olvas: más úton importált stub, vagy a valódi modul. Elvárt: minden route-tesztfájlnak van bejelentkezett, a handlerig jutó esete. Tesztjei:
   - 3. feladat: `/media serves an image privately…` (200), `a failed digest still retries the pending sources…` (500 + `retriedSources: 1`);
   - 4. feladat: `POST /api/sources stores the link as the reader, answers 202…`, `POST /api/state writes set_read to is_read…`, `PATCH /api/posts/[id] answers 403 when the database refuses the edit…`, `POST /translate runs the translation with the admin client…`, `POST /reextract answers 202 to the submitter…`.
2. **Ritka fixture takarja el a rossz oszlopon olvasó kódot.** A fixture-ből hiányzó oszlop minden szűrőn átmegy. Elvárt: a tulajdonos- és lookup-tesztek fixture-jében az `id` és a `source_id` is megvan, és eltér. Tesztjei:
   - 1. feladat: `savePostEdits and requestReextract read the post by its id, never by its source_id`;
   - 4. feladat: a reextract route-teszt fixture-je (`id: 7`, `source_id: 3`) és a `…schedules a run of the post's own source` eset.
3. **Egy mutáns csak lassan, összeomlással hal meg**, mert egy linkedom-csomópont került az `assert`-be (Egyeztetés 8.). Elvárt: minden bukás gyors és olvasható. Tesztjei (9. feladat):
   - az R1-teszt a `style` szövegét hasonlítja;
   - a négy csomópont-vs-`null` sor darabszámra áll át;
   - a mutációs lépés mérése: az R1 és a V1 próba ezredmásodpercek alatt bukik, nem 25 s alatt.
4. **A Linux CI más, mint a Windows.** Kis- és nagybetű-érzékeny utak, más glob, más shell. Egy itt zöld import vagy tesztút ott elbukhat. Elvárt: a `test-hardening` ág első GitHub Actions futása zöld. Tesztje: 10. feladat, 7. lépés (a tulajdonos pusha után `gh run list --branch test-hardening`).
5. **Időfüggő állítás egy lassú CI-futón.** Elvárt: egy lassú futó sem teszi pirossá a tesztet. Tesztjei:
   - 4. feladat: a reextract 429-es esete `retryAfter`-t a (295, 300] tartományban várja, nem pontos értéket;
   - 6. feladat: a lógó letöltés tesztje saját, 5 s-os `timeout`-ot kap;
   - 7. feladat: a W1-teszt rögzített `now`-val hívja a `runDaily`-t.

---

## Fájlszerkezet

| Fájl | Felelősség | Feladat |
| --- | --- | --- |
| `lib/pipeline/fake-db.ts` | a szűrők számítanak (`passes`, `sourcesQuery`), `pgError`, `PostgrestErrorShape`, `sources` sorok; később `download`, `insert` | 1, 3, 4 |
| `lib/post-edit.test.ts` | E3/E7: olvasás id szerint; a két `rpcError` fixture `pgError`-ra | 1 |
| `lib/pipeline/ingest.test.ts` | I8/I9-teszt, a három sorra bővített retry-fixture; I7 (a (j) teszt 119 s-mal); a modell-fake-ek sémakulcs szerint | 1, 7 |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI és Dependabot | 2 |
| `lib/test/tsx-hooks.ts` | a `STUBS` térkép (a régi `STUBBED` halmaz helyett) | 3 |
| `lib/test/route-hooks.ts` (új) | a route-tesztek belépője és a két modul helyettese | 3 |
| `app/api/cron/daily/route.test.ts`, `app/media/[...path]/route.test.ts` (új) | X1, N1; X2, M1, N2 | 3 |
| `app/api/sources/route.test.ts`, `app/api/state/route.test.ts`, `app/api/posts/[id]/route.test.ts`, `app/api/posts/[id]/translate/route.test.ts`, `app/api/posts/[id]/reextract/route.test.ts` (új) | X5, N3, N4; X3; N8; N9; N5, N6, N7 | 4 |
| `lib/pipeline/mock-fetch.ts` | `mockDns(t, ...addresses)`; `geminiSchemaKeys` | 5, 7 |
| `lib/pipeline/fetch.test.ts`, `lib/pipeline/util.test.ts` | F1, F2, N10; U4–U7; a loopback/metadata teszt összevonása | 5 |
| `lib/pipeline/images.test.ts`, `lib/pipeline/extract/index.test.ts` | G1 (lógó válasz), G1b, G2, G3, N13; H1–H3 | 6 |
| `lib/pipeline/daily.test.ts`, `lib/pipeline/extract/index.test.ts` | W1; a duplikált YouTube-teszt törlése | 7 |
| `lib/blocks.test.ts`, `lib/media.test.ts` (új), `lib/translate.test.ts`, `lib/overrides.test.ts` | B2; M1; az elutasító esetek táblázata; a duplikált teszt törlése | 8 |
| `components/ui/progress.tsx`, `app/components/shell.test.ts` | a `value` továbbadása; N11 | 9 |
| `app/components/post-blocks.test.ts`, `app/(app)/library/[id]/post-editor.test.ts`, `app/(app)/library/[id]/post-article.test.ts` (törlés), `lib/nav.test.ts`, `lib/reader-store.test.ts` | R1 és az elrendezés-teszt; a csomópont-assertek; N12; S1/S2 | 9 |
| `CLAUDE.md`, `README.md`, `TODO.md` | a CI említése és a TODO-tételek; a réteg és a fake-ek leírása | 2, 10 |

**Nem része ennek a tervnek:**
- Playwright e2e és DB-tesztek (nincsenek jóváhagyva, TODO);
- a `proxy.ts` tesztje (X4) és a `/auth` előtag (P2);
- az auth route-ok `safeNext`-bekötése;
- az I2, I5 és U10 próba (az audit „next after these” listája, TODO);
- a `shell.test.ts` smoke renderei (a UX-A-ban kész).

## Új próbák (N1–N13)

Az audit táblája nem fed le minden route-bekötést. Ahol egy új teszt nem audit-próbát öl meg, ott ez a táblázat adja a próbát. A 10. feladat pontos `find` / `replace` szöveggel futtatja őket.

| ID | Fájl | Mutáció | Mi romlana el | Megölő teszt (feladat) |
| --- | --- | --- | --- | --- |
| N1 | `app/api/cron/daily/route.ts` | a `runDaily(db).catch(…)` helyett `runDaily(db)` | egy elbukott digest a függő beküldéseket is megállítja | `a failed digest still retries the pending sources…` (3) |
| N2 | `app/media/[...path]/route.ts` | `private` → `public` a `cache-control`-ban | megosztott cache tartja meg egy tag képét | `/media serves an image privately…` (3) |
| N3 | `app/api/sources/route.ts` | a `23505` → 409 ág törlése | ugyanaz a link 500-at ad | `…answers 409 already_submitted…` (4) |
| N4 | `app/api/sources/route.ts` | az `after(() => processSource(…))` törlése | 202, de a link soha nem dolgozódik fel | `…answers 202 with its id, and schedules its processing` (4) |
| N5 | `app/api/posts/[id]/reextract/route.ts` | `reader.viewer.id` → `reader.viewer.email` | a tulajdonos-ellenőrzés rossz mezőt kap | `POST /reextract answers 202 to the submitter…` (4) |
| N6 | ugyanaz | `processSource(admin, result.sourceId)` → `processSource(admin, postId)` | egy másik forrás kinyerése indul el | ugyanaz (4) |
| N7 | ugyanaz | a `{ retryAfter }` elhagyása | a kliens nem tudja, mennyit várjon | `POST /reextract inside the cooldown answers 429…` (4) |
| N8 | `app/api/posts/[id]/route.ts` | `forbidden: POST_ERRORS.not_found` a `SAVE_STATUS`-ban | a „nem a tiéd” 404-nek látszik | `PATCH /api/posts/[id] answers 403…` (4) |
| N9 | `app/api/posts/[id]/translate/route.ts` | a létezés-ellenőrzés `reader.db` helyett `createAdminClient()`-tel | az RLS kimarad, a titkos kulcs dönt | `POST /translate answers 404 for a post the reader can't see…` (4) |
| N10 | `lib/pipeline/fetch.ts` | az első ugrás `new URL(current)`, csak a redirectek mennek a `checkedHop`-on | a beküldött URL maga ellenőrizetlen | `safeFetch refuses a first hop that is private…` (5) |
| N11 | `components/ui/progress.tsx` | a `value={value}` sor törlése | minden sáv indeterminate, nincs `aria-valuenow` | `Progress reports its value…` (9) |
| N12 | `lib/nav.ts` | a `stats` tétel `href: "/stats"`-t kap | egy „hamarosan” tétel nem létező oldalra visz | `every nav item has a unique id and href…` (9) |
| N13 | `lib/pipeline/images.ts` | a `timeoutMs: FETCH_TIMEOUT_MS` elhagyása | egy képletöltés 20 s-ig lóghat | `mirrorImages aborts a download that hangs…` (6) |

---

### Task 1: A `fakeDb` szűrői és PostgREST-alakú hibái

**Files:**
- Modify: `lib/pipeline/fake-db.ts` (a `FakeIngestTables` típus, a `PendingChain` / `pendingChain` helyére `passes` és `sourcesQuery`, a `sources` és a `posts` select, a fejléc-komment)
- Modify: `lib/post-edit.test.ts` (új teszt; a két `rpcError` fixture)
- Modify: `lib/pipeline/ingest.test.ts` (új teszt; a `with plenty of time left` teszt fixture-je)

**Interfaces:**
- Consumes: —
- Produces:
  - `export type PostgrestErrorShape = { code: string; message: string; details: string | null; hint: string | null }`
  - `export const pgError = (code: string, message: string, details: string | null = null): PostgrestErrorShape`
  - `FakeIngestTables.sources?: Record<string, unknown>[]`: a `sources` lookup sorai, a `source` helyett, ha egy teszt több forrást dolgoz fel.
  - `FakeIngestTables.rpcError?: PostgrestErrorShape`.
  - A szabály: a `sources` `select().eq/neq/lt(...).single()` és `.order().limit(n)`, valamint a `posts` `select().eq(col, v).maybeSingle()` a szűrőt a fixture-soron értékeli ki. Egy oszlop, ami a fixture-ben nincs meg, minden szűrőn átmegy. A `single()` `PGRST116`-ot ad, ha nem pontosan egy sor illeszkedik.

- [ ] **Step 1: A két új teszt**

`lib/post-edit.test.ts`, a `test("requestReextract: a non-submitter is forbidden", …)` elé:

```ts
// E3, E7: both read the post by its own id. Only a fixture whose id and source_id differ can tell:
// with the two equal, a read keyed on the wrong column finds the same row.
test("savePostEdits and requestReextract read the post by its id, never by its source_id", async () => {
  const blocks = assignIds([p("a")]);
  const post = { id: 7, source_id: 3, blocks, extracted_at: null, sources: { submitted_by: "owner" } };
  const saved = fakeDb(undefined, { post });
  assert.equal(await savePostEdits(saved, 7, { hidden: [blocks[0].id] }), "ok");
  assert.deepEqual(saved.rpcCalls[0].args.p_hidden, [blocks[0].id]);
  assert.equal(await savePostEdits(fakeDb(undefined, { post }), 3, { hidden: [] }), "not_found");
  assert.deepEqual(await requestReextract(fakeDb(undefined, { post }), "owner", 7, new Date()), { status: "accepted", sourceId: 3 });
  assert.deepEqual(await requestReextract(fakeDb(undefined, { post }), "owner", 3, new Date()), { status: "not_found" });
});
```

`lib/pipeline/ingest.test.ts`, a fájl végére:

```ts
// I8, I9: a finished source, or one that failed MAX_ATTEMPTS (3) times, is never retried: a poison
// link would otherwise cost a model run every day.
test("retryPendingSources() retries only unfinished sources under the 3-attempt cap", async (t) => {
  const fetched: string[] = [];
  mockFetch(t, async (url) => {
    fetched.push(url);
    return new Response("", { status: 404 });
  });
  const sources = [
    { ...newSource(1, "article", "done"), status: "done", attempts: 1 },
    { ...newSource(2, "article", "spent"), status: "failed", attempts: 3 },
    { ...newSource(3, "article", "new"), status: "pending", attempts: 0 },
    { ...newSource(4, "article", "again"), status: "failed", attempts: 2 },
  ];
  const db = fakeDb(undefined, { sources, post: null, pending: sources });
  assert.equal(await retryPendingSources(db), 2);
  assert.deepEqual(fetched, [`${TEST_HOST}/new`, `${TEST_HOST}/again`]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/post-edit.test.ts lib/pipeline/ingest.test.ts`
Elvárt: 2 FAIL.
- `savePostEdits and requestReextract read the post by its id…`: `'ok' !== 'not_found'` (a mai fake a `.eq` értékét nem nézi);
- `retryPendingSources() retries only unfinished sources…`: `Error: source not found` (a mai fake a `sources` kulcsot nem ismeri).

- [ ] **Step 3: A fake szűrői** (`lib/pipeline/fake-db.ts`)

A `FakeIngestTables` három mezője:

```ts
  /** The row `sources`' `select().eq().single()` resolves to; omit to make it "not found". */
  source?: Record<string, unknown>;
  /** The row `posts`' `select().eq().maybeSingle()` resolves to; omit/null for "no existing post". */
  post?: Record<string, unknown> | null;
```

helyett:

```ts
  /** The row `sources`' `select().eq(column, value).single()` finds when it matches; omit to make it "not found". */
  source?: Record<string, unknown>;
  /** Several rows for that lookup, instead of `source`, for a test that processes more than one source. */
  sources?: Record<string, unknown>[];
  /** The row `posts`' `select().eq(column, value).maybeSingle()` resolves to when it matches; omit/null for "no existing post". */
  post?: Record<string, unknown> | null;
```

A `pending` mező kommentje:

```ts
  /** Rows `retryPendingSources`' pending-sources listing resolves to. */
```

helyett:

```ts
  /** Rows `retryPendingSources`' pending-sources listing filters (`eq`/`neq`/`lt`), then limits. */
```

Az `rpcError` mező és a kommentje:

```ts
  /** Forces every `db.rpc(...)` call to resolve with this error instead of succeeding — e.g. `{
   *  code: "42501" }` for the `update_post_overrides` "not the submitter" case. */
  rpcError?: { code?: string; message?: string };
```

helyett:

```ts
  /** Forces every `db.rpc(...)` call to resolve with this error instead of succeeding — e.g.
   *  `pgError("42501", …)` for the `update_post_overrides` "not the submitter" case. */
  rpcError?: PostgrestErrorShape;
```

A teljes `type PendingChain = {…}` és `function pendingChain(…) {…}` helyére:

```ts
/** The error body PostgREST answers with; supabase-js resolves `error` to it. */
export type PostgrestErrorShape = { code: string; message: string; details: string | null; hint: string | null };

export const pgError = (code: string, message: string, details: string | null = null): PostgrestErrorShape => ({ code, message, details, hint: null });

type Filter = { column: string; op: "eq" | "neq" | "lt"; value: unknown };

/** Whether `row` passes `filter` as PostgREST compares it. A column the fixture never set passes every
 *  filter, so a sparse fixture (`{ id: 1 }`) still stands in for whichever row a test needs. */
function passes(row: Record<string, unknown>, { column, op, value }: Filter): boolean {
  if (!(column in row)) return true;
  if (op === "eq") return row[column] === value;
  if (op === "neq") return row[column] !== value;
  return (row[column] as number) < (value as number);
}

/** `sources`' select chain, filters applied: the pending listing (`limit`) over `listed`, the
 *  one-row lookup (`single`) over `lookedUp`, which answers PGRST116 unless exactly one row matches. */
function sourcesQuery(listed: Record<string, unknown>[], lookedUp: Record<string, unknown>[], onEq: (column: string, value: unknown) => void) {
  const filters: Filter[] = [];
  const matching = (rows: Record<string, unknown>[]) => rows.filter((row) => filters.every((filter) => passes(row, filter)));
  const filter = (op: Filter["op"]) => (column: string, value: unknown) => {
    if (op === "eq") onEq(column, value);
    filters.push({ column, op, value });
    return query;
  };
  const query = {
    eq: filter("eq"),
    neq: filter("neq"),
    lt: filter("lt"),
    order: () => query,
    limit: async (n: number) => ({ data: matching(listed).slice(0, n), error: null }),
    single: async () => {
      const rows = matching(lookedUp);
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: pgError("PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${rows.length} rows`) };
    },
  };
  return query;
}
```

A `from("sources")` ágában ez:

```ts
    if (table === "sources") {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push({ table: "sources", column, value });
            return {
              single: async () =>
                tables.source ? { data: tables.source, error: null } : { data: null, error: new Error("source not found") },
            };
          },
          ...pendingChain(tables.pending ?? []),
        }),
```

erre cserélődik (az `update:` ág változatlan marad alatta):

```ts
    if (table === "sources") {
      const lookedUp = tables.sources ?? (tables.source ? [tables.source] : []);
      return {
        select: () => sourcesQuery(tables.pending ?? [], lookedUp, (column, value) => eqCalls.push({ table: "sources", column, value })),
```

A `posts` select `maybeSingle`-je:

```ts
                const errored = tables.postErrorOnCall !== undefined ? callNumber === tables.postErrorOnCall : Boolean(tables.postError);
                return errored
                  ? { data: null, error: tables.postError ?? new Error("posts lookup failed") }
                  : { data: project(tables.post ?? null, columns), error: null };
```

helyett:

```ts
                const errored = tables.postErrorOnCall !== undefined ? callNumber === tables.postErrorOnCall : Boolean(tables.postError);
                if (errored) return { data: null, error: tables.postError ?? pgError("08006", "posts lookup failed") };
                const row = tables.post ?? null;
                return { data: row && passes(row, { column, op: "eq", value }) ? project(row, columns) : null, error: null };
```

A `fakeDb` doc-kommentjében a `` `sources`/`posts`/storage: fixed by `tables` (all optional — omit what a test never queries). `` mondat után új mondat: `` Select filters (`eq`, `neq`, `lt`) are applied to the fixture rows, and a column the fixture never set passes every filter; a `sources` `single()` that matches no row, or several, answers PostgREST's PGRST116 error. ``

- [ ] **Step 4: Futtatás; egy régi teszt fixture-jét javítani kell**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/post-edit.test.ts lib/pipeline/ingest.test.ts`
Elvárt: a két új teszt PASS, egy régi FAIL: `retryPendingSources(): with plenty of time left, every pending source is processed`, `PGRST116` hibával. Ez a teszt csak azért ment át, mert a lookup nem nézte az id-t: egyetlen `source` fixture (id 1) állt a 2-es és a 3-as helyén is. A fixture javítása (`lib/pipeline/ingest.test.ts`):

```ts
  const source = newSource(1);
  const db = fakeDb(undefined, { source, post: null, pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
```

helyett:

```ts
  const sources = [newSource(1), newSource(2), newSource(3)];
  const db = fakeDb(undefined, { sources, post: null, pending: sources });
```

Futtatás újra: `node --experimental-strip-types --no-warnings --test lib/post-edit.test.ts lib/pipeline/ingest.test.ts`
Elvárt: `ℹ tests 56`, `ℹ pass 56` (23 + 33).

- [ ] **Step 5: A `tsc` két fixture-t jelez** (`lib/post-edit.test.ts`)

Futtatás: `npx tsc --noEmit`
Elvárt: 2 hiba, `lib/post-edit.test.ts(69,…)` és `(75,…)`: `Type '{ code: string; }' is missing the following properties from type 'PostgrestErrorShape': message, details, hint`.

Az import: `import { fakeDb } from "./pipeline/fake-db.ts";` → `import { fakeDb, pgError } from "./pipeline/fake-db.ts";`. A két fixture:
- `rpcError: { code: "42501" }` → `rpcError: pgError("42501", "only the submitter can edit this post")`. Ez a szöveg az, amit az `update_post_overrides` dob (`20260924000000_post_blocks.sql:45`).
- `rpcError: { code: "23505" }` → `rpcError: pgError("23505", "duplicate key value violates unique constraint")`.

- [ ] **Step 6: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 454`, `Found 0 clones.`

- [ ] **Step 7: Mutációs próba**

Minden sorra: alkalmazd a cserét, futtasd a tesztfájlt, lásd a FAIL-t, aztán `git checkout -- <fájl>` (ezek a fájlok ebben a feladatban nem változnak).

| Próba | Fájl | Előtte → utána | Futtatás | Elvárt bukó teszt |
| --- | --- | --- | --- | --- |
| E3 | `lib/post-edit.ts` (`requestReextract`) | `.select("source_id, extracted_at, sources(submitted_by)")` utáni `.eq("id", postId)` → `.eq("source_id", postId)` | `… --test lib/post-edit.test.ts` | `savePostEdits and requestReextract read the post by its id…` és `requestReextract: a successful claim…` |
| E7 | `lib/post-edit.ts` (`savePostEdits`) | `.select("id, blocks").eq("id", postId)` → `.select("id, blocks").eq("source_id", postId)` | ugyanaz | `savePostEdits and requestReextract read the post by its id…` |
| I8 | `lib/pipeline/ingest.ts` | `.lt("attempts", MAX_ATTEMPTS)` → `.lt("attempts", 99)` | `… --test lib/pipeline/ingest.test.ts` | `retryPendingSources() retries only unfinished sources…` |
| I9 | `lib/pipeline/ingest.ts` | `.neq("status", "done")` → `.eq("status", "done")` | ugyanaz | ugyanaz (a régi fake-en ez csak `TypeError`-ral halt meg) |

A végén `git diff --stat` csak a három feladat-fájlt mutatja.

- [ ] **Step 8: Commit**

```bash
git add lib/pipeline/fake-db.ts lib/post-edit.test.ts lib/pipeline/ingest.test.ts
git commit -m "test: make fakedb honour filter values and answer postgrest-shaped errors"
```

---

### Task 2: GitHub Actions CI és Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Modify: `CLAUDE.md` (Commands, Conventions → Supply chain, Layout), `README.md` (Testing, Project tour, Conventions → Dependencies), `TODO.md` (új tételek)

**Interfaces:**
- Consumes: —
- Produces: a `checks` nevű CI-job (a branch-védelem ezt a nevet kéri).

- [ ] **Step 1: Az ellenőrző parancs, el kell buknia**

A YAML-t a pnpm tárban már meglévő `js-yaml` 4.3.2 olvassa (az ESLint függősége). Új függőség nem kell hozzá:

```bash
node -e '
const yaml = require(require("node:path").resolve("node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml"));
const fs = require("node:fs");
const ci = yaml.load(fs.readFileSync(".github/workflows/ci.yml", "utf8"));
const bot = yaml.load(fs.readFileSync(".github/dependabot.yml", "utf8"));
const steps = ci.jobs.checks.steps;
const pinned = steps.filter((s) => s.uses).every((s) => /@[0-9a-f]{40}$/.test(s.uses));
console.log(JSON.stringify({ permissions: ci.permissions, pinned, runs: steps.filter((s) => s.run).map((s) => s.run), cooldown: bot.updates[0].cooldown, ecosystem: bot.updates[0]["package-ecosystem"] }));
'
```

Elvárt: FAIL, `ENOENT: no such file or directory, open '.github/workflows/ci.yml'`. Ha a `node_modules/.pnpm/js-yaml@4.3.2` nincs meg, a tartalék: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/dependabot.yml')); print('ok')"`.

- [ ] **Step 2: A workflow** (`.github/workflows/ci.yml`, új fájl)

```yaml
# The five checks CLAUDE.md requires before a commit, on every push and pull request.
# Actions are pinned by full commit SHA (the tag is the comment); Dependabot proposes updates.
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  checks:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    env:
      NEXT_TELEMETRY_DISABLED: "1"
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24.16.0
      - run: corepack pnpm@11.25.0 install --frozen-lockfile
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run dup
```

- [ ] **Step 3: A Dependabot** (`.github/dependabot.yml`, új fájl)

```yaml
# Only the GitHub Actions in .github/workflows: npm dependencies have no update bot (CLAUDE.md, Supply chain).
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
```

A `default-days` a GitHub Actions ökoszisztémán támogatott (a Dependabot options reference `cooldown` táblázata szerint). A SemVer-bontás (`semver-*-days`) ott nem támogatott, ezért nincs is benne.

- [ ] **Step 4: Az ellenőrzés, át kell mennie**

Futtatás: az 1. lépés parancsa.
Elvárt, egy sorban:
`{"permissions":{"contents":"read"},"pinned":true,"runs":["corepack pnpm@11.25.0 install --frozen-lockfile","npx tsc --noEmit","npm run lint","npm test","npm run build","npm run dup"],"cooldown":{"default-days":7},"ecosystem":"github-actions"}`

- [ ] **Step 5: A CI parancsai helyben, sorban**

```bash
corepack pnpm@11.25.0 install --frozen-lockfile
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run dup
```

Elvárt: a telepítés nem módosítja a lockfile-t (`git diff --stat -- pnpm-lock.yaml` üres), `ℹ tests 454`, a build `✓ Compiled successfully`, `Found 0 clones.`

- [ ] **Step 6: Build titok nélkül, tiszta fán**

A helyi build a `.env.local`-t is olvassa, ezért az nem bizonyítja, hogy a CI-nak nem kell titok. Egy leválasztott worktree-ben, env nélkül:

```bash
git worktree add ../th-ci-check HEAD --detach
cd ../th-ci-check
corepack pnpm@11.25.0 install --frozen-lockfile --offline
env -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY -u SUPABASE_SECRET_KEY -u GEMINI_API_KEY -u GROQ_API_KEY -u CRON_SECRET NEXT_TELEMETRY_DISABLED=1 npx next build
cd -
git worktree remove --force ../th-ci-check
```

Elvárt: `✓ Compiled successfully`, és a route-lista végén csak a `○ /manifest.webmanifest` statikus. Ha az `--offline` hiányzó csomag miatt bukik, futtasd nélküle. Ha a build egy env-változót kér, az nem titok lehet, hanem csak helyőrző a build lépés `env:`-jében, és a terv ezt a pontot újra kéri a tulajdonostól (Global Constraints).

- [ ] **Step 7: Mutációs próba**

A `.github/workflows/ci.yml`-ben `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` → `actions/checkout@v7`. Futtasd az 1. lépés parancsát. Elvárt: `"pinned":false`. Állítsd vissza (a fájl még nincs commitolva: írd vissza a sort), és futtasd újra: `"pinned":true`.

- [ ] **Step 8: `CLAUDE.md`**

- **Commands**, a „Before a commit, all five checks pass: …” sor után új bekezdés:
  > CI (`.github/workflows/ci.yml`) runs the same five, in this order, on every push and pull request: Node 24.16.0 on `ubuntu-24.04`, `corepack pnpm@11.25.0 install --frozen-lockfile`, no cache. `next build` needs no environment variables, so the workflow holds no secrets and only `contents: read`.
- **Conventions → Supply chain**, az utolsó mondat, „No update bot is configured; one would need a 7-day cooldown (`cooldown: { default-days: 7 }` in `dependabot.yml`).”, helyett:
  > The CI workflow pins each action by its full commit SHA, with the tag as a comment. `.github/dependabot.yml` updates `github-actions` only, weekly, with `cooldown: { default-days: 7 }`. npm dependencies have no update bot; adding one needs the same 7-day cooldown.
- **Layout**, a `supabase/migrations/` sor elé:

  ```text
  .github/                 workflows/ci.yml (the five checks on every push and PR), dependabot.yml (github-actions, 7-day cooldown)
  ```

- [ ] **Step 9: `README.md`**

- **Testing**, az első bekezdés után:
  > **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the five pre-commit checks (`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run dup`) on every push and pull request, with no secrets. Branch protection on `main` is the owner's setting (see [TODO.md](TODO.md)).
- **Project tour**, a táblázat `docs/` sora elé:

  ```markdown
  | [`.github/`](.github/) | The CI workflow and Dependabot (GitHub Actions only, 7-day cooldown) |
  ```

- **Conventions → Dependencies**, a bekezdés végére:
  > The CI's actions are pinned by commit SHA, and Dependabot proposes their updates no sooner than 7 days after a release.

- [ ] **Step 10: `TODO.md`**

- Az „A. Beállítás” végére, az „### 5. Opcionális” után, új szakasz:

  ```markdown
  ### 6. GitHub
  - [ ] **Branch-védelem a `main`-en** (a CI első futása után). *Settings → Rules → Rulesets → New branch ruleset*, cél: a `main` (Default branch).
    - **Require status checks to pass**: `checks` (a CI egyetlen jobja; a lista az első futás után kínálja fel).
    - **Block force pushes** és **Restrict deletions**.
    - A `main`-re így csak olyan commit kerülhet, amelyen a CI már zöld. Előbb az ágat pushold, várd meg a zöld futást, utána jöhet a fast-forward `main` pusha.
  - [ ] **Dependabot-PR-ek:** hetente jöhet egy PR a két action frissítéséről, és csak legalább 7 napos kiadásról. Merge előtt a CI legyen zöld, és a kommentben szereplő tag legyen az új.
  ```

- A „### Technikai adósság” végére:

  ```markdown
  - [ ] **Playwright e2e a CI-ban** — opció, nincs jóváhagyva (2026-09-25).
    - Ára: új devDependency (`@playwright/test`, pontos és legalább 7 napos verzió, a lockfile-lal együtt), egy Chromium-letöltés a lockfile-on kívül (a csomag verziója rögzíti, CI-cache kell hozzá), `next dev` a CI-ban (a `/dev/preview` csak fejlesztői módban él), és a flaky tesztek kockázata.
    - Haszna: a billentyűparancsok, a visszavonás-csík szünete és 5 s-os véglegesítése, a dupla kattintásos törlés, a panel fókusza, a `&fail=1` visszaállás, a konzol- és hidratációs hibák, és a 360 / 768 / 1280 px-es vízszintes görgetés automatikus ellenőrzése (`.superpowers/sdd/test-audit.md`, 4. és 5. fejezet).
  - [ ] **DB-tesztek a CI-ban** — opció, nincs jóváhagyva (2026-09-25).
    - Ára: egy új CI-job egy digesttel rögzített `postgres` service-konténerrel; egy shim (`auth.uid()` a `request.jwt.claim.sub`-ból, `auth.users`, `storage.buckets`, az `anon` / `authenticated` / `service_role` szerepek); a migrációk és sima SQL-ellenőrzések `psql -v ON_ERROR_STOP=1`-gyel. npm-függőség nélkül is megoldható.
    - Alternatívák: `@electric-sql/pglite` devDependencyként (hogy a szerepei és az RLS-e elég-e, az ellenőrizetlen), vagy a Supabase CLI helyi stackje (Docker, nehezebb).
    - Haszna: az RLS, a grantok, az `update_post_overrides` 42501-e és a `refresh_must_read` „pontosan 3” szabálya az egyetlen valódi jogosultsági réteg, és ma egyiket sem teszteli semmi.
  - [ ] **Az audit következő tételei** (`.superpowers/sdd/test-audit.md`, 5. fejezet, „Next after these”):
    - az arxiv → article tartalék (I2);
    - a github-kinyerés AI-tisztítása (I5);
    - egy `arxiv.org/pdf/<id>.pdf` URL felismerése (U10).

    A `Task` ↔ `model_settings_task_check` teszt az M2 terv 1. feladatában van (`TASKS`), ide nem kell.
  - [ ] **A túlélő próbák maradéka és a még teszt nélküli bekötések:**
    - a `/auth` előtag a `lib/public-paths.ts`-ben (P2, egy tesztsor);
    - a `proxy.ts` (X4): ehhez a `@supabase/ssr` `createServerClient`-jének helyettese kell a route-rétegben;
    - az `app/auth/login` és az `app/auth/callback` tényleg a `safeNext`-en át irányít-e;
    - a `getReaderState` sor-leképezése (`lib/content.ts`).
  ```

- A „Kutatási dashboard” alatt, az `M2 olvasóeszközök` sor alá, alpontként (négy szóköz behúzással):

  ```markdown
      - A teszt-keményítés törölte a `post-article.test.ts`-t (osztálynév-tesztek voltak). Az M2 terv 7. és 10. feladata ezt a fájlt bővíti, ezért ott a fájl újra létrejön a fejlécével: a `testPost` és a `render` importja, és a `renderArticle` segéd.
  ```

- [ ] **Step 11: Teljes ellenőrzés és commit**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 454`, `Found 0 clones.`

```bash
git add .github/workflows/ci.yml .github/dependabot.yml CLAUDE.md README.md TODO.md
git commit -m "ci: run the five checks on every push and pull request"
```

---

### Task 3: A route-teszt réteg, a cron és a `/media`

**Files:**
- Create: `lib/test/route-hooks.ts`, `app/api/cron/daily/route.test.ts`, `app/media/[...path]/route.test.ts`
- Modify: `lib/test/tsx-hooks.ts` (a `STUBBED` halmaz és a `stub` konstans), `lib/pipeline/fake-db.ts` (storage `download`)

**Interfaces:**
- Consumes: `fakeDb`, `pgError` (1. feladat); `mockFetch`, `TEST_HOST`, `withEnv` (`lib/pipeline/mock-fetch.ts`)
- Produces (`lib/test/route-hooks.ts`):
  - `routeStub: { reader: { db: SupabaseClient; viewer: Viewer } | null; admin: SupabaseClient | null; adminCalls: number; scheduled: (() => unknown)[] }`
  - `resetRoute(): void`
  - `signedIn(db: SupabaseClient, id = "owner")`: egy `{ db, viewer: { id, email } }` olvasó, ahol az email `<id>@example.test`
  - a helyettes exportok: `getReader`, `getViewer`, `createClient`, `createAdminClient` (növeli az `adminCalls`-t, és dob, ha nincs `admin`), `after(task)` (sorba teszi a `scheduled`-ba), `safeNext`, `NextResponse`
  - fakeDb: `storage.from().download(path)` → `{ data: new Blob([path]), error: null }`, ha az objektum megvan; különben `{ data: null, error: { message: "Object not found" } }`

- [ ] **Step 1: A két route-teszt**

`app/api/cron/daily/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../lib/pipeline/fake-db.ts";
import { mockFetch, TEST_HOST, withEnv } from "../../../../lib/pipeline/mock-fetch.ts";
import { resetRoute, routeStub } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const cronRequest = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }) as Parameters<typeof GET>[0];

// X1: with CRON_SECRET unset, no header can be right, so the route never runs (model spend, DoS).
test("the cron answers 401 without a CRON_SECRET or with a wrong bearer, and never opens the admin client", async (t) => {
  resetRoute();
  for (const [secret, header] of [[undefined, undefined], [undefined, "Bearer undefined"], [undefined, "Bearer "], ["s3cret", "Bearer wrong"], ["s3cret", "s3cret"]]) {
    withEnv(t, "CRON_SECRET", secret);
    const response = await GET(cronRequest(header));
    assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }], `${secret} / ${header}`);
  }
  assert.equal(routeStub.adminCalls, 0);
});

// N1: a failed digest (model outage, bad key) must not also stall the pending link submissions.
test("a failed digest still retries the pending sources, and answers 500 with their count", async (t) => {
  resetRoute();
  withEnv(t, "CRON_SECRET", "s3cret");
  withEnv(t, "GEMINI_API_KEY", undefined); // daily_curate has no route left, so runDaily throws
  withEnv(t, "GROQ_API_KEY", undefined);
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  mockFetch(t, async () => new Response("", { status: 404 })); // every feed, and the pending source's page
  const source = { id: 4, url: `${TEST_HOST}/gone`, kind: "article", note: null, attempts: 0 };
  routeStub.admin = fakeDb(undefined, { source, post: null, pending: [source] });

  const response = await GET(cronRequest("Bearer s3cret"));

  assert.deepEqual([response.status, await response.json()], [500, { error: "daily_failed", retriedSources: 1 }]);
});
```

`app/media/[...path]/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

const KEY = "1/0123456789abcdef-640.avif";
const get = (key: string) => GET(new Request(`http://localhost/media/${key}`), { params: Promise.resolve({ path: key.split("/") }) });

function signedInWithMedia() {
  resetRoute();
  routeStub.reader = signedIn(fakeDb());
  routeStub.admin = fakeDb(undefined, { media: ["0123456789abcdef-640.avif"] });
}

// X2 (/media downloads any key) and M1 (isMediaKey loses its ^ anchor): the bucket is private, and
// only content-addressed image keys are served, however the key is dressed up.
test("/media answers 404 for anything but an image key, without opening the bucket", async () => {
  signedInWithMedia();
  for (const key of ["../secret.txt", `x${KEY}`, `evil/${KEY}`, "1/0123456789abcdef-640.svg", "1/0123456789abcdef.avif"]) {
    const response = await get(key);
    assert.equal(response.status, 404, key);
  }
  assert.equal(routeStub.adminCalls, 0);
});

test("/media answers 401 to a signed-out request, without opening the bucket", async () => {
  resetRoute();
  const response = await get(KEY);
  assert.equal(response.status, 401);
  assert.equal(routeStub.adminCalls, 0);
});

// N2: a mirrored image is a member's copy of someone else's page; a shared cache must never keep it.
test("/media serves an image privately, never sniffed, with no active content", async (t) => {
  t.mock.method(console, "warn", () => {}); // the missing key below
  signedInWithMedia();
  const response = await get(KEY);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), KEY); // the fake bucket's bytes for exactly this key
  assert.equal(response.headers.get("content-type"), "image/avif");
  assert.equal(response.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'");
  assert.equal((await get("1/fedcba9876543210-640.avif")).status, 404); // an image key the bucket doesn't hold
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test app/api/cron/daily/route.test.ts`
Elvárt: FAIL, `ERR_MODULE_NOT_FOUND` a `lib/test/route-hooks.ts`-re.

- [ ] **Step 3: A réteg**

`lib/test/route-hooks.ts` (új fájl):

```ts
// Route-handler tests with no running Next.js app: importing this registers tsx-hooks.ts, which
// resolves `@/lib/supabase/server` and `next/server` to this file and `server-only` to an empty
// module. Import it before the route, which is why route tests load theirs with a dynamic import.

import { register } from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "../supabase/server.ts";

register("./tsx-hooks.ts", import.meta.url);

export { NextResponse } from "next/server.js";
export { safeNext } from "../pipeline/util.ts";

type Reader = { db: SupabaseClient; viewer: Viewer };

/** What the stubbed modules answer. `resetRoute()` at the start of every test. */
export const routeStub = {
  /** `getReader()`'s answer: null is signed out. */
  reader: null as Reader | null,
  /** `createAdminClient()`'s answer. */
  admin: null as SupabaseClient | null,
  /** How many times the route asked for the admin client. */
  adminCalls: 0,
  /** Every task the route handed to `after()`, not yet run. */
  scheduled: [] as (() => unknown)[],
};

export function resetRoute(): void {
  Object.assign(routeStub, { reader: null, admin: null, adminCalls: 0, scheduled: [] });
}

/** A signed-in reader whose RLS-scoped client is `db`. */
export const signedIn = (db: SupabaseClient, id = "owner"): Reader => ({ db, viewer: { id, email: `${id}@example.test` } });

export const getReader = async () => routeStub.reader;
export const getViewer = async () => routeStub.reader?.viewer ?? null;
export const createClient = async () => routeStub.reader?.db;

export function createAdminClient(): SupabaseClient {
  routeStub.adminCalls++;
  if (!routeStub.admin) throw new Error("routeStub.admin is not set");
  return routeStub.admin;
}

/** `next/server`'s `after()`: the task is queued, so a test can see it was scheduled and run it. */
export function after(task: () => unknown): void {
  routeStub.scheduled.push(task);
}
```

A tesztnek és a route-nak ugyanazt a modulpéldányt kell látnia. A teszt relatív úttal importálja ezt a fájlt, a hook pedig ugyanerre az URL-re oldja fel a route `@/lib/supabase/server` és `next/server` importját. Az `@/lib/test/route-hooks` vagy egy másik út egy második példányt adna, és a 401-es tesztek „üresen” mennének át (Review Focus 1.).

`lib/test/tsx-hooks.ts`, ez a két sor:

```ts
const STUBBED = new Set(["next/link", "next/navigation"]);
const stub = new URL("./next-stub.ts", import.meta.url).href;
```

helyett:

```ts
const here = (file: string) => new URL(file, import.meta.url).href;
/** Modules that need a running Next.js app, and what stands in for them. */
const STUBS = new Map([
  ["next/link", here("./next-stub.ts")],
  ["next/navigation", here("./next-stub.ts")],
  ["next/server", here("./route-hooks.ts")],
  ["@/lib/supabase/server", here("./route-hooks.ts")],
  ["server-only", "data:text/javascript,"],
]);
```

és a `resolve` első sora:

```ts
  if (STUBBED.has(specifier)) return { url: stub, shortCircuit: true };
```

helyett:

```ts
  const stub = STUBS.get(specifier);
  if (stub) return { url: stub, shortCircuit: true };
```

A fájl fejléc-kommentje:

```ts
// Node module hooks registered by render.ts (they run on Node's loader thread). They do the three
// things a bundler would: resolve `@/` and extensionless relative imports like tsconfig's paths,
// compile .tsx with the project's own TypeScript, and swap the Next.js modules that need a running
// app for next-stub.ts.
```

helyett:

```ts
// Node module hooks registered by render.ts and route-hooks.ts (they run on Node's loader thread).
// They do the three things a bundler would: resolve `@/` and extensionless relative imports like
// tsconfig's paths, compile .tsx with the project's own TypeScript, and swap the modules that need a
// running Next.js app for next-stub.ts (components) or route-hooks.ts (route handlers).
```

- [ ] **Step 4: Futtatás; a `/media` 200-as esete még bukik**

Futtatás: `node --experimental-strip-types --no-warnings --test app/api/cron/daily/route.test.ts "app/media/[[]...path]/route.test.ts"`
Elvárt: a cron 2 tesztje PASS, a `/media` 404-es és 401-es tesztje PASS. A `/media serves an image privately…` FAIL: `….download is not a function`.

- [ ] **Step 5: A fake storage `download`-ja** (`lib/pipeline/fake-db.ts`)

A `storage.from()` objektumában a `remove:` elé:

```ts
      download: async (path: string) =>
        objects.has(bareObjectName(path)) ? { data: new Blob([path]), error: null } : { data: null, error: { message: "Object not found" } },
```

A `fakeDb` doc-kommentjében a „`upload` adds to it and `list` reflects it” rész helyett: „`upload` adds to it, `list` reflects it, and `download` answers an object it holds with the object's own path as its bytes”.

- [ ] **Step 6: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test app/api/cron/daily/route.test.ts "app/media/[[]...path]/route.test.ts"`
Elvárt: `ℹ tests 5`, `ℹ pass 5`.

- [ ] **Step 7: Mutációs próba**

Minden sorra: alkalmazd, futtasd a két fájlt a 6. lépés parancsával, lásd a FAIL-t, `git checkout -- <fájl>`.

| Próba | Fájl | Előtte → utána | Elvárt bukó teszt |
| --- | --- | --- | --- |
| X1 | `app/api/cron/daily/route.ts` | `if (!secret \|\| request.headers.get("authorization") !== …` → `if (secret && request.headers.get("authorization") !== …` | `the cron answers 401 without a CRON_SECRET…` |
| N1 | ugyanaz | `await runDaily(db).catch((error: unknown) => { … return null; });` (négy sor) → `await runDaily(db);` | `a failed digest still retries the pending sources…` |
| X2 | `app/media/[...path]/route.ts` | az `if (!isMediaKey(key)) return new Response("not found", { status: 404 });` sor törlése | `/media answers 404 for anything but an image key…` |
| M1 | `lib/media.ts` | `/^\d+\/[0-9a-f]{16}-\d+\.(avif\|webp)$/` → `/\d+\/[0-9a-f]{16}-\d+\.(avif\|webp)$/` | ugyanaz (az `x1/…` és `evil/1/…` kulcs) |
| N2 | `app/media/[...path]/route.ts` | `"private, max-age=31536000, immutable"` → `"public, max-age=31536000, immutable"` | `/media serves an image privately…` |

- [ ] **Step 8: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 459`, `Found 0 clones.`

- [ ] **Step 9: Commit**

```bash
git add lib/test/route-hooks.ts lib/test/tsx-hooks.ts lib/pipeline/fake-db.ts app/api/cron/daily/route.test.ts "app/media/[...path]/route.test.ts"
git commit -m "test: add a route-handler test layer and pin the cron and media auth"
```

---

### Task 4: Az olvasói route-ok: sources, state, `posts/[id]`

**Files:**
- Create: `app/api/sources/route.test.ts`, `app/api/state/route.test.ts`, `app/api/posts/[id]/route.test.ts`, `app/api/posts/[id]/translate/route.test.ts`, `app/api/posts/[id]/reextract/route.test.ts`
- Modify: `lib/pipeline/fake-db.ts` (`sources` `insert`, `sourceInsertError`, `sourceInserts`)

**Interfaces:**
- Consumes: `routeStub`, `resetRoute`, `signedIn` (3. feladat); `fakeDb`, `pgError`, `type FakeIngestTables` (1. feladat)
- Produces:
  - `FakeIngestTables.sourceInsertError?: PostgrestErrorShape`
  - `FakeIngestDb.sourceInserts: Record<string, unknown>[]`
  - `from("sources").insert(values).select(...).single()` → `{ data: { id: <a lookup-sorok száma + 1> }, error: null }`, vagy a `sourceInsertError`

- [ ] **Step 1: Az öt route-teszt**

`app/api/sources/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError, type FakeIngestTables } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const submit = (body: unknown) => POST(new Request("http://localhost/api/sources", { method: "POST", body: JSON.stringify(body) }));

function reader(tables: FakeIngestTables = {}) {
  resetRoute();
  const db = fakeDb(undefined, tables);
  routeStub.reader = signedIn(db);
  return db;
}

// X5: parseSubmittedUrl is the API boundary; a private or non-http link is never even stored.
test("POST /api/sources answers 400 invalid_url for a private or non-http link, and stores nothing", async () => {
  const db = reader();
  for (const url of ["http://127.0.0.1/admin", "http://10.0.0.1/", "http://localhost:3000/", "http://printer.local/", "http://metadata.google.internal/", "file:///etc/passwd", "javascript:alert(1)", "not a url", 42]) {
    const response = await submit({ url });
    assert.deepEqual([response.status, await response.json()], [400, { error: "invalid_url" }], String(url));
  }
  assert.deepEqual(db.sourceInserts, []);
  assert.deepEqual(routeStub.scheduled, []);
});

// N3: `sources.url` is unique; a second submission of the same link is the reader's news, not a 500.
test("POST /api/sources answers 409 already_submitted when the link is already in the library", async () => {
  reader({ sourceInsertError: pgError("23505", 'duplicate key value violates unique constraint "sources_url_key"') });
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [409, { error: "already_submitted" }]);
  assert.deepEqual(routeStub.scheduled, []);
});

// N4: the 202 is a promise that the link gets processed after the response.
test("POST /api/sources stores the link as the reader, answers 202 with its id, and schedules its processing", async () => {
  const db = reader();
  const response = await submit({ url: " https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=1 ", note: `  ${"n".repeat(600)}` });
  assert.deepEqual([response.status, await response.json()], [202, { ok: true, id: 1 }]);
  assert.deepEqual(db.sourceInserts, [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "youtube", note: "n".repeat(500) }]);
  assert.equal(routeStub.scheduled.length, 1);
  assert.equal(routeStub.adminCalls, 0, "the admin client is opened only when the scheduled run starts");
});

test("POST /api/sources answers 401 when signed out", async () => {
  resetRoute();
  const response = await submit({ url: "https://blog.test/post" });
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
```

`app/api/state/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const write = (body: unknown) => POST(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify(body) }));

// X3: the read and the saved flag are two columns of one row; crossing them flips the reader's state.
test("POST /api/state writes set_read to is_read and set_saved to is_saved, each alone, on the reader's row", async () => {
  resetRoute();
  const db = fakeDb();
  routeStub.reader = signedIn(db);
  for (const body of [{ action: "set_read", itemId: "local-a", value: true }, { action: "set_saved", itemId: "local-a", value: false }]) {
    const response = await write(body);
    assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  }
  const rows = db.upserts.map(({ table, values, options }) => {
    const { updated_at, ...flags } = values as Record<string, unknown>;
    assert.equal(typeof updated_at, "string");
    return { table, flags, options };
  });
  assert.deepEqual(rows, [
    { table: "item_states", flags: { item_id: "local-a", is_read: true }, options: { onConflict: "user_id,item_id" } },
    { table: "item_states", flags: { item_id: "local-a", is_saved: false }, options: { onConflict: "user_id,item_id" } },
  ]);
});

test("POST /api/state answers 401 when signed out", async () => {
  resetRoute();
  const response = await write({ action: "set_read", itemId: "local-a", value: true });
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
```

`app/api/posts/[id]/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError } from "../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../lib/test/route-hooks.ts";

const { PATCH } = await import("./route.ts");

const save = (body: unknown) =>
  PATCH(new Request("http://localhost/api/posts/7", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "7" }) });

// N8: update_post_overrides raises 42501 for anyone but the submitter; the editor shows that as "not yours".
test("PATCH /api/posts/[id] answers 403 when the database refuses the edit, and 400 for a malformed body", async () => {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7, blocks: [] }, rpcError: pgError("42501", "only the submitter can edit this post") }), "intruder");
  const refused = await save({ hidden: [] });
  assert.deepEqual([refused.status, await refused.json()], [403, { error: "forbidden" }]);
  const malformed = await save({ hidden: "b1" });
  assert.deepEqual([malformed.status, await malformed.json()], [400, { error: "invalid" }]);
  assert.equal(routeStub.adminCalls, 0, "an edit runs as the reader, never with the secret key");
});
```

`app/api/posts/[id]/translate/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const translate = () => POST(new Request("http://localhost/api/posts/7/translate", { method: "POST" }), { params: Promise.resolve({ id: "7" }) });

// N9: RLS decides whether the reader can see the post; only then does the secret key run the model.
test("POST /translate answers 404 for a post the reader can't see, without opening the admin client", async () => {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { post: null }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks: [], blocks_hu: null, extracted_at: null } });
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [404, { error: "not_found" }]);
  assert.equal(routeStub.adminCalls, 0);
});

test("POST /translate runs the translation with the admin client once the reader sees the post", async () => {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, { post: { id: 7 } }));
  routeStub.admin = fakeDb(undefined, { post: { id: 7, blocks: [], blocks_hu: null, extracted_at: null } }); // nothing to translate: ok, no model call
  const response = await translate();
  assert.deepEqual([response.status, await response.json()], [200, { ok: true }]);
  assert.equal(routeStub.adminCalls, 1);
});
```

A teszt fekete dobozként nézi a route-ot, ezért túléli az M2 8. feladatának `onDemandRoute`-os átírását: a válaszok ugyanazok maradnak.

`app/api/posts/[id]/reextract/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const reextract = (id = "7") => POST(new Request(`http://localhost/api/posts/${id}/reextract`, { method: "POST" }), { params: Promise.resolve({ id }) });

/** Post 7, from source 3, submitted by "owner"; `extractedAt` is when it was last (re-)extracted. */
function postBy(viewer: string, extractedAt: string | null = null) {
  resetRoute();
  const admin = fakeDb(undefined, { post: { id: 7, source_id: 3, extracted_at: extractedAt, sources: { submitted_by: "owner" } } });
  routeStub.reader = signedIn(fakeDb(), viewer);
  routeStub.admin = admin;
  return admin;
}

test("POST /reextract answers 403 to a reader who didn't submit the post, and schedules nothing", async () => {
  const admin = postBy("intruder");
  const response = await reextract();
  assert.deepEqual([response.status, await response.json()], [403, { error: "forbidden" }]);
  assert.deepEqual(routeStub.scheduled, []);
  assert.deepEqual(admin.postUpdates, []); // the cooldown was never claimed
});

// N5, N6: the ownership check gets the viewer's id, and the scheduled run re-extracts the post's own
// source (3), not a source that happens to share the post's id (7).
test("POST /reextract answers 202 to the submitter and schedules a run of the post's own source", async () => {
  const admin = postBy("owner");
  const response = await reextract();
  assert.deepEqual([response.status, await response.json()], [202, { ok: true }]);
  assert.equal(routeStub.scheduled.length, 1);
  await assert.rejects(async () => routeStub.scheduled[0](), { code: "PGRST116" }); // the fake holds no sources row
  assert.deepEqual(admin.eqCalls.filter((call) => call.table === "sources"), [{ table: "sources", column: "id", value: 3 }]);
});

// N7: the client shows "try again in N minutes" from retryAfter.
test("POST /reextract inside the cooldown answers 429 with the seconds left", async () => {
  postBy("owner", new Date(Date.now() - 5 * 60_000).toISOString());
  const response = await reextract();
  const body = (await response.json()) as { error: string; retryAfter: number };
  assert.equal(response.status, 429);
  assert.equal(body.error, "cooldown");
  assert.ok(body.retryAfter > 295 && body.retryAfter <= 300, String(body.retryAfter));
  assert.deepEqual(routeStub.scheduled, []);
});
```

- [ ] **Step 2: Futtatás, a sources-teszt bukik**

Futtatás: `node --experimental-strip-types --no-warnings --test app/api/sources/route.test.ts app/api/state/route.test.ts "app/api/posts/[[]id]/route.test.ts" "app/api/posts/[[]id]/translate/route.test.ts" "app/api/posts/[[]id]/reextract/route.test.ts"`
Elvárt:
- a `…409 already_submitted…` és a `…answers 202 with its id…` FAIL: `….insert is not a function`;
- a sources 400-as és 401-es esete, valamint a state, a PATCH, a translate és a reextract tesztjei PASS. Ezek a mai, helyes kódot rögzítik; a piros lépésük az 5. lépés mutációja.

- [ ] **Step 3: A fake `insert`-je** (`lib/pipeline/fake-db.ts`)

A `FakeIngestTables`-be, a `pending` mező után:

```ts
  /** Forces `sources`' `insert(...).select().single()` to resolve with this error, e.g. `pgError("23505", …)`. */
  sourceInsertError?: PostgrestErrorShape;
```

A `FakeIngestDb`-be, a `sourceUpdates` után:

```ts
  /** Every `sources` INSERT payload, in call order. */
  sourceInserts: Record<string, unknown>[];
```

A `fakeDb` törzsében a `const sourceUpdates…` sor után: `const sourceInserts: Record<string, unknown>[] = [];`. A visszaadott objektumban a `sourceUpdates,` után: `sourceInserts,`. A `from("sources")` visszaadott objektumában a `select:` sor után:

```ts
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              sourceInserts.push(values);
              return tables.sourceInsertError ? { data: null, error: tables.sourceInsertError } : { data: { id: lookedUp.length + 1 }, error: null };
            },
          }),
        }),
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: a 2. lépés parancsa.
Elvárt: `ℹ tests 12`, `ℹ pass 12`.

- [ ] **Step 5: Mutációs próba**

Minden sorra: alkalmazd, futtasd a 2. lépés parancsát, lásd a FAIL-t, `git checkout -- <fájl>`.

| Próba | Fájl | Előtte → utána | Elvárt bukó teszt |
| --- | --- | --- | --- |
| X3 | `app/api/state/route.ts` | `? "is_read" : "is_saved"` → `? "is_saved" : "is_read"` | `POST /api/state writes set_read to is_read…` |
| X5 | `app/api/sources/route.ts` | `const url = parseSubmittedUrl(String(body.url ?? ""));` → `const url = URL.canParse(String(body.url ?? "")) ? new URL(String(body.url)) : null;` | `POST /api/sources answers 400 invalid_url…` |
| N3 | ugyanaz | az `if (error?.code === "23505") return jsonError(409, "already_submitted");` sor törlése | `…answers 409 already_submitted…` |
| N4 | ugyanaz | az `after(() => processSource(createAdminClient(), data.id));` sor törlése | `…answers 202 with its id, and schedules its processing` |
| N5 | `app/api/posts/[id]/reextract/route.ts` | `requestReextract(admin, reader.viewer.id, postId, new Date())` → `requestReextract(admin, reader.viewer.email, postId, new Date())` | `POST /reextract answers 202 to the submitter…` |
| N6 | ugyanaz | `after(() => processSource(admin, result.sourceId));` → `after(() => processSource(admin, postId));` | ugyanaz |
| N7 | ugyanaz | `jsonError(429, "cooldown", { retryAfter: result.retryAfter })` → `jsonError(429, "cooldown")` | `POST /reextract inside the cooldown answers 429…` |
| N8 | `app/api/posts/[id]/route.ts` | a `  ...POST_ERRORS,` sor után új sor: `  forbidden: POST_ERRORS.not_found,` | `PATCH /api/posts/[id] answers 403…` |
| N9 | `app/api/posts/[id]/translate/route.ts` | `await reader.db.from("posts").select("id")` → `await createAdminClient().from("posts").select("id")` | `POST /translate answers 404 for a post the reader can't see…` |

- [ ] **Step 6: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 471`, `Found 0 clones.` Ha a jscpd két route-teszt fejlécét klónnak látná, a közös rész (kérés-építő, `reader()`) nem emelhető a `route-hooks.ts`-be: az a route-ok helyettese, nem tesztsegéd. Ilyenkor az adott tesztben rövidítsd a kérés-építést.

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/fake-db.ts app/api/sources/route.test.ts app/api/state/route.test.ts "app/api/posts/[id]/route.test.ts" "app/api/posts/[id]/translate/route.test.ts" "app/api/posts/[id]/reextract/route.test.ts"
git commit -m "test: pin the reader routes' auth, ownership and column mapping"
```

---

### Task 5: `safeFetch` és a privát tartományok határai

**Files:**
- Modify: `lib/pipeline/mock-fetch.ts` (`mockDns`), `lib/pipeline/fetch.test.ts`, `lib/pipeline/util.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `mockDns(t: TestContext, ...addresses: string[]): void`. Paraméter nélkül `[TEST_IP]`. Minden cím egyetlen válaszban jön, ahogy a `lookup(host, { all: true })` adja. A `:`-os cím `family: 6`.

- [ ] **Step 1: A tesztek**

`lib/pipeline/fetch.test.ts`:
- az import: `import { endlessBody, mockFetch, TEST_HOST } from "./mock-fetch.ts";` → `import { endlessBody, mockDns, mockFetch, TEST_HOST, TEST_IP } from "./mock-fetch.ts";`;
- a `safeFetch blocks a redirect to a loopback address` és a `safeFetch blocks a redirect to the cloud metadata address` teszt (ugyanazt az ágat nézik, az audit átírási listája szerint) helyére:

```ts
test("safeFetch blocks a redirect to a loopback or the cloud metadata address", async (t) => {
  for (const location of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/"]) {
    const calls = redirectOnceThenOk(t, location);
    await assert.rejects(() => safeFetch(`${PUB}/a`), (error: unknown) => error instanceof FetchError && /blocked/.test(error.message), location);
    assert.equal(calls.length, 1, location); // the blocked hop must never actually be fetched
  }
});

// F1: every hop is checked because safeFetch follows redirects itself; a fetch left to follow them
// would reach the second hop unchecked.
test("safeFetch never lets fetch follow a redirect on its own", async (t) => {
  const modes: (RequestRedirect | undefined)[] = [];
  mockFetch(t, async (url, init) => {
    modes.push(init?.redirect);
    return url === `${PUB}/a` ? redirect(`${PUB}/b`) : new Response("ok");
  });
  assert.equal(await (await safeFetch(`${PUB}/a`)).text(), "ok");
  assert.deepEqual(modes, ["manual", "manual"]);
});

// F2, N10: one private address in the answer is enough to refuse the host, since the connection may
// use any of them; and the submitted URL itself is checked, not only the redirects after it.
test("safeFetch refuses a first hop that is private or resolves to any private address, before any request", async (t) => {
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    return new Response("ok");
  });
  mockDns(t, TEST_IP, "10.0.0.1");
  await assert.rejects(() => safeFetch("http://mixed.example.test/"), (error: unknown) => error instanceof FetchError && error.message === "blocked address");
  for (const first of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/"]) {
    await assert.rejects(() => safeFetch(first), (error: unknown) => error instanceof FetchError && error.message === "blocked url", first);
  }
  assert.equal(calls, 0);
});
```

`lib/pipeline/util.test.ts`, a `test("detectSource and its URL helpers", …)` elé:

```ts
// U4–U7: each private range and internal-name rule, pinned on both sides of its edge.
test("isPrivateAddress and parseSubmittedUrl hold at every range boundary", () => {
  for (const ip of ["172.16.0.1", "172.31.255.255", "100.64.0.0", "100.127.255.255", "224.0.0.1", "fe90::1", "feb0::1", "febf::1", "fc00::1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0", "223.255.255.255"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
  for (const bad of ["http://printer.local/", "http://NAS.LOCAL/", "http://metadata.google.internal/", "http://172.16.0.1/", "http://172.31.0.1/"]) {
    assert.equal(parseSubmittedUrl(bad), null, bad);
  }
  for (const good of ["https://local.example.com/", "https://internal.example.com/", "http://172.15.0.1/", "http://172.32.0.1/"]) {
    assert.ok(parseSubmittedUrl(good), good);
  }
});
```

- [ ] **Step 2: Futtatás, a vegyes DNS-teszt bukik**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/fetch.test.ts lib/pipeline/util.test.ts`
Elvárt: 1 FAIL, `safeFetch refuses a first hop that is private or resolves to any private address…`: `Missing expected rejection`. A mai `mockDns` csak az első címet adja vissza, ezért a vegyes válaszból egy tisztán nyilvános lesz. A többi teszt PASS. Az F1-, a határ- és az összevont teszt a mai, helyes kódot rögzíti, a piros lépésük az 5. lépés mutációja.

- [ ] **Step 3: A `mockDns` több címet ad** (`lib/pipeline/mock-fetch.ts`)

```ts
export function mockDns(t: TestContext, address = TEST_IP): void {
  t.mock.method(dns, "lookup", async () => [{ address, family: 4 }]);
}
```

helyett:

```ts
export function mockDns(t: TestContext, ...addresses: string[]): void {
  const answer = (addresses.length ? addresses : [TEST_IP]).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  t.mock.method(dns, "lookup", async () => answer);
}
```

A doc-komment első mondatában a „resolves to `address` without a live query.” helyett: „resolves to `addresses` (default: TEST_IP) without a live query, all of them in one answer the way `lookup(host, { all: true })` gives them.”. A 30 meglévő hívás mind `mockDns(t)`, ezek nem változnak.

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: a 2. lépés parancsa.
Elvárt: `ℹ tests 42`, `ℹ pass 42` (16 + 26).

- [ ] **Step 5: Mutációs próba**

Minden sorra: alkalmazd, futtasd a 2. lépés parancsát, lásd a FAIL-t, `git checkout -- <fájl>`.

| Próba | Fájl | Előtte → utána | Elvárt bukó teszt |
| --- | --- | --- | --- |
| F1 | `lib/pipeline/fetch.ts` | a `redirect: "manual",` sor törlése | `safeFetch never lets fetch follow a redirect on its own` |
| F2 | ugyanaz | `addresses.some(({ address }) => isPrivateAddress(address))` → `addresses.every(({ address }) => isPrivateAddress(address))` | `safeFetch refuses a first hop that is private or resolves to any private address…` |
| N10 | ugyanaz | `    const url = await checkedHop(current);` → `    const url = hop === 0 ? new URL(current) : await checkedHop(current);` | ugyanaz |
| U4 | `lib/pipeline/util.ts` | a `host.endsWith(".internal") \|\|` sor törlése | `isPrivateAddress and parseSubmittedUrl hold at every range boundary` |
| U5 | ugyanaz | a `host.endsWith(".local") \|\|` sor törlése | ugyanaz |
| U6 | ugyanaz | `(a === 172 && b >= 16 && b <= 31)` → `(a === 172 && b >= 17 && b <= 31)` | ugyanaz |
| U7 | ugyanaz | `/^fe[89ab]/` → `/^fe8/` | ugyanaz |

- [ ] **Step 6: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 473`, `Found 0 clones.`

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/mock-fetch.ts lib/pipeline/fetch.test.ts lib/pipeline/util.test.ts
git commit -m "test: pin safefetch's redirect, dns and first-hop checks and the private-range edges"
```

---

### Task 6: Minden `safeFetch`-hívóhely, és a képek korlátai

**Files:**
- Modify: `lib/pipeline/images.test.ts` (a `mirrorImages bounds each download with its own fetch timeout` teszt cseréje, három új teszt), `lib/pipeline/extract/index.test.ts` (egy új teszt)

**Interfaces:**
- Consumes: `mockDns(t, ...addresses)` (5. feladat); `mockFetch`, `endlessBody`, `TEST_HOST`; `FetchError`
- Produces: —

- [ ] **Step 1: A tesztek**

`lib/pipeline/images.test.ts`:
- az import: `import { endlessBody, mockFetch, TEST_HOST } from "./mock-fetch.ts";` → `import { endlessBody, mockDns, mockFetch, TEST_HOST } from "./mock-fetch.ts";`;
- a teljes `test("mirrorImages bounds each download with its own fetch timeout", …)` (az `AbortSignal.timeout`-ot kézzel felülíró spy) helyére:

```ts
// G1, N13: a hung image host costs one FETCH_TIMEOUT_MS, not the whole image budget. The response
// below never comes, so only the download's own abort signal can end it; the stubbed clock makes that
// timeout fire at once and records how long it was asked to be.
test("mirrorImages aborts a download that hangs past FETCH_TIMEOUT_MS and keeps the block unmirrored", { timeout: 5_000 }, async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  const asked: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    asked.push(ms);
    return realTimeout(1);
  });
  mockFetch(t, (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
    }),
  );
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/hangs.png`)]);
  assert.deepEqual(asked, [FETCH_TIMEOUT_MS]);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(uploads.length, 0);
});

// G1b: every image URL on a submitted page is fetched server-side, next to the secret key.
test("mirrorImages never fetches an image on a private address, and keeps it unmirrored", async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  mockDns(t, "10.0.0.1"); // cdn.example.test resolves to a private address
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response(await png(200, 150), { headers: { "content-type": "image/png" } });
  });
  const blocks = ["http://127.0.0.1/x.png", "http://cdn.example.test/y.png", "http://169.254.169.254/latest/meta-data/"].map((url, i) => image(`i${i}`, url));
  const out = await mirrorImages(db, 1, blocks);
  assert.equal(fetches, 0);
  assert.deepEqual(out.map((block) => (block as ImageBlock).path), [null, null, null]);
  assert.equal(uploads.length, 0);
});

// G2: a small file can decode to billions of pixels (a decompression bomb); sharp refuses past PIXEL_LIMIT.
test("encodeImage refuses an image over the 40-megapixel limit", async () => {
  const huge = await sharp({ create: { width: 8000, height: 5001, channels: 3, background: "#141414" } }).png().toBuffer();
  await assert.rejects(() => encodeImage(huge), /pixel limit/);
});

// G3: a body over 5 MB is never read into memory, let alone handed to sharp, even when it is an image.
test("mirrorImages keeps a 5 MB + 1 byte image unmirrored, without reading it", async (t) => {
  const { db, uploads } = fakeStorageDb();
  t.mock.method(console, "warn", () => {});
  const oversized = Buffer.concat([await png(200, 150), Buffer.alloc(5 * 1024 * 1024)]).subarray(0, 5 * 1024 * 1024 + 1);
  mockFetch(t, async () => new Response(oversized, { headers: { "content-type": "image/png", "content-length": String(oversized.length) } }));
  const out = await mirrorImages(db, 1, [image("i1", `${HOST}/big.png`)]);
  assert.equal((out[0] as ImageBlock).path, null);
  assert.equal(uploads.length, 0);
});
```

A 8000 × 5001-es, egyszínű PNG kb. 127 KB, és kb. 90 ms alatt készül el. A sharp a fejlécből dob: `Input image exceeds pixel limit`.

`lib/pipeline/extract/index.test.ts`, a `test("isHtml treats a missing content-type…", …)` elé:

```ts
// H1–H3: a submitted link to a private address is refused before any request, on every path that
// fetches it: the article extractor, the pdf extractor, and the metadata-only fallback both end in.
test("extract() refuses a private URL before any fetch, for article, pdf and the metadata-only fallback", async (t) => {
  t.mock.method(console, "warn", () => {});
  mockDns(t, "10.0.0.1"); // intranet.example.test resolves to a private address
  let fetches = 0;
  mockFetch(t, async () => {
    fetches++;
    return new Response("<html><head><title>Internal</title></head><body></body></html>", { headers: { "content-type": "text/html" } });
  });
  const blocked = (error: unknown) => error instanceof FetchError && /^blocked/.test(error.message);
  for (const url of ["http://10.0.0.1/admin", "http://intranet.example.test/admin"]) {
    await assert.rejects(() => extract(db, "article", url, ""), blocked, `article ${url}`);
    await assert.rejects(() => extract(db, "pdf", `${url}.pdf`, ""), blocked, `pdf ${url}`);
    await assert.rejects(() => metadataOnly(url), blocked, `metadataOnly ${url}`);
  }
  assert.equal(fetches, 0);
});
```

A `fetches === 0` állítás a lényeg. Egy plain `fetch`-re cserélt hívóhely után a hívásláncot a `metadataOnly` még „blocked”-dal zárhatja, a kérés viszont már kiment.

- [ ] **Step 2: Futtatás**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/images.test.ts lib/pipeline/extract/index.test.ts`
Elvárt: `ℹ tests 41`, `ℹ pass 41` (20 + 21). A mai kód helyes, a tesztek eddig hiányoztak, ezért a piros lépés itt a 3. lépés mutációja.

- [ ] **Step 3: Mutációs próba**

Minden sorra: alkalmazd, futtasd a 2. lépés parancsát, lásd a FAIL-t, `git checkout -- <fájl>`.

| Próba | Fájl | Előtte → utána | Elvárt bukó teszt |
| --- | --- | --- | --- |
| G1 | `lib/pipeline/images.ts` | `await safeFetch(image.originalUrl,` → `await fetch(image.originalUrl,` | `mirrorImages aborts a download that hangs…` |
| G1b | ugyanaz | `await safeFetch(image.originalUrl, { accept: "image/avif,image/webp,image/*;q=0.8", timeoutMs: FETCH_TIMEOUT_MS }),` → `await fetch(image.originalUrl, { headers: { accept: "image/avif,image/webp,image/*;q=0.8" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),` | `mirrorImages never fetches an image on a private address…` |
| N13 | ugyanaz | `timeoutMs: FETCH_TIMEOUT_MS })` → `})` | `mirrorImages aborts a download that hangs…` (`[20000]`) |
| G2 | ugyanaz | mindkét `limitInputPixels: PIXEL_LIMIT` → `limitInputPixels: false` | `encodeImage refuses an image over the 40-megapixel limit` |
| G3 | ugyanaz | `const MAX_BYTES = 5 * 1024 * 1024;` → `const MAX_BYTES = 500 * 1024 * 1024;` | `mirrorImages keeps a 5 MB + 1 byte image unmirrored…` |
| H1 | `lib/pipeline/extract/article.ts` | `await safeFetch(url, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" })` → `await fetch(url, { headers: { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" } })` | `extract() refuses a private URL before any fetch…` |
| H2 | `lib/pipeline/extract/pdf.ts` | `await safeFetch(url, { accept: "application/pdf" })` → `await fetch(url, { headers: { accept: "application/pdf" } })` | ugyanaz |
| H3 | `lib/pipeline/extract/index.ts` | `await safeFetch(url, { accept: "text/html" })` → `await fetch(url, { headers: { accept: "text/html" } })` | ugyanaz |

A G1b-t a lógó-teszt nem fogja meg, mert ott a saját timeout megmarad. Ezt a privát-cím teszt öli meg.

- [ ] **Step 4: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 477`, `Found 0 clones.` A teljes `npm test` továbbra is néhány másodperc: a lógó-teszt ezredmásodpercek alatt lefut.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/images.test.ts lib/pipeline/extract/index.test.ts
git commit -m "test: pin safefetch at every call site and the image size limits"
```

---

### Task 7: A pipeline: a retry tartaléka, a shortlist, és a promptszövegtől független fake-ek

**Files:**
- Modify: `lib/pipeline/mock-fetch.ts` (`geminiSchemaKeys`, az `oembedThenBrokenGemini` kommentje), `lib/pipeline/daily.test.ts` (W1), `lib/pipeline/ingest.test.ts` (I7, sémakulcs-útválasztás), `lib/pipeline/extract/index.test.ts` (a duplikált YouTube-teszt)

**Interfaces:**
- Consumes: `fakeDb` (1. feladat); `START_GATE_RESERVE_MS` (`lib/pipeline/ingest.ts`)
- Produces: `geminiSchemaKeys(init?: RequestInit): string[]`: a rögzített Gemini-kérés `generationConfig.responseJsonSchema.properties` kulcsai (`["remove"]` a cleanup, `["sections"]` a jegyzet, `["keep"]` a shortlist).

- [ ] **Step 1: A W1-teszt és az I7 átírása**

`lib/pipeline/daily.test.ts`:
- az import: `import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";` → `import { geminiPrompt, geminiResponse, geminiSchemaKeys, geminiText, mockFetch, withGeminiKey } from "./mock-fetch.ts";`;
- a fájl végére:

```ts
// W1: past 40 candidates the cheap shortlist runs before curation; when it fails, the first 40 go on.
test("runDaily shortlists more than 40 candidates, and keeps the first 40 when the shortlist call fails", async (t) => {
  withGeminiKey(t);
  t.mock.method(console, "warn", () => {}); // the feeds' 404s and the failed shortlist
  const hits = Array.from({ length: 45 }, (_, i) => ({ title: `Story ${i}`, url: `https://news.test/${i}`, created_at: "2026-09-22T08:00:00Z", points: 100, objectID: String(i) }));
  let prompt = "";
  mockFetch(t, async (url, init) => {
    if (url.startsWith("https://hn.algolia.com/")) return Response.json({ hits });
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      if (geminiSchemaKeys(init).includes("keep")) return geminiText("not json");
      prompt = geminiPrompt(init);
      return geminiResponse({ items: [], github: [] });
    }
    return new Response("", { status: 404 });
  });
  const db = fakeDb();

  const result = await runDaily(db, new Date("2026-09-23T05:00:00Z"));

  assert.deepEqual([result.candidates, result.shortlisted], [45, 40]);
  assert.deepEqual(db.tasks, ["daily_shortlist", "daily_curate"]);
  assert.match(prompt, /\[39\] \(companies\) Story 39 —/);
  assert.doesNotMatch(prompt, /Story 4[0-4] —/);
});
```

A Hacker News négy lekérdezése ugyanazt a 45 találatot adja, ezekből a dedupe 45 jelöltet hagy. A feedeknek csak 25 lenne a plafonja (vagy a `limit`-jük), ezért kell a HN.

`lib/pipeline/ingest.test.ts`, a (j) teszt, amely ma lejárt határidővel fut, és ezért a 120 s-os tartalékot nem rögzíti:

```ts
test("retryPendingSources() stops starting new sources once the deadline is too close, without touching any of them (j)", async () => {
  const db = fakeDb(undefined, { pending: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const processed = await retryPendingSources(db, Date.now() - 1);
  assert.equal(processed, 0);
  assert.deepEqual(db.sourceUpdates, []); // no source was ever started
});
```

helyére:

```ts
// I7: a source is started only while START_GATE_RESERVE_MS (120 s) is still left, not merely before the deadline.
test("retryPendingSources() starts no source with less than START_GATE_RESERVE_MS left, without touching any of them (j)", async (t) => {
  mockFetch(t, async () => new Response("", { status: 404 })); // reached only if a source were started
  const sources = [newSource(1), newSource(2), newSource(3)];
  const db = fakeDb(undefined, { sources, pending: sources });
  const processed = await retryPendingSources(db, Date.now() + START_GATE_RESERVE_MS - 1_000);
  assert.equal(processed, 0);
  assert.deepEqual(db.sourceUpdates, []); // no source was ever started
});
```

Ez erősebb a réginél: a lejárt határidő ennek része. A másik oldalt (`START_GATE_RESERVE_MS + 2_000` → egy forrás indul) a meglévő `forwards its deadline…` teszt rögzíti.

- [ ] **Step 2: Futtatás, a W1-teszt bukik**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/daily.test.ts lib/pipeline/ingest.test.ts`
Elvárt: FAIL, `The requested module './mock-fetch.ts' does not provide an export named 'geminiSchemaKeys'` (a `daily.test.ts` betöltése). Az `ingest.test.ts` 33 tesztje PASS.

- [ ] **Step 3: `geminiSchemaKeys`** (`lib/pipeline/mock-fetch.ts`, a `geminiText` elé)

```ts
/** The top-level fields of the JSON Schema a captured Gemini request asks for: which task is calling
 *  (`remove` is the cleanup, `sections` the noarchive notes, `keep` the shortlist), whatever the prompt says. */
export function geminiSchemaKeys(init?: RequestInit): string[] {
  const body = JSON.parse(String(init?.body)) as { generationConfig: { responseJsonSchema: { properties?: Record<string, unknown> } } };
  return Object.keys(body.generationConfig.responseJsonSchema.properties ?? {});
}
```

Futtatás: a 2. lépés parancsa. Elvárt: `ℹ tests 39`, `ℹ pass 39` (6 + 33).

- [ ] **Step 4: Az ingest fake-jei a séma szerint** (`lib/pipeline/ingest.test.ts`, az audit átírási listája)

- Az import: `geminiPrompt, geminiResponse, geminiText,` → `geminiPrompt, geminiResponse, geminiSchemaKeys, geminiText,`.
- Az `articleGeminiHandler` és a kommentje:

  ```ts
  /** Serves `html` at TEST_HOST and routes every Gemini call to `cleanupOut` or `summaryOut` by which prompt it is. */
  function articleGeminiHandler(html: string, cleanupOut: unknown, summaryOut: unknown = okSummary) {
    return async (url: string, init?: RequestInit) => {
      if (url.startsWith(TEST_HOST)) return new Response(html, { headers: { "content-type": "text/html" } });
      const prompt = geminiPrompt(init);
      return geminiResponse(prompt.includes("NOT part of the article") ? cleanupOut : summaryOut);
    };
  }
  ```

  helyett:

  ```ts
  /** Whether a captured Gemini request is the ingest_cleanup call: its schema asks for `remove`. */
  const isCleanup = (init?: RequestInit) => geminiSchemaKeys(init).includes("remove");

  /** Serves `html` at TEST_HOST and routes every Gemini call to `cleanupOut` or `summaryOut` by the schema it asks for. */
  function articleGeminiHandler(html: string, cleanupOut: unknown, summaryOut: unknown = okSummary) {
    return async (url: string, init?: RequestInit) => {
      if (url.startsWith(TEST_HOST)) return new Response(html, { headers: { "content-type": "text/html" } });
      return geminiResponse(isCleanup(init) ? cleanupOut : summaryOut);
    };
  }
  ```

- A `noarchiveGeminiHandler`-ben:

  ```ts
      const prompt = geminiPrompt(init);
      return geminiResponse(prompt.includes("study notes") ? sectionsOut : summaryOut);
  ```

  helyett:

  ```ts
      return geminiResponse(geminiSchemaKeys(init).includes("sections") ? sectionsOut : summaryOut);
  ```

- A `…re-reads the current post right before running…` tesztben:

  ```ts
      const prompt = geminiPrompt(init);
      if (prompt.includes("NOT part of the article")) return geminiResponse({ remove: [] }); // cleanup: keep going
  ```

  helyett:

  ```ts
      if (isCleanup(init)) return geminiResponse({ remove: [] }); // cleanup: keep going
  ```

- A `…clips before cleaning…` tesztben:

  ```ts
      const prompt = geminiPrompt(init);
      if (prompt.includes("NOT part of the article")) {
        cleanupListingLines = prompt.split("\n").filter((line) => /^[a-z0-9-]+ \[/.test(line)).length;
  ```

  helyett:

  ```ts
      if (isCleanup(init)) {
        cleanupListingLines = geminiPrompt(init).split("\n").filter((line) => /^[a-z0-9-]+ \[/.test(line)).length;
  ```

  A lista hosszát ez a teszt továbbra is a promptból olvassa, mert azt méri, mi megy ki a modellnek.

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/ingest.test.ts`
Elvárt: `ℹ tests 33`, `ℹ pass 33`.

- [ ] **Step 5: A duplikált YouTube-teszt** (az audit átírási listája: `index.test.ts:86–106` vs `media.test.ts:132–199`)

A `lib/pipeline/extract/index.test.ts`-ből törlődik a `// A youtube Gemini failure is handled inside extractYoutube; extract() just surfaces the result.` komment és az utána álló `test("extract() surfaces extractYoutube's own metadata-only result…", …)`. Ugyanezt a viselkedést a `media.test.ts` `extractYoutube returns a metadata-only result when the Gemini call fails…` tesztje rögzíti, több állítással. Marad az `extract() rethrows FetchError('youtube video not found')…` teszt, mert a `RETHROW_FETCH_ERROR` youtube-tagját csak ez nézi az `extract()` szintjén. Marad a `…JSON null body…` teszt is.
- Az import: `mockFetch, oembedThenBrokenGemini, TEST_IP,` → `mockFetch, TEST_IP,`.
- `lib/pipeline/mock-fetch.ts`, az `oembedThenBrokenGemini` kommentje:

  ```ts
   * A fetch handler for "oEmbed succeeds, the Gemini call itself fails" — the scenario shared by
   * `extractYoutube`'s own unit test and `extract()`'s integration test of the same behaviour.
  ```

  helyett:

  ```ts
   * A fetch handler for "oEmbed succeeds, the Gemini call itself fails", shared by extractYoutube's tests.
  ```

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/extract/index.test.ts lib/pipeline/extract/media.test.ts`
Elvárt: `ℹ tests 40`, `ℹ pass 40` (20 + 20).

- [ ] **Step 6: Mutációs próba és fordított próba**

Mutációk (alkalmazd, futtasd a 2. lépés parancsát, lásd a FAIL-t, `git checkout -- <fájl>`):

| Próba | Fájl | Előtte → utána | Elvárt bukó teszt |
| --- | --- | --- | --- |
| W1 | `lib/pipeline/daily.ts` | `  if (candidates.length <= SHORTLIST) return candidates;` → `  return candidates;` | `runDaily shortlists more than 40 candidates…` (`[45, 45]`) |
| I7 | `lib/pipeline/ingest.ts` | `deadline - Date.now() < START_GATE_RESERVE_MS` → `deadline - Date.now() < 0` | `retryPendingSources() starts no source with less than START_GATE_RESERVE_MS left…` |

Fordított próba: a fake-ek már nem a promptszövegen múlnak. Írd át ideiglenesen a `lib/pipeline/cleanup.ts`-ben a `that are NOT part of the article itself` részt `that are not part of the article itself`-re, és a `lib/pipeline/summary.ts`-ben a `Write structured study notes about this source` részt `Write a structured study guide about this source`-ra. Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/ingest.test.ts`. Elvárt: `ℹ pass 33`. Az átírás előtt ugyanez a két szövegcsere több ingest-tesztet is pirosra festett volna. Utána `git checkout -- lib/pipeline/cleanup.ts lib/pipeline/summary.ts`.

- [ ] **Step 7: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 477` (+1 W1, −1 YouTube; az I7 átírás), `Found 0 clones.`

- [ ] **Step 8: Commit**

```bash
git add lib/pipeline/mock-fetch.ts lib/pipeline/daily.test.ts lib/pipeline/ingest.test.ts lib/pipeline/extract/index.test.ts
git commit -m "test: pin the retry reserve and the shortlist, and route model fakes by schema"
```

---

### Task 8: Blokk-id-k, médiakulcsok, és a fordítás elutasító esetei egy táblázatban

**Files:**
- Create: `lib/media.test.ts`
- Modify: `lib/blocks.test.ts` (B2), `lib/translate.test.ts` (21 teszt egy táblázatba), `lib/overrides.test.ts` (egy duplikált teszt törlése)

**Interfaces:**
- Consumes: `assignIds` (`lib/blocks.ts`), `isMediaKey`, `variantPath` (`lib/media.ts`), `applyTranslation`, `translatable`, `type TranslationItem` (`lib/translate.ts`)
- Produces: —

- [ ] **Step 1: B2 és M1**

`lib/blocks.test.ts`, a `test("safeHref keeps only http(s) and resolves relative links", …)` elé:

```ts
// B2: every saved `hidden_blocks` entry, and every future annotation, is one of these ids.
test("assignIds output is pinned forever: type prefix, content hash, normalization and the duplicate suffix", () => {
  // ⚠️ If this test fails, the change orphans every submitter's hidden blocks: fix the code, never the expected ids.
  const ids = assignIds([
    { type: "paragraph", content: [{ text: "Local models are  " }, { text: "Fast", bold: true }] },
    { type: "heading", level: 2, text: "Results" },
    { type: "image", originalUrl: "https://blog.test/figure.png", alt: "A figure", path: null },
    { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
    { type: "paragraph", content: [{ text: "local MODELS are fast" }] },
  ]).map((block) => block.id);
  assert.deepEqual(ids, ["pd6988894", "h073e213f", "i599b87fb", "v1aaaff45", "pd6988894-2"]);
});
```

A literálokat a mai `assignIds` adta (`node --experimental-strip-types … -e`). Az ötödik blokk a normalizálás (kisbetű, szóköz-összevonás) után az első másolata, ezért kapja a `-2` utótagot.

`lib/media.test.ts` (új fájl):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isMediaKey, variantPath } from "./media.ts";

// M1: the /media route downloads whatever isMediaKey accepts, so both of its anchors matter.
test("isMediaKey accepts exactly <source id>/<16 hex>-<width>.<avif|webp>", () => {
  const key = variantPath("12/0123456789abcdef", 640, "avif");
  assert.equal(isMediaKey(key), true);
  assert.equal(isMediaKey(variantPath("12/0123456789abcdef", 1280, "webp")), true);
  for (const bad of [`x${key}`, `../${key}`, `evil/${key}`, `${key}.png`, `${key}/x`, "12/0123456789ABCDEF-640.avif", "12/0123456789abcde-640.avif", "12/0123456789abcdef-640.svg", "12/0123456789abcdef.avif", ""]) {
    assert.equal(isMediaKey(bad), false, bad);
  }
});
```

Futtatás: `node --experimental-strip-types --no-warnings --test lib/blocks.test.ts lib/media.test.ts`
Elvárt: `ℹ tests 10`, `ℹ pass 10`. A két teszt a mai, helyes viselkedést rögzíti, a piros lépésük az 5. lépés mutációja.

- [ ] **Step 2: A fordítás elutasító esetei egy táblázatban** (`lib/translate.test.ts`, az audit átírási listája)

Előbb a kiinduló állapot: `node --experimental-strip-types --no-warnings --test lib/translate.test.ts 2>&1 | grep -c "✔ applyTranslation rejects"` → `21`.

Az import: `import { assignIds, type BlockDraft } from "./blocks.ts";` → `import { assignIds, type Block, type BlockDraft } from "./blocks.ts";`.

Ez a 21 teszt törlődik, a közvetlenül fölöttük álló, csak rájuk vonatkozó kommentekkel együtt:
- `applyTranslation rejects a missing block`
- `applyTranslation rejects an answer that translates nothing (ids only, every field missing)`
- `applyTranslation rejects a list whose items array is shorter than the original (2 items, 1 translated)`
- `applyTranslation rejects a non-empty original coming back empty`
- `applyTranslation rejects an answer ~10x the original length (degenerate repetition loop)`
- `applyTranslation rejects empty spans for a mismatched paragraph (spans: [])`
- `applyTranslation rejects a whitespace-only span for a mismatched paragraph (["   "])`
- `applyTranslation rejects a mismatched paragraph whose joined spans total 100 001 characters`
- `applyTranslation rejects a single-span paragraph answered with spans: []`
- `applyTranslation rejects an empty list item ([])`
- `applyTranslation rejects a 50 000-character list item`
- `applyTranslation rejects a missing heading text alone`
- `applyTranslation rejects a missing paragraph spans field alone`
- `applyTranslation rejects a missing image alt alone, when the original alt was non-empty`
- `applyTranslation rejects a whitespace-only span at a matching span count`
- `applyTranslation rejects a whitespace-only list-item span at a matching count`
- `applyTranslation rejects a whitespace-only caption when the original had one`
- `applyTranslation rejects a whitespace-only heading answer`
- `applyTranslation rejects a missing caption when the original block had one`
- `applyTranslation rejects a chapters answer whose array is shorter than the original`
- `applyTranslation rejects a whitespace-only chapter title`

A négy elfogadó teszt marad: `…applies a translated caption only when…`, `…accepts a missing alt when…`, `…ignores the model's alt entirely…`, `…translates chapter titles…`. A `// Two mirror-image rules: …` három soros komment a `…accepts a missing alt…` fölött ma mindkét tesztre vonatkozik. Erre a két sorra cserélődik:

```ts
// alt must not be required when the original alt was already empty: otherwise an image with alt: ""
// plus a caption fails every retry once the model drops the empty alt.
```

A `test("applyTranslation translates chapter titles, keeping their seconds untouched", …)` után, a `chunkTranslatable` tesztjei elé kerül a táblázat (a `chaptersBlocks` már fölötte van):

```ts
const longOriginal = "A fairly long heading that is definitely not a short string to translate";
const longBlocks = assignIds([{ type: "heading", level: 2, text: longOriginal }] satisfies BlockDraft[]);
const singleSpanBlocks = assignIds([{ type: "paragraph", content: [{ text: "Hello there" }] }] satisfies BlockDraft[]);

// Each answer below is valid but for one flaw, and must be refused whole: a filled blocks_hu hides the
// Translate button for good, so a half-right translation would be the last one the post gets.
const refused: [string, Block[], TranslationItem[]][] = [
  ["a missing block", blocks, [{ id: blocks[0].id, text: "Eredmények" }]],
  ["an answer that translates nothing (ids only, every field missing)", blocks, translatable(blocks).map((item) => ({ id: item.id }))],
  ["a list whose items array is shorter than the original (2 items, 1 translated)", blocks, answerWith(blocks[2].id, { items: [["egy"]] })],
  ["a non-empty original coming back empty", blocks, answerWith(blocks[0].id, { text: "" })],
  ["an answer ~10x the original length (degenerate repetition loop)", longBlocks, [{ id: longBlocks[0].id, text: "x".repeat(longOriginal.length * 10) }]],
  // A span-count mismatch falls back to the joined text, which is validated like any other field.
  ["empty spans for a mismatched paragraph (spans: [])", blocks, answerWith(blocks[1].id, { spans: [] })],
  ['a whitespace-only span for a mismatched paragraph (["   "])', blocks, answerWith(blocks[1].id, { spans: ["   "] })],
  ["a mismatched paragraph whose joined spans total 100 001 characters", blocks, answerWith(blocks[1].id, { spans: ["x".repeat(50_000), "x".repeat(50_001)] })],
  ["a single-span paragraph answered with spans: []", singleSpanBlocks, [{ id: singleSpanBlocks[0].id, spans: [] }]],
  ["an empty list item ([])", blocks, answerWith(blocks[2].id, { items: [[], ["kettő"]] })],
  ["a 50 000-character list item", blocks, answerWith(blocks[2].id, { items: [["a", "x".repeat(50_000)], ["kettő"]] })],
  // Each type's own presence check, alone: the entry is there, its field is not.
  ["a missing heading text alone", blocks, answerWith(blocks[0].id, {})],
  ["a missing paragraph spans field alone", blocks, answerWith(blocks[1].id, {})],
  ["a missing image alt alone, when the original alt was non-empty", blocks, answerWith(blocks[4].id, { caption: "Sebesség" })],
  ["a missing caption when the original block had one", blocks, answerWith(blocks[4].id, { alt: "grafikon" })],
  // Blank text, per field.
  ["a whitespace-only span at a matching span count", blocks, answerWith(blocks[1].id, { spans: ["Olvasd el a ", "   ", " most."] })],
  ["a whitespace-only list-item span at a matching count", blocks, answerWith(blocks[2].id, { items: [["  "], ["kettő"]] })],
  ["a whitespace-only caption when the original had one", blocks, answerWith(blocks[4].id, { alt: "grafikon", caption: "   " })],
  ["a whitespace-only heading answer", blocks, answerWith(blocks[0].id, { text: "   " })],
  ["a chapters answer whose array is shorter than the original", chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető"] }]],
  ["a whitespace-only chapter title", chaptersBlocks, [{ id: chaptersBlocks[0].id, chapters: ["Bevezető", "   "] }]],
];

for (const [name, original, answer] of refused) {
  test(`applyTranslation rejects ${name}`, () => {
    assert.equal(applyTranslation(original, answer), null);
  });
}
```

Minden eset ugyanazt az adatot kapja, mint a régi tesztje, és a neve is ugyanaz. Egy bukás így továbbra is az esetet nevezi meg.

Futtatás:

```bash
node --experimental-strip-types --no-warnings --test lib/translate.test.ts 2>&1 | grep -E "^ℹ (tests|pass)"
node --experimental-strip-types --no-warnings --test lib/translate.test.ts 2>&1 | grep -c "✔ applyTranslation rejects"
```

Elvárt: `ℹ tests 42`, `ℹ pass 42`, és újra `21` elutasító eset.

- [ ] **Step 3: A duplikált overrides-teszt** (`lib/overrides.test.ts`, az audit átírási listája)

Törlődik a `test("overridesSchema and hiddenBlocksSchema are the single source of truth readOverrides/readHiddenBlocks build on", …)`: ugyanazokat a határokat a fölötte álló `readOverrides …` és az alatta álló `readHiddenBlocks caps at the shared block limit` teszt már rögzíti. Az import: `import { hiddenBlocksSchema, overridesSchema, readHiddenBlocks, readOverrides } from "./overrides.ts";` → `import { readHiddenBlocks, readOverrides } from "./overrides.ts";`. A `MAX_BLOCKS` import marad, mert a `readHiddenBlocks caps…` használja.

Futtatás: `node --experimental-strip-types --no-warnings --test lib/overrides.test.ts`
Elvárt: `ℹ tests 8`, `ℹ pass 8`.

- [ ] **Step 4: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 478`, `Found 0 clones.`

- [ ] **Step 5: Mutációs próba**

Minden sorra: alkalmazd, futtasd a megadott fájlt, lásd a FAIL-t, `git checkout -- <fájl>`.

| Próba | Fájl | Előtte → utána | Futtatás | Elvárt bukó teszt |
| --- | --- | --- | --- | --- |
| B2 | `lib/blocks.ts` | `const content = draft.type + "\u0000" + blockIdentity(draft);` → `const content = draft.type + ":" + blockIdentity(draft);` | `… --test lib/blocks.test.ts` | `assignIds output is pinned forever…` |
| B3 | ugyanaz | `.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();` → `.normalize("NFKC").replace(/\s+/g, " ").trim();` | ugyanaz | ugyanaz (a `-2` utótag eltűnik) |
| M1 | `lib/media.ts` | `/^\d+\/[0-9a-f]{16}-\d+\.(avif\|webp)$/` → `/\d+\/[0-9a-f]{16}-\d+\.(avif\|webp)$/` | `… --test lib/media.test.ts` | `isMediaKey accepts exactly…` |
| T1 | `lib/translate.ts` | az `item.items.length === block.items.length &&` sor törlése | `… --test lib/translate.test.ts` | `applyTranslation rejects a list whose items array is shorter…` |
| T4 | ugyanaz | `original.length * 3 + 200` → `original.length * 30 + 200` | ugyanaz | `applyTranslation rejects an answer ~10x the original length…` |

- [ ] **Step 6: Commit**

```bash
git add lib/blocks.test.ts lib/media.test.ts lib/translate.test.ts lib/overrides.test.ts
git commit -m "test: pin block ids and media keys, and table-drive the translation rejects"
```

---

### Task 9: UI: a `Progress` értéke, viselkedés osztálynév helyett, az olvasói állapot átvitele

**Files:**
- Modify: `components/ui/progress.tsx`, `app/components/shell.test.ts`
- Modify: `app/components/post-blocks.test.ts`, `app/(app)/library/[id]/post-editor.test.ts` (71. sor), `lib/nav.test.ts`, `lib/reader-store.test.ts`
- Delete: `app/(app)/library/[id]/post-article.test.ts`

**Interfaces:**
- Consumes: `render` (`lib/test/render.ts`), `mockFetch` (`lib/pipeline/mock-fetch.ts`), `postState`, `loadState` (`lib/reader-store.ts`), `NAV_ITEMS`, `PRIMARY_NAV`, `SOON_NAV` (`lib/nav.ts`)
- Produces: `Progress` (`components/ui/progress.tsx`): a `value` a Radix Root-ra is eljut. A `max` a `...props`-szal eddig is átment.

- [ ] **Step 1: A `Progress` tesztje** (`app/components/shell.test.ts`)

A dinamikus importok közé, a `PostImage` sora után:

```ts
const { Progress } = await import("../../components/ui/progress.tsx");
```

A `ReaderPanel renders the progress bar and every to-do row` tesztben ez a három sor:

```ts
  assert.ok(doc.querySelector('[role="progressbar"]'), "the progress bar renders");
  // components/ui/progress.tsx computes the indicator's own width from `value` directly (a separate,
  // pre-existing issue leaves Root's aria-valuenow unset — out of this task's two named bugs).
```

erre cserélődik:

```ts
  assert.equal(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"), "40");
```

A fájl végére:

```ts
// N11: Radix reads the value from Root; a Progress that keeps `value` to itself renders every bar
// indeterminate, and a screen reader hears no number.
test("Progress reports its value to assistive tech: aria-valuenow, loading below the max, complete at it", () => {
  const bar = (value: number) => {
    const root = render(createElement(Progress, { value, "aria-label": "Week" })).querySelector('[role="progressbar"]');
    return [root?.getAttribute("aria-valuenow"), root?.getAttribute("data-state")];
  };
  assert.deepEqual(bar(40), ["40", "loading"]);
  assert.deepEqual(bar(100), ["100", "complete"]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts`
Elvárt: 2 FAIL.
- `ReaderPanel renders the progress bar…`: `actual: null, expected: '40'`;
- `Progress reports its value…`: `[null, 'indeterminate']` a várt `['40', 'loading']` helyett.

- [ ] **Step 3: A javítás** (`components/ui/progress.tsx`)

```tsx
      {...props}
    >
```

helyett:

```tsx
      value={value}
      {...props}
    >
```

A függvény a `value`-t kiveszi a propok közül, ezért a `{...props}` nem írhatja felül. Az N11 próba `find`-ja erre a sorrendre illeszkedik.

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts`
Elvárt: `ℹ tests 10`, `ℹ pass 10`.

- [ ] **Step 4: Mutációs próba (N11), aztán commit**

Töröld ideiglenesen a `value={value}` sort. Futtatás: ugyanaz. Elvárt: a két teszt újra FAIL. Tedd vissza a sort, és futtasd újra: PASS.

```bash
git add components/ui/progress.tsx app/components/shell.test.ts
git commit -m "fix: report the progress value to assistive tech"
```

- [ ] **Step 5: `post-blocks.test.ts`: egy elrendezés-teszt, az R1, és gyors bukások**

Az audit átírási listája szerint (`:97–123`, `:125–133`, `:135–141`) ez az öt teszt törlődik:
- `both the missing-image box and a loaded image share the same frame`
- `a loaded image's caption sits inside its frame, in mono`
- `the image itself is contained, capped at 80dvh tall, and stacked above the placeholder`
- `a loaded image's placeholder sits behind it, ready to be hidden once the browser fires onload`
- `images, code and video break out of the prose width; paragraphs keep it`

A helyükre (a fájl végére) ez a kettő kerül:

```ts
// The one layout rule kept here (spec 1.4.11): images, code and video break out of the 75ch prose
// width, and an image's caption sits inside its own frame. The rest of the look is checked in a browser.
test("images, code and video break out of the prose width, and a caption sits inside the image's frame", () => {
  const doc = renderBlocks();
  for (const wide of [mirroredImage, codeBlock, youtube]) {
    assert.equal(wrapper(doc, wide)!.classList.contains("max-w-[75ch]"), false, wide.id);
  }
  assert.ok(wrapper(doc, paragraph)!.classList.contains("max-w-[75ch]"));
  assert.equal(wrapper(doc, mirroredImage)!.querySelector("figure figcaption")!.textContent, "Figure 1");
});

// R1: the placeholder is written into a CSS url("…"); anything but a base64 data:image URL could
// break out of it (a tracking url(), an injected declaration).
test("an image's blur placeholder is rendered only when it is a base64 data:image URL", () => {
  const placeholderStyle = (block: Block) =>
    wrapper(render(createElement(PostBlocks, { blocks: [block], language: "en", baseUrl })), block)!
      .querySelector('span[aria-hidden="true"]')
      ?.getAttribute("style") ?? null;
  assert.match(placeholderStyle(mirroredImage) ?? "", /background-image/);
  const injected = { ...mirroredImage, placeholder: 'data:image/png;base64,AAAA"), url("https://evil.test/track' } as Block;
  assert.equal(placeholderStyle(injected), null);
});
```

A `PostBlocks in controls mode gives every block a 40px-tall row…` teszt marad: a 40 px és a kontraszt kimondott követelmény.

A csomópontot `null`-lal hasonlító három sor (Egyeztetés 8.) darabszámra áll át:
- `assert.equal(wrapper(renderBlocks(), repo)!.querySelector("a"), null);` → `assert.equal(wrapper(renderBlocks(), repo)!.querySelectorAll("a").length, 0);`
- `assert.equal(wrapper(doc, invalidVideo)!.querySelector("iframe"), null);` → `assert.equal(wrapper(doc, invalidVideo)!.querySelectorAll("iframe").length, 0);`
- `assert.equal(wrapper(doc, vimeo)!.querySelector(".opacity-40"), null);` → `assert.equal(wrapper(doc, vimeo)!.querySelectorAll(".opacity-40").length, 0);`

`app/(app)/library/[id]/post-editor.test.ts`:
- `assert.equal(form.querySelector("button[aria-pressed]"), null); // the hide toggles sit outside the form` → `assert.equal(form.querySelectorAll("button[aria-pressed]").length, 0); // the hide toggles sit outside the form`

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/post-blocks.test.ts "app/(app)/library/[[]id]/post-editor.test.ts"`
Elvárt: `ℹ tests 14`, `ℹ pass 14` (9 + 5).

- [ ] **Step 6: A `post-article.test.ts` törlése** (az audit átírási listája: tiszta osztálynév-tesztek)

```bash
git rm "app/(app)/library/[id]/post-article.test.ts"
```

A `max-w-6xl`-es oszlopot és a 75ch-s prózát a Playwright-kör nézi, a UX-A e2e futása is ellenőrizte. Az M2 7. és 10. feladata erre a fájlra épít: ott a fájl újra létrejön (Egyeztetés 9., TODO.md).

- [ ] **Step 7: `lib/nav.test.ts`: invariánsok a menü és a mérföldkő helyett**

A `the bar's four primary slots in order, then the soon items` és az `only real pages are links in milestone A` teszt helyére:

```ts
// Invariants, not the milestone's menu: a new item or a new page must not need this test edited.
test("every nav item has a unique id and href and a label in both languages, and a soon item is never a link", () => {
  const ids = NAV_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const hrefs = NAV_ITEMS.flatMap((item) => (item.href ? [item.href] : []));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const item of NAV_ITEMS) {
    assert.ok(item.label.hu.trim() && item.label.en.trim(), item.id);
    if (item.soon) assert.equal(item.href, null, item.id);
  }
  assert.deepEqual([...PRIMARY_NAV, ...SOON_NAV].map((item) => item.id).sort(), [...ids].sort());
});
```

Az `activeNavId` és a `switchesLanguageInPlace` teszt marad.

- [ ] **Step 8: `lib/reader-store.test.ts`: a `postState` és a `loadState`**

Az importok:

```ts
import {
  createReaderStore,
  memorySend,
```

helyett:

```ts
import { mockFetch } from "./pipeline/mock-fetch.ts";
import {
  createReaderStore,
  loadState,
  memorySend,
  postState,
```

A fájl végére:

```ts
// S1: the store rolls a write back only when `send` rejects, so a 4xx/5xx answer has to throw.
// S2: a delete made final by `pagehide` has to outlive the tab, which only `keepalive` allows.
test("postState sends keepalive JSON and throws on a non-2xx answer; loadState reads uncached and throws likewise", async (t) => {
  const seen: { url: string; init?: RequestInit }[] = [];
  let status = 200;
  mockFetch(t, async (url, init) => {
    seen.push({ url, init });
    return Response.json({ id: 7 }, { status });
  });
  assert.deepEqual(await postState({ action: "add_todo", text: "x" }), { id: 7 });
  assert.equal(seen[0].url, "/api/state");
  assert.equal(seen[0].init?.method, "POST");
  assert.equal(seen[0].init?.keepalive, true);
  assert.deepEqual(JSON.parse(String(seen[0].init?.body)), { action: "add_todo", text: "x" });
  status = 500;
  await assert.rejects(() => postState({ action: "delete_todo", id: 1 }), /state write 500/);
  await assert.rejects(() => loadState(), /state read 500/);
  assert.equal(seen.at(-1)?.init?.cache, "no-store");
});
```

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts lib/reader-store.test.ts`
Elvárt: `ℹ tests 23`, `ℹ pass 23` (3 + 20).

- [ ] **Step 9: Mutációs próba**

Minden sorra: alkalmazd, futtasd a fájlt, lásd a FAIL-t, `git checkout -- <fájl>`. Az R1-nek és a V1-nek ezredmásodpercek alatt kell buknia, nem ~25 s alatt `RangeError`-ral (Review Focus 3.).

| Próba | Fájl | Előtte → utána | Futtatás | Elvárt bukó teszt |
| --- | --- | --- | --- | --- |
| R1 | `app/components/post-blocks.tsx` | `block.placeholder && isValidPlaceholder(block.placeholder) ? block.placeholder : undefined` → `block.placeholder` | `… --test app/components/post-blocks.test.ts` | `an image's blur placeholder is rendered only when…` |
| V1 | `lib/post-view.ts` | `[A-Za-z0-9+/=]+$/.test(value)` → `[A-Za-z0-9+/=]+/.test(value)` | ugyanaz | ugyanaz (és a `post-view.test.ts` placeholder-tesztje) |
| R2 | `app/components/post-blocks.tsx` | `    const href = safeHref(span.href, baseUrl);` → `    const href = span.href;` | ugyanaz | `PostBlocks links only what safeHref allows…` |
| R5 | ugyanaz | `    const isHidden = hiddenSet.has(block.id);` → `    const isHidden = false;` | ugyanaz | `PostBlocks in controls mode gives every block a 40px-tall row…` |
| N12 | `lib/nav.ts` | `{ id: "stats", href: null, soon: true,` → `{ id: "stats", href: "/stats", soon: true,` | `… --test lib/nav.test.ts` | `every nav item has a unique id and href…` |
| S1 | `lib/reader-store.ts` | az `if (!response.ok) throw new Error(\`state write ${response.status}\`);` sor törlése | `… --test lib/reader-store.test.ts` | `postState sends keepalive JSON…` |
| S2 | ugyanaz | a `keepalive: true,` sor törlése | ugyanaz | ugyanaz |

- [ ] **Step 10: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 474` (+1 Progress, −3 post-blocks, −2 post-article, −1 nav, +1 reader-store), `Found 0 clones.`

- [ ] **Step 11: Commit**

```bash
git add app/components/post-blocks.test.ts "app/(app)/library/[id]/post-editor.test.ts" lib/nav.test.ts lib/reader-store.test.ts
git commit -m "test: pin post rendering, nav and state transport on behaviour, not classes"
```

A `git rm` a 6. lépésben már stagelte a törlést, ez a commit azt is viszi.

---

### Task 10: Dokumentáció, a végső ellenőrzés és az újrafuttatott mutációs kör

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `TODO.md`

A három fájlt a 2. feladat is szerkesztette. **Olvasd újra őket.** Ahol egy szakasz már tartalmazza az alábbiak egy részét, egészítsd ki, ne ismételd. Ha egy név vagy szám eltér, a kódét írd le.

- [ ] **Step 1: `CLAUDE.md`**

- **Conventions → Tests**, a `lib/pipeline/fake-db.ts` alpont helyett:
  > `lib/pipeline/fake-db.ts`: `fakeDb(route?, tables?)`, an offline Supabase client. `model_settings` answers with `route` and records each task asked for (`.tasks`); `sources` (one `source`, or several `sources`), `posts`, storage and RPCs answer from `tables`. Select filters (`eq`, `neq`, `lt`) are applied to the fixture rows; a column the fixture never set passes every filter, so a test of which row code reads needs a fixture whose `id` and `source_id` differ. A `sources` `single()` that matches no row, or several, answers PGRST116; `pgError(code, message)` builds any other PostgREST-shaped error (`rpcError`, `sourceInsertError`). Every write is recorded (`sourceUpdates`, `sourceInserts`, `postUpserts`, `postUpdates`, `postUpdateFilters`, `rpcCalls`, `upserts`, `writes`, …); storage also answers `download`.
- A `lib/pipeline/mock-fetch.ts` alpontban a `mockDns(t)` szó helyére, és a `geminiPrompt` után ez a két rész kerül:

  ```markdown
  `mockDns(t, ...addresses)` (default: `TEST_IP`; several addresses come back in one answer)
  `geminiSchemaKeys(init)` (which schema a Gemini call asks for: route a fake by it, not by prompt wording)
  ```

- A `lib/test/render.ts` alpont után új alpont:
  > `lib/test/route-hooks.ts`: route-handler tests. Importing it registers `tsx-hooks.ts`, whose `STUBS` map resolves `@/lib/supabase/server` and `next/server` to this file and `server-only` to an empty module. It stands in for both: `getReader` / `getViewer` / `createClient` answer `routeStub.reader` (set it with `signedIn(db, id?)`), `createAdminClient` answers `routeStub.admin` and counts `adminCalls`, `after(task)` queues the task on `routeStub.scheduled`, and `NextResponse` is the real one. Call `resetRoute()` first in every test, import this file by its relative path (a second path would load a second instance), then the route with `await import("./route.ts")`. Every route test file keeps one signed-in case that reaches the handler, so a 401 can't pass vacuously.
- Egy új alpont a Tests alatt:
  > Never hand a linkedom node to `assert`: on failure Node formats the whole document (~25 s, then `RangeError: Array buffer allocation failed`). Compare an attribute, `textContent` or a count.
- **Relative imports in `lib/`**, a „The exceptions are the three Next-only server modules `lib/content.ts`, `lib/language.ts` and `lib/supabase/server.ts`, which tests never load.” mondat helyett:
  > The exceptions are the three Next-only server modules `lib/content.ts`, `lib/language.ts` and `lib/supabase/server.ts`. No test loads `lib/supabase/server.ts` or `lib/language.ts` (route tests get `lib/test/route-hooks.ts` in the first one's place); `lib/content.ts` is loaded by the state route's test, with `server-only` mapped to an empty module.
- **Layout**:
  - az `app/(app)/library/` sorban: „post-article, post-toolbar, post-editor and post-notices each + test” → „post-toolbar, post-editor and post-notices each + test”;
  - az `app/api/` sor végére: „; each route has a `route.test.ts`”;
  - az `app/media/[...path]/` sor végére: „(+ test)”;
  - a `lib/test/` sorban: „render harness for component tests (render, tsx-hooks, next-stub)” → „render harness for component tests (render, tsx-hooks, next-stub) and the route-handler stubs (route-hooks)”.
- **Hand-authored components**, a `progress.tsx`-es pont végére:
  > `progress.tsx` also forwards `value` to Radix's Root. The registry's version keeps it back, which leaves every bar `data-state="indeterminate"` with no `aria-valuenow`; `app/components/shell.test.ts` pins it.

- [ ] **Step 2: `README.md`**

- **Testing → Helpers**, a pont végére:
  > The fake applies `eq`, `neq` and `lt` filters to its fixture rows and answers PostgREST-shaped errors (`pgError`).
- **Testing**, a **Components** pont után új pont:
  > - **Routes:** [`lib/test/route-hooks.ts`](lib/test/route-hooks.ts) stands in for `@/lib/supabase/server` and `next/server`, so a route handler runs under `node --test` with no Next.js server. A route test looks like this:
  >
  >   ```ts
  >   import { resetRoute, routeStub, signedIn } from "../../../lib/test/route-hooks.ts"; // first: it registers the loader
  >   const { POST } = await import("./route.ts");
  >
  >   resetRoute();
  >   routeStub.reader = signedIn(fakeDb());
  >   const response = await POST(new Request("http://localhost/api/state", { method: "POST", body: "{}" }));
  >   ```
- **Testing → What the tests don't cover**: a „the interactive UI, real RLS policies, live model calls and live websites” helyett: „the interactive UI, `proxy.ts` and the auth routes, real RLS policies, live model calls and live websites”.
- **Conventions → Relative imports**, a „which use `@/` and are never loaded by tests.” helyett: „which use `@/`. Tests never load `lib/supabase/server.ts` or `lib/language.ts`; the state route's test loads `lib/content.ts`.”
- **Project tour**, a `lib/test/` sor: „The offline render harness for component tests, and a `Post` fixture (`testPost`)” → „The offline render harness for component tests, the route-handler stubs (`route-hooks.ts`), and a `Post` fixture (`testPost`)”.

- [ ] **Step 3: `TODO.md`**

A „B. Funkciók → ### Kész” lista végére:

```markdown
- [x] **Teszt-keményítés és CI** (2026-09-25): route-tesztek a route-teszt réteggel, a `safeFetch` minden hívóhelye, a `fakeDb` szűrői, rögzített blokk-id-k, a `Progress` értéke a képernyőolvasónak, GitHub Actions CI az öt ellenőrzéssel. Terv: [docs/superpowers/plans/2026-09-25-test-hardening.md](docs/superpowers/plans/2026-09-25-test-hardening.md).
```

- [ ] **Step 4: Teljes ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, `ℹ tests 474`, `Found 0 clones.`

Feladatonként: 1. → +2, 3. → +5, 4. → +12, 5. → +2, 6. → +4, 7. → 0, 8. → +1, 9. → −4, összesen 452 → 474. Ha eltér, a tesztneveket vesd össze ezzel a tervvel.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md TODO.md
git commit -m "docs: document the route test layer and the hardened fakes"
```

- [ ] **Step 6: Az audit próbáinak újrafuttatása, friss fán**

Egy leválasztott worktree-ben fut, így egy megszakadt futás sem hagy mutánst a munkafában. A két segédfájl a repón kívülre kerül (a munkamenet scratchpadjába, vagy a `../th-mutants-tools/` mappába), és nem commitolódik.

`../th-mutants-tools/run-probes.mjs`:

```js
// Applies each probe to the tree one at a time, runs `npm test`, and restores the file.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const [, , tree, probesPath] = process.argv;
for (const probe of JSON.parse(readFileSync(probesPath, "utf8"))) {
  const path = join(tree, probe.file);
  const original = readFileSync(path, "utf8");
  const count = original.split(probe.find).length - 1;
  if (count === 0 || (count > 1 && !probe.all)) {
    console.log(`${probe.id}\tERROR\tfind matched ${count} times`);
    continue;
  }
  writeFileSync(path, probe.all ? original.split(probe.find).join(probe.replace) : original.replace(probe.find, () => probe.replace));
  try {
    const run = spawnSync("npm test", { cwd: tree, shell: true, encoding: "utf8", timeout: 300_000 });
    const failing = (run.stdout ?? "").split("\n").find((line) => line.startsWith("✖") && !line.includes("failing tests"));
    console.log(`${probe.id}\t${run.status === 0 ? "SURVIVED" : "KILLED"}\t${failing ?? ""}`);
  } finally {
    writeFileSync(path, original);
  }
}
```

`../th-mutants-tools/probes.json`. Ebben az audit 81 próbája van (`.superpowers/sdd/test-audit.md`, 2. fejezet, pontos szöveggel; a G1b, H1–H3 és I8/I9 az audit pótlólagos futásaiból), és az N1–N13:

```json
[
  {"id": "F1", "file": "lib/pipeline/fetch.ts", "find": "        redirect: \"manual\",\n", "replace": ""},
  {"id": "F2", "file": "lib/pipeline/fetch.ts", "find": "addresses.some(({ address }) => isPrivateAddress(address))", "replace": "addresses.every(({ address }) => isPrivateAddress(address))"},
  {"id": "F3", "file": "lib/pipeline/fetch.ts", "find": "hop < 5;", "replace": "hop < 6;"},
  {"id": "F4", "file": "lib/pipeline/fetch.ts", "find": "    if (size > limit) {", "replace": "    if (size > limit * 2) {"},
  {"id": "F5", "file": "lib/pipeline/fetch.ts", "find": "  const url = parseSubmittedUrl(raw);\n  if (!url) throw new FetchError(\"blocked url\");", "replace": "  const url = new URL(raw);"},
  {"id": "U1", "file": "lib/pipeline/util.ts", "find": "url.origin === SAME_SITE && new URL(path, SAME_SITE).origin === SAME_SITE ? path : \"/\"", "replace": "url.origin === SAME_SITE ? path : \"/\""},
  {"id": "U2", "file": "lib/pipeline/util.ts", "find": "typeof value !== \"string\" || !value.startsWith(\"/\")", "replace": "typeof value !== \"string\""},
  {"id": "U3", "file": "lib/pipeline/util.ts", "find": "/^[1-9]\\d{0,15}$/", "replace": "/^\\d{1,16}$/"},
  {"id": "U4", "file": "lib/pipeline/util.ts", "find": "    host.endsWith(\".internal\") ||\n", "replace": ""},
  {"id": "U5", "file": "lib/pipeline/util.ts", "find": "    host.endsWith(\".local\") ||\n", "replace": ""},
  {"id": "U6", "file": "lib/pipeline/util.ts", "find": "(a === 172 && b >= 16 && b <= 31)", "replace": "(a === 172 && b >= 17 && b <= 31)"},
  {"id": "U7", "file": "lib/pipeline/util.ts", "find": "/^fe[89ab]/", "replace": "/^fe8/"},
  {"id": "U8", "file": "lib/pipeline/util.ts", "find": "a === 0 || a === 10 || a === 127 || a >= 224 ||", "replace": "a === 0 || a === 10 || a === 127 || a > 224 ||"},
  {"id": "U9", "file": "lib/pipeline/util.ts", "find": "  if (groups[0] === 0x2002) return quad(groups[1], groups[2]);\n", "replace": ""},
  {"id": "U10", "file": "lib/pipeline/util.ts", "find": "(?:v\\d+)?(?:\\.pdf)?\\/?$/i", "replace": "(?:v\\d+)?\\/?$/i"},
  {"id": "U11", "file": "lib/pipeline/util.ts", "find": "return fnv1a(text).slice(0, 6);", "replace": "return fnv1a(text).slice(2, 8);"},
  {"id": "U12", "file": "lib/pipeline/util.ts", "find": "${shortHash(url)}`.slice(0, 120);", "replace": "${shortHash(url)}`.slice(0, 128);"},
  {"id": "B1", "file": "lib/blocks.ts", "find": "url.protocol === \"http:\" || url.protocol === \"https:\" ? url.toString() : undefined", "replace": "url.protocol !== \"javascript:\" ? url.toString() : undefined"},
  {"id": "B2", "file": "lib/blocks.ts", "find": "const content = draft.type + \"\\u0000\" + blockIdentity(draft);", "replace": "const content = draft.type + \":\" + blockIdentity(draft);"},
  {"id": "B3", "file": "lib/blocks.ts", "find": ".normalize(\"NFKC\").toLowerCase().replace(/\\s+/g, \" \").trim();", "replace": ".normalize(\"NFKC\").replace(/\\s+/g, \" \").trim();"},
  {"id": "B4", "file": "lib/blocks.ts", "find": "if (kept.length >= maxBlocks ||", "replace": "if (kept.length > maxBlocks ||"},
  {"id": "B5", "file": "lib/blocks.ts", "find": "(chars > maxChars && kept.length > 0)", "replace": "(chars > maxChars)"},
  {"id": "M1", "file": "lib/media.ts", "find": "/^\\d+\\/[0-9a-f]{16}-\\d+\\.(avif|webp)$/", "replace": "/\\d+\\/[0-9a-f]{16}-\\d+\\.(avif|webp)$/"},
  {"id": "V1", "file": "lib/post-view.ts", "find": "[A-Za-z0-9+/=]+$/.test(value)", "replace": "[A-Za-z0-9+/=]+/.test(value)"},
  {"id": "V2", "file": "lib/post-view.ts", "find": "  if (!widths.every((width) => isMediaKey(variantPath(path, width, format)))) return null;\n", "replace": ""},
  {"id": "R1", "file": "app/components/post-blocks.tsx", "find": "block.placeholder && isValidPlaceholder(block.placeholder) ? block.placeholder : undefined", "replace": "block.placeholder"},
  {"id": "R2", "file": "app/components/post-blocks.tsx", "find": "    const href = safeHref(span.href, baseUrl);", "replace": "    const href = span.href;"},
  {"id": "R3", "file": "app/components/post-blocks.tsx", "find": "      const href = safeHref(block.url, baseUrl);", "replace": "      const href = block.url;"},
  {"id": "R4", "file": "app/components/post-blocks.tsx", "find": "    const href = safeHref(block.originalUrl, baseUrl);", "replace": "    const href = block.originalUrl;"},
  {"id": "R5", "file": "app/components/post-blocks.tsx", "find": "    const isHidden = hiddenSet.has(block.id);", "replace": "    const isHidden = false;"},
  {"id": "E1", "file": "lib/post-edit.ts", "find": "a.hu.trim() === b.hu.trim() && a.en.trim() === b.en.trim()", "replace": "a.hu === b.hu && a.en === b.en"},
  {"id": "E2", "file": "lib/post-edit.ts", "find": "if (source?.submitted_by !== viewerId) return { status: \"forbidden\" };", "replace": "if (source && source.submitted_by !== viewerId) return { status: \"forbidden\" };"},
  {"id": "E3", "file": "lib/post-edit.ts", "find": "    .select(\"source_id, extracted_at, sources(submitted_by)\")\n    .eq(\"id\", postId)", "replace": "    .select(\"source_id, extracted_at, sources(submitted_by)\")\n    .eq(\"source_id\", postId)"},
  {"id": "E4", "file": "lib/post-edit.ts", "find": "  if (!claimed || claimed.length === 0) {", "replace": "  if (!claimed) {"},
  {"id": "E5", "file": "lib/post-edit.ts", "find": "update({ extracted_at: now.toISOString() }).eq(\"id\", postId);", "replace": "update({ extracted_at: now.toISOString() });"},
  {"id": "E6", "file": "lib/post-edit.ts", "find": "  const hidden = parsed.data.hidden.filter((id) => knownIds.has(id));", "replace": "  const hidden = parsed.data.hidden;"},
  {"id": "E7", "file": "lib/post-edit.ts", "find": "const { data: post, error: selectError } = await db.from(\"posts\").select(\"id, blocks\").eq(\"id\", postId).maybeSingle();", "replace": "const { data: post, error: selectError } = await db.from(\"posts\").select(\"id, blocks\").eq(\"source_id\", postId).maybeSingle();"},
  {"id": "T1", "file": "lib/translate.ts", "find": "        item.items.length === block.items.length &&\n", "replace": ""},
  {"id": "T2", "file": "lib/translate.ts", "find": "if (!updated || updated.length === 0) return \"stale\";", "replace": "if (!updated) return \"stale\";"},
  {"id": "T3", "file": "lib/translate.ts", "find": "  if (parseTranslatedBlocks(post.blocks_hu)) return \"ok\";", "replace": "  if (post.blocks_hu) return \"ok\";"},
  {"id": "T4", "file": "lib/translate.ts", "find": "original.length * 3 + 200", "replace": "original.length * 30 + 200"},
  {"id": "T5", "file": "lib/translate.ts", "find": "const guarded = post.extracted_at === null ? scoped.is(\"extracted_at\", null) : scoped.eq(\"extracted_at\", post.extracted_at);", "replace": "const guarded = scoped;"},
  {"id": "I1", "file": "lib/pipeline/extract/index.ts", "find": "new Set([\"article\", \"x\", \"youtube\"])", "replace": "new Set([\"x\", \"youtube\"])"},
  {"id": "I2", "file": "lib/pipeline/extract/index.ts", "find": "new Set([\"pdf\", \"youtube\", \"x\"])", "replace": "new Set([\"pdf\", \"youtube\", \"x\", \"arxiv\"])"},
  {"id": "I3", "file": "lib/pipeline/ingest.ts", "find": "return hasPrevious ? { error } : { status: \"failed\", error };", "replace": "return { status: \"failed\", error };"},
  {"id": "I4", "file": "lib/pipeline/ingest.ts", "find": "failureUpdate(saved || Boolean(existing), message)", "replace": "failureUpdate(Boolean(existing), message)"},
  {"id": "I5", "file": "lib/pipeline/ingest.ts", "find": "new Set([\"article\", \"github\", \"arxiv\"])", "replace": "new Set([\"article\", \"arxiv\"])"},
  {"id": "I6", "file": "lib/pipeline/ingest.ts", "find": "...post, blocks_hu: null, extracted_at", "replace": "...post, extracted_at"},
  {"id": "I7", "file": "lib/pipeline/ingest.ts", "find": "if (deadline !== undefined && deadline - Date.now() < START_GATE_RESERVE_MS) break;", "replace": "if (deadline !== undefined && deadline - Date.now() < 0) break;"},
  {"id": "S1", "file": "lib/reader-store.ts", "find": "  if (!response.ok) throw new Error(`state write ${response.status}`);\n", "replace": ""},
  {"id": "S2", "file": "lib/reader-store.ts", "find": "    keepalive: true,\n", "replace": ""},
  {"id": "S3", "file": "lib/reader-store.ts", "find": "if (newest.get(key) === writeId) show(confirmed.get(key) ?? current);", "replace": "show(confirmed.get(key) ?? current);"},
  {"id": "S4", "file": "lib/reader-store.ts", "find": "loadedStates: initial ? snapshot.loadedStates : data.states,", "replace": "loadedStates: data.states,"},
  {"id": "Q1", "file": "lib/undo-queue.ts", "find": "      replaced?.commit?.();\n", "replace": ""},
  {"id": "Q2", "file": "lib/undo-queue.ts", "find": "      if (current) take(current.id)?.commit?.();", "replace": "      current?.commit?.();"},
  {"id": "K1", "file": "lib/keymap.ts", "find": "  if (press.repeat && action !== \"next\" && action !== \"previous\") return null;\n", "replace": ""},
  {"id": "K2", "file": "lib/keymap.ts", "find": "if (!letter && !press.metaKey && (press.altKey || !press.ctrlKey))", "replace": "if (!letter && (press.altKey || !press.ctrlKey))"},
  {"id": "D1", "file": "lib/feed.ts", "find": "(item.mustRead ? 0 : 2)", "replace": "(item.mustRead ? 0 : 1)"},
  {"id": "D2", "file": "lib/feed.ts", "find": "  return sortUnreadFirst(visible, loadedStates);", "replace": "  return sortUnreadFirst(visible, states);"},
  {"id": "P1", "file": "lib/public-paths.ts", "find": "  nodeEnv === \"development\" && pathname.startsWith(\"/dev/\");", "replace": "  pathname.startsWith(\"/dev/\");"},
  {"id": "P2", "file": "lib/public-paths.ts", "find": "\"/auth/\", \"/api/\"", "replace": "\"/auth\", \"/api/\""},
  {"id": "A1", "file": "lib/state.ts", "find": "const ITEM_ID_MAX = 120;", "replace": "const ITEM_ID_MAX = 200;"},
  {"id": "A2", "file": "lib/state.ts", "find": "const flag = z.boolean().catch(false);", "replace": "const flag = z.coerce.boolean().catch(false);"},
  {"id": "L1", "file": "lib/llm.ts", "find": "  return schema.parse(JSON.parse(text));", "replace": "  return JSON.parse(text);"},
  {"id": "L2", "file": "lib/llm.ts", "find": "if (data.fallback_provider && data.fallback_model) routes.push", "replace": "if (false) routes.push"},
  {"id": "G1", "file": "lib/pipeline/images.ts", "find": "await safeFetch(image.originalUrl,", "replace": "await fetch(image.originalUrl,"},
  {"id": "G2", "file": "lib/pipeline/images.ts", "find": "limitInputPixels: PIXEL_LIMIT", "replace": "limitInputPixels: false", "all": true},
  {"id": "G3", "file": "lib/pipeline/images.ts", "find": "const MAX_BYTES = 5 * 1024 * 1024;", "replace": "const MAX_BYTES = 500 * 1024 * 1024;"},
  {"id": "W1", "file": "lib/pipeline/daily.ts", "find": "  if (candidates.length <= SHORTLIST) return candidates;", "replace": "  return candidates;"},
  {"id": "W2", "file": "lib/pipeline/daily.ts", "find": "    .slice(0, 10)\n", "replace": ""},
  {"id": "X1", "file": "app/api/cron/daily/route.ts", "find": "if (!secret || request.headers.get(\"authorization\") !== `Bearer ${secret}`)", "replace": "if (secret && request.headers.get(\"authorization\") !== `Bearer ${secret}`)"},
  {"id": "X2", "file": "app/media/[...path]/route.ts", "find": "  if (!isMediaKey(key)) return new Response(\"not found\", { status: 404 });\n", "replace": ""},
  {"id": "X3", "file": "app/api/state/route.ts", "find": "parsed.action === \"set_read\" ? \"is_read\" : \"is_saved\"", "replace": "parsed.action === \"set_read\" ? \"is_saved\" : \"is_read\""},
  {"id": "X4", "file": "proxy.ts", "find": "if (!data?.claims && !isPublicPath(pathname))", "replace": "if (!data?.claims && isPublicPath(pathname))"},
  {"id": "X5", "file": "app/api/sources/route.ts", "find": "  const url = parseSubmittedUrl(String(body.url ?? \"\"));", "replace": "  const url = new URL(String(body.url ?? \"\"));"},
  {"id": "G1b", "file": "lib/pipeline/images.ts", "find": "await safeFetch(image.originalUrl, { accept: \"image/avif,image/webp,image/*;q=0.8\", timeoutMs: FETCH_TIMEOUT_MS }),", "replace": "await fetch(image.originalUrl, { headers: { accept: \"image/avif,image/webp,image/*;q=0.8\" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),"},
  {"id": "H1", "file": "lib/pipeline/extract/article.ts", "find": "await safeFetch(url, { accept: \"text/html,application/xhtml+xml,application/pdf;q=0.9\" })", "replace": "await fetch(url, { headers: { accept: \"text/html,application/xhtml+xml,application/pdf;q=0.9\" } })"},
  {"id": "H2", "file": "lib/pipeline/extract/pdf.ts", "find": "await safeFetch(url, { accept: \"application/pdf\" })", "replace": "await fetch(url, { headers: { accept: \"application/pdf\" } })"},
  {"id": "H3", "file": "lib/pipeline/extract/index.ts", "find": "await safeFetch(url, { accept: \"text/html\" })", "replace": "await fetch(url, { headers: { accept: \"text/html\" } })"},
  {"id": "I8", "file": "lib/pipeline/ingest.ts", "find": "    .lt(\"attempts\", MAX_ATTEMPTS)", "replace": "    .lt(\"attempts\", 99)"},
  {"id": "I9", "file": "lib/pipeline/ingest.ts", "find": "    .neq(\"status\", \"done\")", "replace": "    .eq(\"status\", \"done\")"},
  {"id": "N1", "file": "app/api/cron/daily/route.ts", "find": "await runDaily(db).catch((error: unknown) => {\n    console.error(\"daily digest failed\", error);\n    return null;\n  });", "replace": "await runDaily(db);"},
  {"id": "N2", "file": "app/media/[...path]/route.ts", "find": "\"private, max-age=31536000, immutable\"", "replace": "\"public, max-age=31536000, immutable\""},
  {"id": "N3", "file": "app/api/sources/route.ts", "find": "  if (error?.code === \"23505\") return jsonError(409, \"already_submitted\");\n", "replace": ""},
  {"id": "N4", "file": "app/api/sources/route.ts", "find": "  after(() => processSource(createAdminClient(), data.id));\n", "replace": ""},
  {"id": "N5", "file": "app/api/posts/[id]/reextract/route.ts", "find": "requestReextract(admin, reader.viewer.id, postId, new Date())", "replace": "requestReextract(admin, reader.viewer.email, postId, new Date())"},
  {"id": "N6", "file": "app/api/posts/[id]/reextract/route.ts", "find": "after(() => processSource(admin, result.sourceId));", "replace": "after(() => processSource(admin, postId));"},
  {"id": "N7", "file": "app/api/posts/[id]/reextract/route.ts", "find": "jsonError(429, \"cooldown\", { retryAfter: result.retryAfter })", "replace": "jsonError(429, \"cooldown\")"},
  {"id": "N8", "file": "app/api/posts/[id]/route.ts", "find": "  ...POST_ERRORS,\n", "replace": "  ...POST_ERRORS,\n  forbidden: POST_ERRORS.not_found,\n"},
  {"id": "N9", "file": "app/api/posts/[id]/translate/route.ts", "find": "await reader.db.from(\"posts\").select(\"id\")", "replace": "await createAdminClient().from(\"posts\").select(\"id\")"},
  {"id": "N10", "file": "lib/pipeline/fetch.ts", "find": "    const url = await checkedHop(current);", "replace": "    const url = hop === 0 ? new URL(current) : await checkedHop(current);"},
  {"id": "N11", "file": "components/ui/progress.tsx", "find": "      value={value}\n      {...props}", "replace": "      {...props}"},
  {"id": "N12", "file": "lib/nav.ts", "find": "{ id: \"stats\", href: null, soon: true,", "replace": "{ id: \"stats\", href: \"/stats\", soon: true,"},
  {"id": "N13", "file": "lib/pipeline/images.ts", "find": "timeoutMs: FETCH_TIMEOUT_MS })", "replace": "})"}
]
```

Futtatás (Git Bash, a repó gyökeréből):

```bash
git worktree add ../th-mutants HEAD --detach
(cd ../th-mutants && corepack pnpm@11.25.0 install --frozen-lockfile --offline)
node ../th-mutants-tools/run-probes.mjs ../th-mutants ../th-mutants-tools/probes.json | tee ../th-mutants-tools/result.tsv
git -C ../th-mutants status --short
git worktree remove --force ../th-mutants
git status --short
```

A futás kb. 94 × 5 s. Ha az `--offline` telepítés hiányzó csomag miatt bukik, futtasd nélküle. A worktree-ben a `git status --short` üres (minden fájl visszaállt), a munkafában szintén üres.

Elvárt, a prototípus futása alapján:
- **ERROR: 0.** Minden `find` pontosan egyszer illeszkedik, a G2 kétszer (`"all": true`).
- **Az audit 81 próbájából 74 KILLED** (korábban 48). A 33 korábbi túlélőből 26 most meghal: F1, F2, U4–U7, B2, M1, R1, E3, E7, I7, I8, S1, S2, G1b, G2, G3, H1, H2, H3, W1, X1, X2, X3, X5. A G1 és az I9 eddig csak mellékesen halt meg, most egy saját teszt öli meg őket.
- **SURVIVED, indokkal:**

  | Próba | Miért marad |
  | --- | --- |
  | U12 | ekvivalens (az audit szerint): a slug ≤ 60, a kategória ≤ 9 karakter, így az id ≤ 81 karakter, és a 120-as vágás soha nem fut |
  | D1 | ekvivalens (az audit szerint): a szerver must-read-első sorrendje mellett a rangsúly nem látszik |
  | U10 | az audit „next after these” listája, TODO.md (Technikai adósság) |
  | I2 | ugyanaz |
  | I5 | ugyanaz |
  | P2 | nem része a top-15-nek és az átírási listának; egy tesztsor, TODO.md |
  | X4 | a `proxy.ts`-hez `@supabase/ssr`-helyettes kell; TODO.md |

- **N1–N13: mind a 13 KILLED.**

Ha egy próba az elvártól eltérően viselkedik, előbb nézd meg, egyezik-e a `find` a fájllal (ERROR), aztán hogy a megölő teszt benne van-e a fában. Egy váratlan túlélőre előbb teszt kerül, külön `test:` committal, és csak utána lehet lezárni az ágat.

- [ ] **Step 7: Az első CI-futás** (a tulajdonos pusha után)

A push a tulajdonosé: `! git push -u origin test-hardening`. Utána:

```bash
gh run list --branch test-hardening --limit 1
gh run watch
```

Elvárt: a `CI` workflow `checks` jobja zöld (Review Focus 4.). Ha piros, a hiba a Linux-futón jött elő, és helyben nem látszott. Tipikus ok egy kis- és nagybetű-eltérés egy importban vagy tesztútban. Előbb egy teszt, ami helyben is megfogja, ha lehet, aztán a javítás, külön `fix:` commitban. Zöld futás után jöhet a TODO.md A/6-os branch-védelme.

---

## Önellenőrzés

**1. Lefedettség (a spec pontjai → feladat)**

| Spec | Feladat |
| --- | --- |
| Döntés 1: CI az öt ellenőrzéssel, push és PR, SHA-ra rögzített actionök, corepack pnpm 11.25.0, Node 24, Dependabot 7 napos cooldownnal, `permissions:` | 2 |
| Döntés 1: a branch-védelem TODO | 2 (TODO A/6) |
| Döntés 2: a Playwright és a DB-teszt TODO-opció a költségével | 2 |
| Döntés 3: a `fakeDb` hűsége (`eq` / `neq` / `lt`, PostgREST-alakú hibák) | 1 (szűrők, `pgError`, `PGRST116`), 3 (`download`), 4 (`insert`, `sourceInsertError`) |
| Döntés 3: a route-réteg (`@/lib/supabase/server`, `server-only`, `next/server`) | 3 |
| Döntés 3: route-tesztek: cron, `/media`, sources, state, `posts/[id]` | 3, 4 |
| Top-15 #1 G1b | 6 |
| Top-15 #2 H1–H3 | 6 |
| Top-15 #3 F1, F2, privát első ugrás | 5 |
| Top-15 #4 X1 | 3 |
| Top-15 #5 X2, M1 a route-on | 3 |
| Top-15 #6 reextract: viewer id, 403 nem ütemez, 429 `retryAfter` | 4 |
| Top-15 #7 X5, 23505 → 409, 202 + `after`; X3 | 4 |
| Top-15 #8 E3, E7 | 1 |
| Top-15 #9 B2 | 8 |
| Top-15 #10 smoke renderek | a UX-A-ban kész (`shell.test.ts`), nem tervezzük újra; a 9. feladat a `ReaderPanel` tesztjére épít |
| Top-15 #11 S1, S2 | 9 |
| Top-15 #12 U4–U7 határai | 5 |
| Top-15 #13 M1 (`lib/media.test.ts`), R1 | 8, 9 |
| Top-15 #14 G2, G3 | 6 |
| Top-15 #15 I7, I8, W1 | 1 (I8), 7 (I7, W1) |
| Átírás: `post-blocks.test.ts` | 9 |
| Átírás: `post-article.test.ts` törlése | 9 |
| Átírás: `nav.test.ts` invariánsai | 9 |
| Átírás: `overrides.test.ts:47–56` | 8 |
| Átírás: `translate.test.ts` táblázat | 8 |
| Átírás: `fetch.test.ts:28–38` összevonás | 5 |
| Átírás: `images.test.ts:235–253` lógó válasz | 6 |
| Átírás: `ingest.test.ts:58–97` sémakulcs | 7 |
| Átírás: a duplikált YouTube-teszt | 7 |
| A `Progress` hibája (koordinátor) | 9 |
| Az audit „next after these” listája → TODO | 2 |
| Minden új teszt egy próbára hivatkozik, és van mutációs lépése | 1, 3–9 (a táblázatok), 2 (a rögzítés próbája) |
| A végső futás: minden korábbi, nem ekvivalens túlélő meghal, vagy indokkal szerepel | 10 |

**2. Placeholder-keresés.** Nincs „TBD”, „később”, „hasonlóan a …-hoz”, és nincs kód nélküli kódlépés. Ahol egy lépés meglévő fájlt módosít, idézi a pontos „előtte” és „utána” szöveget, vagy név szerint sorolja a törlendő teszteket. Minden elvárt kimenet (tesztszám, hibaüzenet, JSON-sor) a prototípus futásából származik.

**3. Nevek és típusok a feladatok között:**
- `pgError`, `PostgrestErrorShape`, `FakeIngestTables.sources` (1.) → a 3. és 4. feladat tesztjei és a `route-hooks.ts` nem ismételik őket, importálják.
- `sourceInsertError`, `sourceInserts` (4.) → csak a sources route-teszt használja.
- `routeStub` (`reader`, `admin`, `adminCalls`, `scheduled`), `resetRoute()`, `signedIn(db, id = "owner")` (3.) → a 4. feladat öt tesztje ugyanezekkel a nevekkel.
- `STUBS` (3.) váltja a `STUBBED`-et és a `stub`-ot; a `resolve` törzsében a helyi `stub` változó a térkép értéke.
- `mockDns(t, ...addresses)` (5.) → a 6. feladat `mockDns(t, "10.0.0.1")` hívásai ezzel a szignatúrával mennek.
- `geminiSchemaKeys` (7.) → a `daily.test.ts` és az `ingest.test.ts` (`isCleanup`) használja.
- Az N1–N13 próbák `find` szövege a 3–9. feladat végállapotára illeszkedik: az N11 a 9. feladat javítása után létező `value={value}` sorra.

**4. Review Focus.** Mind az öt ponthoz tartozik teszt vagy lépés a saját feladatában: 1 → 3. és 4. (a bejelentkezett esetek), 2 → 1. és 4., 3 → 9., 4 → 10. (7. lépés), 5 → 4., 6. és 7.

## Nyitott kérdések a felhasználónak

1. **Milyen legyen a `main` branch-védelme?** Ma a munka ágakon folyik, a `main` fast-forwarddal kap új commitot, és te pusholod. **Ajánlás:** egy ruleset a `checks` kötelező státuszával, force push és törlés tiltásával, de PR-kötelezettség nélkül. Így a mostani menet marad: előbb az ág pusha és a zöld CI, utána a `main` fast-forwardja. A GitHub csak olyan commitot enged a `main`-re, amelyen a CI már lefutott. A lépések a TODO.md A/6 pontjában vannak.
2. **Töröljük-e a `post-article.test.ts`-t, ha az M2 terv 7. és 10. feladata erre a fájlra épít?** **Ajánlás:** igen, az audit szerint. A két teszt tiszta osztálynév-rögzítés, a szélességet a böngészős kör nézi. Az M2-ben a fájl a saját tesztjeivel születik újra (három sor fejléc), és ez a TODO.md M2-sorában is ott áll.
3. **A megmaradt öt nem ekvivalens túlélő (I2, I5, U10, P2, X4) most jöjjön, vagy maradjon TODO?** **Ajánlás:** maradjon TODO, ahogy a döntésed hatóköre szól. Az I2, az I5 és az U10 egy-egy kinyerő-teszt a taiyaki után. A P2 egy sor, és mehet bármelyik kis PR-rel. Az X4-hez az `@supabase/ssr` helyettese kell a route-rétegben, az külön kis munka.
