# R1 „Gyors” — specifikáció

**Dátum:** 2026-09-27 · **Állapot:** jóváhagyásra vár · **Sorrend:** a taiyaki után, az M2 előtt; a reszponzív munka első része (R1 Gyors → R2 Visszajelzés → R3 Elrendezés, mindegyik saját specifikációval, tervvel és review-val)

**Alapja:**

- a 2026-09-27-i reszponzív audit megállapításai: minden bejelentkezett oldal soros Supabase-körökre vár; navigációnál nincs visszajelzés, egyetlen közös ink váz szolgál ki minden oldalt, és a mobil Archívum-link a „Több” panelben nincs előtöltve; a `router.refresh()`-es műveletek jelzés nélkül várnak; a zod a `/`, az `/archive/[week]` és a `/library/[id]` kliens csomagjában van; és a lassú `/archive` elemzése;
- a 2026-09-27-i élő és helyi alapmérés (Kontextus, Célok);
- a [TODO.md](../../../TODO.md) „Responzívabb UI/UX”, „Lassú archívum”, „Kevesebb getClaims() kérésenként” és „Apró rendrakás a taiyaki után” pontja; az ütemterv: [TODO.md → Következő lépések](../../../TODO.md).

## Kontextus

A tulajdonos két értelemben kérte, hogy az app reszponzív legyen: legyen fürge, és minden méreten legyen jó. Az R1 az első rész: a szerveroldali út, a navigáció visszajelzése és a kliens csomagja.

Rögzített tények (a tulajdonostól, 2026-09-27):

- A Supabase-projekt `eu-west-1`-ben (Írország), a Vercel-függvények `fra1`-ben (Frankfurt) futnak, Hobby csomagon, amely egy régiót enged.
- A JWT-aláíró kulcs ECC (P-256). A `getClaims()` ezért meleg példányon helyben ellenőriz, a JWKS-t 10 percig tárolja. Az auth-körök nem a fő költség. Ami marad: a régiók közti DB-kör, a soros lekérdezések és a hiányzó visszajelzés.

Az élő alapmérés egyszeri, csak olvasó, bejelentkezett, szkriptből futó munkamenet volt, kijelentkezéssel zárva. A válaszfejléc `x-vercel-id`-je `fra1::fra1` volt.

| Útvonal | Első kérés TTFB | Meleg TTFB (4 futás) | Meleg medián TTFB | Meleg medián teljes |
| --- | --- | --- | --- | --- |
| `/archive` | 967 ms | 118 / 87 / 93 / 95 ms | 95 ms | 141 ms |
| `/` | 413 ms | 88 / 91 / 100 / 89 ms | 91 ms | 358 ms |
| `/login` (kijelentkezve) | 3040 ms | – | – | – |

**A meleg válasz már gyors, kb. 90 ms.** Amit a tagok lassúnak éreznek, az egy ritkán hívott Hobby-függvény hideg indulása: az első találat 1–3 s, és közben semmi nem mozdul. Ezért az R1 legnagyobb élő nyeresége az érzékelt sebesség: az oldalformájú vázak, a függő pont, a felső sáv és a prefetch. Így egy hideg indulás sem tűnik fagyásnak.

A szerveroldali pontok ettől még számítanak. A `dub1` minden lekérdezésből kiveszi a Frankfurt–Írország kört, a kevesebb lekérdezés és a kisebb csomag pedig minden kérésen spórol. A hideg indulást viszont egyik sem szünteti meg.

**Zárt hét még nincs.** Az első kiadás, a 2026-W39, még nyitott, ezért az `/archive` az üres állapotát mutatja, és archivált hetet nem lehetett mérni. A W39 2026-09-28 00:00 UTC-kor zárul, a zárt hetek gyorsítótára tehát a második héttől hoz.

A Next-hivatkozások (`loading.md`, `unstable_cache.md` és a többi) a telepített 16.3.4 dokumentációjára mutatnak, a `node_modules/next/dist/docs/` alatt.

## Célok és sikerkritériumok

Célok:

1. Egy kattintás 100 ms-on belül látható választ ad, hideg indulásnál is.
2. Kevesebb Supabase-hívás, párhuzamosan, és a függvény a Supabase mellett fut.
3. A zod nincs a kliens csomagjában.

| Kritérium | Előtte (2026-09-27) | Cél | Ellenőrzés |
| --- | --- | --- | --- |
| Visszajelzés kattintás után | előtöltött link: a közös ink váz; nem előtöltött: semmi, amíg a szerver nem válaszol | 100 ms-on belül látható: a váz felülete vagy a függő pont, hideg indulásnál is (a kivételek a 2.5-ben) | Playwright az előnézeten (5.); élesben a tulajdonos saját érzése |
| `GET /api/state` a hidratáció után | a `/` és az `/archive/[week]` minden felcsatolásakor egy | friss betöltésnél és előre navigálásnál nincs; Vissza után egy | a seed-szabály egységtesztje; élesben a tulajdonos DevTools Network panelje |
| Egy zárt hét második megnyitása | 5 hívás, ebből 2 soros | a tartalomtáblákhoz (`issues`, `digest_items`, `github_top`) nem nyúl; csak az olvasó saját állapotát kéri, 2 párhuzamos hívással | az `archivedWeek` tesztje (5.); élesben a Supabase API-naplója, 2026-09-28 után |
| Supabase-hívások meleg példányon | `/` és `/archive/[week]`: 5, ebből 2 soros, utána a hidratáció még 2 egy újabb HTTP-körön; `/archive`: 1 | `/`: 3, ebből 2 soros; `/archive/[week]` nyitott héten vagy üres gyorsítótárral 3, gyorsítótár-találattal 2, mindkettő 1 soros; `/archive` találattal 0 | kódolvasás a 3.3 módszerével; tesztek |
| First Load JS (gzip) | `/` és `/archive/[week]` 241,2 KiB; `/library/[id]` 237,2 KiB; a zod-chunk 214,3 KiB nyers, 48,7 KiB gzip, csak ezen a hármon | a három útvonal nagyjából a zod-chunk méretével kisebb (az R1 saját kliens-kódja pár KiB-ot visszavesz); a zod-chunk egyik útvonal első betöltésében sincs | build és a 3.3 számítása |
| Élő TTFB | meleg medián: `/archive` 95 ms, `/` 91 ms | meleg: nem rosszabb; az első kérés ideje riportolt szám, nem ígéret | az utólagos élő mérés (3.3) |

## Nem része az R1-nek

- **R2 Visszajelzés:**
  - az optimista „küldés…” buborék; az alapmérésben `&slow=1` mellett a saját buborék 1612 ms-ig nem jelenik meg, ez az R2 kiindulópontja;
  - a hibaállapotok;
  - a nyomás-effektek.
- **R3 Elrendezés:** a mobil és a széles képernyős elrendezés.
- A [TODO.md](../../../TODO.md) „Responzívabb UI/UX” pontja alatt parkolt tételek.
- **A Next 16 Cache Components** (statikus héj, `use cache`): lehetséges későbbi mérföldkő. Csak az utólagos élő mérés után dönthető el.
- **A hideg indulás további karjai.** Ezeket csak megnevezzük, terv nélkül, arra az esetre, ha az utólagos mérés még mindig hideg akadást mutat:
  - a Vercel Fluid compute: a tulajdonos nézze meg a dashboardon, hogy be van-e kapcsolva;
  - „ébren tartó” pingek: nem illenek ide, mert a Hobby cron csak naponta fut;
  - a Cache Components statikus héja.

## A jóváhagyott vázlat pontosításai a kód alapján

| Jóváhagyott vázlat | Amit a kód mutat | A specifikáció |
| --- | --- | --- |
| Mind az öt útvonal saját `loading.tsx`-et kap. | Egy `loading.tsx` a mappája oldalát és minden gyerek-szegmensét burkolja. Az `app/(app)/loading.tsx` mind az ötöt, egy `library/loading.tsx` a `/library/[id]`-t is. | A `/`, a `/library` és az `/archive` oldala route groupba költözik (2.2). |
| A zod úgy megy ki, hogy a konstansok költöznek. | A `/library/[id]` útja szélesebb. A szerkesztő `editPayload`-ja (`lib/post-edit.ts`) és a `PostBlocks` (`lib/blocks.ts`, `lib/post-view.ts`) is zod-ot húz. A build szerkesztő-chunkjában ott van a `blocks.ts` `discriminatedUnion`-ja. | A konstansokon túl két kis költözés (3.1). |
| A `MINE_LIMIT` a zod-utak között van. | A `lib/link-chat.ts` csak típust importál a `my-sources.ts`-ből, ez nem zod-út. Fordítva áll: a szerveroldali `my-sources.ts` importál a kliens logikából. | A TODO okából költözik (3.1). |
| A hat `router.refresh()` egy közös `startTransition`-ön megy át, egy kis store számol, és a háttérfrissítés nem gyújtja a sávot. | Egy közös transition `isPending`-je minden rajta indított frissítésre igaz, a háttérfrissítésre is. | Az öt tag-művelet a héj egyetlen `useTransition`-jén megy, a számolást maga a React végzi, store nincs. A háttérfrissítő sima `router.refresh()` marad (2.3). A store egységtesztje helyett a sáv render-tesztje és a Playwright ellenőriz (5.). |
| Az olvasói állapot a nézett hét tételeire szűkül. | Az `item_states`-nek nincs `issue_id` oszlopa. | A szűrő a Radar-id rögzített formájában lévő hét-tokenre illeszt (1.3). |
| A vázlat nem rögzíti, mi legyen egy hibás olvasással. | A `getRadar` és a `getArchive` ma a lekérdezési hibát üres eredményként adja (`data ?? []`), amit a gyorsítótár egy napra eltenne. | Mindkettő dob, így hibát nem tárol, és a kérés az `app/error.tsx`-et mutatja (1.3, 1.5). |
| A seed szerveridőt visz, a küszöb indoklással. | A szerveridő és a telefon órájának összevetését az óraeltérés elrontja. | A kulcs: amelyik seed ebben a lapban már felcsatolódott, az Vissza-visszaállítás. Időküszöb nincs (1.4). |
| A vázak 150 ms után úsznak be. | Ha az egész váz 150 ms-ig láthatatlan, egy előtöltött kattintás után 150 ms-ig üres a lap, és a 100 ms-os cél sem teljesül. | A váz felülete azonnal ott van, csak a helykitöltők úsznak be 150 ms után (2.2). |
| A felső sávnak nincs késleltetése. | A poszt-oldal nyelvi frissítése helyben kb. 81 ms. | A sáv is 100 ms után jelenik meg, mint a pont (2.3). |
| A cron akkor érvénytelenít, amikor új hetet nyit. | Az `issues` upsert (`lib/pipeline/daily.ts:119-122`) nem mondja meg, hogy új sort hozott-e létre. | A cron minden futás után érvénytelenít (1.5). |
| Az őrteszt a `lib/` relatív import-gráfját járja be. | A `post-blocks.tsx`-en át vezető út az `app/` mappán megy át. | A bejárás az `app/` `"use client"` fájljaiból indul, és az `app/` fájljain is átmegy (3.2). |
| A Library beküldés felső sávja `&slow=1`-gyel mérhető. | A `SubmitForm` nem kap `delayMs`-t (`submit-form.tsx:60`). | A Playwright a poszt-oldal nyelvváltóját méri, a kérést maga lassítja; a `SubmitForm` nem változik (5.). |
| A Playwright az előnézeten nézi a 150 ms-os küszöböt. | A `/dev/*` alatt nincs töltési határ, így a vázak offline sehol nem láthatók. | Négy `*-loading` előnézeti nézet (2.2). |
| A „Több” linkjeit a sáv felcsatolásakor prefetch-eljük. | A `router.prefetch` fejlesztői módban is fut, és az előnézetből a valódi `/archive` útvonalat kérné le. | A prefetch csak élesben fut (2.4). |

## 1. A szerveroldali út

### 1.1 Régió

- A `vercel.json` a `crons` mellé kap egy `"regions": ["dub1"]` sort. A függvények (oldalak, API-route-ok, a napi cron) így Dublinban futnak, a Supabase mellett.
- A beállítás verziózott, és felülírja a dashboard Function Region értékét.
- Csak új deployjal lép életbe, és a deployt a tulajdonos végzi (7.). Ellenőrzés: a válasz `x-vercel-id` fejléce `…::dub1`-re végződik (előtte `fra1::fra1`).

### 1.2 Egy auth-ellenőrzés kérésenként

- A `getReader()` (`lib/supabase/server.ts:44-49`) React `cache()`-be kerül (`import { cache } from "react"`).
- A `getViewer()` (`:51-53`) továbbra is a `getReader()`-en át hív, így mindkettő ugyanazt a tárolt hívást adja.
- **Hatás:** az `(app)` layout (`app/(app)/layout.tsx:8`) és az oldal egy render alatt egy `createClient()` és `getClaims()` párt oszt meg.
  - Ez a kemény betöltésre és a `router.refresh()`-re hat. Kliensoldali navigációnál a layout amúgy sem fut újra.
  - ECC-kulccsal, meleg példányon ez egy helyi JWT-ellenőrzést és egy klienst spórol, nem hálózati kört.
  - Hideg példányon a layout és az oldal ma két párhuzamos JWKS-lekérést indíthat, mert az `auth-js` nem vonja össze a folyamatban lévőket. Így csak egyet.
- A `proxy.ts` külön kérésben fut, és nem változik.

### 1.3 Kevesebb lekérdezés, párhuzamosan

**`getRadar(db, issueId?)`** (`lib/content.ts:28-72`) egyetlen PostgREST-lekérdezés lesz:

- `issues.select("id, updated_at, digest_items(id, category, must_read, score, read_minutes, published_at, source, url, tags, title, summary, why), github_top(repo, focus, url)")`, a mai oszlopokkal (`lib/content.ts:46,50`);
- a beágyazott táblák sorrendje `order(…, { referencedTable })`-lel: a `digest_items` `must_read` szerint csökkenően, azon belül `score` szerint csökkenően; a `github_top` `rank` szerint;
- `issueId` nélkül `.order("id", { ascending: false }).limit(1)`, `issueId`-val `.eq("id", issueId)`, mindkettő `.maybeSingle()`-lel.

A sorok leképezése nem változik. A `CurrentIssue` (`data/digest-types.ts:89-94`) kap egy `id` mezőt (`'2026-W38'`): ez kell az olvasói állapot szűkítéséhez és a kliens újratöltéséhez. Értéke a mai `weekId` (`lib/content.ts:35`), vagyis kiadás nélkül a mostani ISO hét. Az előnézet `previewIssue`-ja is kap egyet.

Lekérdezési hibánál a `getRadar` dob; ma `data ?? []`-t ad. Erre a gyorsítótár miatt van szükség (1.5). A nyitott úton ennek hatása van: hiba esetén a `/` üres Radar helyett, egy nyitott hét 404 helyett a meglévő `app/error.tsx`-et mutatja. A valódi hibaállapotokat az R2 tervezi meg.

**`getReaderState(db, issueId)`** (`lib/content.ts:101-114`):

- **Az `item_states` a nézett hétre szűkül.**
  - Az `item_states`-nek nincs `issue_id` oszlopa, a Radar-id formája viszont rögzített invariáns: `<category>-<yyyy>w<ww>-<slug>-<urlhash>` (ARCHITECTURE.md → Invariants, `lib/pipeline/util.ts:62-64`).
  - A szűrő ezért `.like("item_id", "%-2026w38-%")`. A mintát egy új, `lib/pipeline/util.ts`-beli segéd építi a hét id-jából, hibás id-re `null`-t ad.
  - A `post:<id>` kulcsok és a többi hét tételei így kimaradnak.
  - Ha egy másik hét slugjában véletlenül `-2026w38-` áll, az csak egy felesleges sort hoz, amit a Radar nem olvas: az állapotokat a saját tételeinek id-je szerint keresi.
- **A teendők egészben maradnak,** mert a panel mindet mutatja.
- A két lekérdezés továbbra is párhuzamos, és hibánál `null`-t ad, mint ma.

**Az oldalak:**

| Oldal | Ma | R1 |
| --- | --- | --- |
| `/` (`app/(app)/page.tsx:11`) | `getRadar` ∥ `getReaderState`: 5 hívás, ebből 2 soros | `getRadar`, utána `getReaderState(db, radar.issue.id)`: 3 hívás, ebből 2 soros, mert a legutóbbi hét id-je csak a lekérdezés után ismert |
| `/archive/[week]` (`app/(app)/archive/[week]/page.tsx:14`) | 5 hívás, ebből 2 soros | a hét tartalma (1.5) ∥ `getReaderState(db, week)`: 3 hívás, 1 soros; zárt hét gyorsítótár-találatával 2 |
| `/archive` (`app/(app)/archive/page.tsx:11`) | 1 hívás | 1 hívás, gyorsítótár-találattal 0 |

**`GET /api/state`** (`app/api/state/route.ts:15-20`) `?issue=<hét id>` paramétert kér, és ugyanígy szűkít. Hiányzó vagy hibás id-re 400 `invalid_issue` a válasz. A `POST` nem változik. Egyetlen hívója a `loadState` (`lib/reader-store.ts:55-59`), amely megkapja a hét id-jét.

**A Library nem használja a `getReaderState`-et.** A kártyák halványítása a saját `post:%` lekérdezéséből jön (`getReadPostIds`, `lib/content.ts:117-120`), a poszt megnyitása pedig `POST`-ot küld (`mark-post-read.tsx:13`). Egyik sem változik. A WebMCP-eszközök (`use-model-context-tools.ts`) az oldal saját tételeire hatnak, és azok a szűrőn belül vannak.

### 1.4 Nincs dupla GET

- Ma a `useReaderState` (`app/components/use-reader-state.ts:26-40`) minden felcsatoláskor lekéri a `GET /api/state`-et, akkor is, ha a szerver seedje friss.
- Az R1-ben a szerver a seed mellé egy `seededAt` értéket ad: a render `Date.now()`-ját. A kliens egy lap-szintű halmazban jegyzi a már felcsatolt `<hét id>:<seededAt>` kulcsokat:
  - **egy kulcs első felcsatolása** friss renderből jön: nincs GET, és a store `syncing`-je rögtön hamis (ma a `createReaderStore(…, true)` a GET-ig igaznak tartja, és a panel addig „SZINKRON…”-t mutat);
  - **egy már látott kulcs** azt jelenti, hogy a router gyorsítótára állította vissza az oldalt (Vissza): GET és `hydrate`, mint ma;
  - **`null` seed** (a szerver lekérdezése elbukott): GET, mint ma.
- **Időküszöb nincs.** A szerveridő és a telefon órájának összevetéséhez kellene egy küszöb, amit egy perceket tévedő óra elront: mindig vagy soha nem töltene újra. A „már egyszer felcsatolt” kulcs pontosan a visszaállítást jelzi, óra nélkül.
- A szabály egy tiszta, egységtesztelt segéd a `lib/reader-store.ts`-ben, a hook csak meghívja.
- **Fejlesztői módban** a React Strict Mode kétszer futtatja az effectet. A második futás már látott kulcsot talál, ezért ott egy GET marad; élesben nincs ilyen. A kritériumot élesben mérjük.

### 1.5 Zárt hetek és az archívum-lista gyorsítótára

**Mi kerül bele** (`lib/content.ts`):

- **Egy zárt hét tartalma:** a `getRadar(createAdminClient(), week)` eredménye, `["closed-week", "v1"]` kulccsal (a hét id-je a függvény paramétere, az is a kulcs része), `{ revalidate: 86400 }` beállítással.
- **Az `/archive` listája:** a `getArchive(createAdminClient())` eredménye, `["archive-list", "v1"]` kulccsal és `{ revalidate: 86400, tags: ["archive"] }` beállítással. A `getArchive` (`lib/content.ts:74-90`) a `getRadar`-hoz hasonlóan lekérdezési hibánál dob; ma `data ?? []`-t ad, ami a „Még nincs lezárt hét” állapotot mutatja.
- **Mindkettő `unstable_cache`** (`next/cache`). A Next 16 dokumentációja (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md`) szerint ezt a `use cache` váltja, és a Cache Components-szel együtt ajánlja. Cache Components nélkül is működik, és az R1 nem kapcsolja be. Az átállás a lehetséges Cache Components mérföldkő része.
- **„Zárt” az a hét, amelynek id-je kisebb a mostani ISO hét id-jénél** (`week < isoWeek(now).id`). A nullával kiegészített id-k sztringként helyesen rendeződnek, évhatáron is. A napi cron mindig a futás hetébe ír (`runDaily`, `lib/pipeline/daily.ts:117`), így egy zárt hét tartalma már nem változik.
- **Ami nem kerül bele:**
  - a nyitott hét és a jövőbeli hetek, ezek a mai olvasói úton mennek;
  - a `/`;
  - az olvasó saját állapota (olvasott, később, teendők).

**Belépési pont.** A két gyorsítótárazott betöltő nem exportált. Az oldalak két függvényen át érik el őket, amelyek paraméterként a `getReader()` visszaadott objektumát kérik: `archivedWeek(reader, week, now?)` és `archiveList(reader)`. Bejelentkezés nélkül így nem hívhatók. A zárt vagy nyitott döntés is itt születik, egységtesztelhetően.

**Érvénytelenítés:**

- A napi cron route (`app/api/cron/daily/route.ts:20-26`) a `runDaily` után, akár sikerült, akár nem, meghívja a `revalidateTag("archive", { expire: 0 })`-t.
- **Miért `{ expire: 0 }`:** a `revalidateTag.md` szerint route handlerből nem érhető el az `updateTag`, a `"max"` profil pedig a következő kérésnek még a régi listát adná. `{ expire: 0 }` mellett a következő `/archive` kérés blokkolva újratölt. Az egyparaméteres forma elavult.
- **Miért minden futás után:** az `issues` upsert nem mondja meg, hogy új sort hozott-e létre. A lista a hétfő 00:00 UTC-s hétváltáskor változik, amikor egy hét zárttá válik, és ezt a váltás utáni első futás (hétfő 05:00 UTC) teszi láthatóvá. A többi napon a költség egy felesleges lista-lekérdezés.
- **A zárt hetekhez nincs tag, mert nem változnak.** Egy nap után a Next a lejárt bejegyzést a háttérben tölti újra, és addig a régit adja (stale-while-revalidate). Egy változatlan hétnél ez helyes.
- **A Next adatgyorsítótára túléli a deployt** (`unstable_cache.md`). Ezért van a kulcsban `v1`: a `RadarData` vagy az `ArchiveIssue` alakjának minden változásánál emelni kell, különben egy napig a régi alak jönne.

**Biztonság (a tulajdonos jóváhagyásával).** Egy gyorsítótárazott függvény nem olvashat cookie-t, ezért a zárt hetet a titkos kulcsú admin klienssel olvassa. Ez csak a három tartalomtáblát (`issues`, `digest_items`, `github_top`) és a kettőjük fölötti `archive_issues` nézetet érinti. Ezeket minden bejelentkezett tag az RLS-en át is olvashatja. Az olvasás csak sikeres `getReader()` után fut. Invariánsok:

1. **Felhasználói adat nincs a gyorsítótárban.** A betöltők csak tartalmat adnak vissza, sem néző-id-t, sem cookie-ból számolt értéket. A kulcs a hét id-je, illetve fix.
2. **Előbb az auth.** A betöltők csak a `Reader`-t kérő belépési ponton át érhetők el, és az oldalak csak az `if (!reader) redirect(…)` után hívják őket.
3. **Cookie nincs a gyorsítótárazott hatókörben.** Benne csak a `createAdminClient()` és a paraméterek vannak; `cookies()`, `headers()`, `createClient()` és `getReader()` nincs.
4. **Hibát nem tárol.** Egy lekérdezési hiba a betöltőben dob (1.3 és fent), így az `unstable_cache` nem tárol semmit, és a kérés a meglévő `app/error.tsx`-et mutatja.

**Szélső esetek:**

- **Hibás id:** a mai `isoWeekMonday`-ellenőrzés már a betöltés előtt 404-et ad (`app/(app)/archive/[week]/page.tsx:13`).
- **Múltbeli hét kiadás nélkül:** a `null` egy napig tárolódik, és 404 a válasz. Egy tag minden érvényes múltbeli hét-id-re létrehozhat egy ilyen bejegyzést, és mindegyik egy nap után lejár. Ezt elfogadjuk: a tagok fiókot kaptak, a szerverhez nem férnek.
- **Hétváltás:** hétfőn 00:00 és 05:00 UTC között egy vasárnap töltött lista még nem mutatja az épp lezárult hetet, amíg a cron nem érvényteleníti. Ebben az ablakban a `/` is még ezt a hetet mutatja legutóbbiként, mert az új hét sora csak 05:00-kor jön létre.
- **Kézi cron-futás éjfél körül:** ha egy futás vasárnap éjfél előtt indul, és utána is ír a régi hétbe, a késői sorai legkésőbb a bejegyzés egynapos lejártával jelennek meg.
- **A gyorsítótár-réteg saját hibájára** az R1 nem ír külön ágat, az a Next és a Vercel dolga. Ha felszínre kerül, az `app/error.tsx` jelenik meg.

## 2. Navigációs visszajelzés és prefetch

### 2.1 A függő pont

- Új `PendingDot` kliens komponens kerül az `app/components/nav-parts.tsx`-be. `useLinkStatus()`-t használ (`next/link`, `use-link-status.md`), ezért mindig egy `<Link>` leszármazottja.
- **Mindig renderelődik,** fix mérettel (a `.live-pulse` 9 px-ével), `aria-hidden`-nel és `opacity: 0`-val. Így nincs elrendezés-eltolódás, ahogy a `use-link-status.md` ajánlja.
- **Amíg a navigáció függőben van,** 100 ms után megjelenik, és a ház `.live-pulse` gyűrűje pulzál rajta (`app/globals.css:125-132`). A függés végén azonnal eltűnik. Egy új `.pending-dot` szabály a `globals.css`-ben adja az átlátszóságot és a 100 ms-os `transition-delay`-t.
- **`prefers-reduced-motion` alatt statikus:** a meglévő szabály (`globals.css:152-156`) leállítja a gyűrűt. A 100 ms-os késleltetés átmenet, nem mozgás, ezért marad.
- **Hol jelenik meg:**
  - A `NavEntry`-ben (`nav-parts.tsx:31-60`), csak a link ágában:
    - a teljes oldalsávban a sor végén;
    - az ikonsávban és a mobil sávban az ikon jobb felső sarkán, abszolút pozícióval;
    - a „Több” panelben a sor végén. A panel koppintásra bezárul, ezért ott ritkán látszik; ezt az utat a prefetch fedi (2.4).
  - Az archívum hétkártyáin (`app/(app)/archive/archive-view.tsx:37-61`): a felső sorban, az `Archive` ikon mellett. Az `archive-view.tsx` szerverkomponens, a pont kliens gyerekként kerül a `<Link>`-be.
  - A Library posztkártyáin (`PostCardLink`, `app/(app)/library/opened-posts.tsx:27-34`): a felső sorban, a fajta-ikon mellett.
- **A Next szabályai** (`use-link-status.md`): ha az útvonal már előtöltött, a függés kimarad, és akkor a váz jelenik meg azonnal (2.2). Gyors egymás utáni kattintásnál csak az utolsó link függése látszik.

### 2.2 Oldalformájú vázak

**Fájlok:**

| Útvonal | Oldal | Váz |
| --- | --- | --- |
| `/` | `app/(app)/page.tsx` → `app/(app)/(radar)/page.tsx` | `app/(app)/(radar)/loading.tsx` |
| `/library` | `app/(app)/library/page.tsx` → `app/(app)/library/(list)/page.tsx` | `app/(app)/library/(list)/loading.tsx` |
| `/library/[id]` | marad | `app/(app)/library/[id]/loading.tsx` |
| `/archive` | `app/(app)/archive/page.tsx` → `app/(app)/archive/(list)/page.tsx` | `app/(app)/archive/(list)/loading.tsx` |
| `/archive/[week]` | marad | `app/(app)/archive/[week]/loading.tsx` |

- **Az `app/(app)/loading.tsx` törlődik.**
- **Miért route group:**
  - Egy `loading.tsx` a mappája oldalát és minden gyerek-szegmensét Suspense-be teszi (`loading.md`). Prefetchnél a Next az első olyan szegmensig tölt, amelynek van töltési határa (`prefetching.md`: „Layout to first loading boundary”).
  - Ma az `(app)/loading.tsx` mind az öt útvonalat burkolja. Egy `library/loading.tsx` a `/library/[id]`-t is burkolná. Ha a gyerek szegmens még nem érkezett meg, a lista váza villanhatna fel a poszt előtt, vagy az ink archívum-váz a krém heti oldal előtt.
  - A route group nem része az URL-nek, így minden határ csak a saját oldalát burkolja.
- A szomszédos fájlok (`archive-view.tsx`, `library-view.tsx` és a többi) a helyükön maradnak; a költöző oldalak importjai `../`-ra változnak.
- **Ha még egyetlen határ sem érkezett meg** (a prefetch nem futott le), a régi oldal marad a függő ponttal (2.1), és soha nem jelenik meg rossz formájú váz.
- **Kemény betöltésnél** az `(app)` layout cookie-t olvas, ezért a váz csak a layout után jön (`loading.md`). Kliensoldali navigációnál a layout nem fut újra.

**A vázak** egy fájlban vannak, az `app/components/page-skeletons.tsx`-ben (szerverkomponens), három formával:

- **`RadarSkeleton`** a `/`-nek és az `/archive/[week]`-nek: krém oszlop, a fejléc és a chip-sáv sávja, ink hero-sáv, három papír Top 3 blokk (`@3xl`-től egymás mellett) és három hírsor.
- **`ListSkeleton`** a `/library`-nek és az `/archive`-nak: ink felület, krém `PageHero`-sáv (a Library-n a beküldő űrlap blokkjával), alatta `max-w-6xl` rács, `lg`-től két oszloppal.
- **`PostSkeleton`** a `/library/[id]`-nek: ink `main`, krém cikk, benne a jelvénysor, a címsorok, az eszközsor, az összefoglaló és a blokkok sorai, legfeljebb 75ch szélesen.

**Közös szabályok:**

- **Egy gyökérelem,** az oldal felülete (`min-h-dvh`), mint a valódi oldalaké. Így az app-héj `md:[&>:last-child]:pb-24` szabálya rá esik (DESIGN.md → Page shell).
- **Mi jelenik meg azonnal, és mi később:**
  - azonnal a gyökér felülete és a sávok (fejléc, hero, `PageHero`);
  - 150 ms után a szöveg- és kártya-helykitöltők egy közös konténerben, a ház 160 ms-ával beúszva.

  Így egy előtöltött kattintás már az első képkockában látszik: az oldal a helyes felületre vált, ink→krém villanás nélkül. Egy gyors betöltés viszont nem villant fel szürke blokkokat.
- **Akadálymentesség:** egy `role="status"` elem sr-only „Betöltés…” / „Loading…” szöveggel, `<LocalizedText>`-tel (`language-context.tsx:36-39`); a váz az app-héj `LanguageProvider`-én belül renderelődik. A gyökér `aria-busy="true"`, mint ma. Látható felirat nincs.
- **A ház `Skeleton`-ja** (`components/ui/skeleton.tsx`), `rounded-none`-nal. Ink felületen `bg-paper/10`, krémen és papíron az alapértelmezett `bg-primary/10`. A pulzálása `prefers-reduced-motion` alatt leáll (a meglévő szabály), és a helykitöltők ott 150 ms után, beúszás nélkül jelennek meg.
- **DESIGN.md szerint:** 0 radius, blur nélkül, csak tokenekkel. A Library és az Archívum kártyáinak `bg-[#1c1c1c]`-ja helyett `bg-paper/10`.
- **A poszt-oldal saját query-linkjei** (Eredeti/Magyarul, Szerkesztés, Mégse) újrarenderelik az oldal-szegmenst, ezért ott is a poszt váza jelenik meg, ahogy ma a közös váz.

**Előnézet.** A `PREVIEW_VIEWS` (`app/dev/preview/preview-nav.tsx:5`) négy nézettel bővül: `radar-loading`, `library-loading`, `archive-loading` és `post-loading`. Ezek adat nélkül, a héjban renderelik a vázakat, a futásidejű ellenőrzéshez és a Playwrighthoz. A `/dev/*` alatt nincs `loading.tsx`, így más úton offline nem láthatók.

### 2.3 Felső sáv a frissítésekhez

- **Új `app/components/refresh-bar.tsx`** (kliens):
  - a `RefreshProvider` birtokol egy `useTransition`-t és a `useRouter()`-t;
  - a `useRefresh()` hook egy `refresh(pushTo?)` függvényt ad: `startTransition(() => { if (pushTo) router.push(pushTo); router.refresh(); })`.
- Az `AppShell` a `LanguageProvider`-en belül ezzel burkolja a tartalmát. A minta a meglévő `language-context.tsx`-é: provider a héjban, és egy hook, amely a provideren kívül dob.
- **Az öt tag-művelet ezen megy át:**

  | Művelet | Hívóhely ma |
  | --- | --- |
  | Mentés | `post-editor.tsx:104-105` (`push` és `refresh`) |
  | Fordítás | `post-toolbar.tsx:35-36` (`push ?text=hu` és `refresh`) |
  | Nyelvváltó | `language-toggle.tsx:23` |
  | Library beküldés | `submit-form.tsx:66` |
  | Link-chat | `link-chat.tsx:176` |

- **A feldolgozás alatti háttérfrissítés** (`refresh-while-processing.tsx:19`, 5 másodpercenként) sima `router.refresh()` marad, ezért nem gyújtja a sávot.
- **Store nincs.** Egy közös transition `isPending`-je addig igaz, amíg bármelyik rajta indított frissítés tart; a számolást a React végzi, így sáv csak egy lehet. Nem kell a `listeners` / `subscribe` / `getSnapshot` váz negyedik példánya, és a TODO „Közös `createStore`” pontja változatlan marad.
- **A sáv:**
  - a nézet tetején, `fixed`, teljes szélességben, 2 px magas, signal színű;
  - `z-[70]`, a Sheetek `z-50`-e és a toast `z-[60]`-a fölött;
  - `aria-hidden`;
  - 100 ms után jelenik meg, mint a pont, mert a poszt-oldal nyelvi frissítése helyben kb. 81 ms, és a sáv ne villanjon;
  - egy rövid szegmens fut át rajta balról jobbra;
  - `prefers-reduced-motion` alatt statikus, teljes szélességű sáv. Ehhez saját szabály kell: a meglévő csak lerövidíti az animációt, és a szegmens a végállásában, a képen kívül állna meg;
  - amikor a frissített oldal megjelenik, a transition véget ér, és a sáv azonnal eltűnik.
- **Szélső esetek:**
  - két frissítés egyszerre (például nyelvváltás egy Mentés közben): egy sáv, amíg mindkettő tart;
  - ha egy háttérfrissítés egy tag-frissítéssel esik egybe, a React kötegelése miatt meghosszabbíthatja a sávot, de egymagában nem gyújtja;
  - ha a Mentés vagy a Fordítás kérése elbukik, frissítés nem indul, sáv sincs, és a saját állapotsoruk szól;
  - ha maga a frissítés hibázik, a Next hibakezelése veszi át, a transition véget ér, és a sáv eltűnik.

### 2.4 Prefetch

- **A `MobileNav`** (`app-shell.tsx:110`) felcsatolás után, böngésző-üresjáratban (`requestIdleCallback`; ahol ez nincs, egy `setTimeout` 1 s-mal a felcsatolás után, hogy ne versenyezzen az oldal saját kéréseivel) `router.prefetch(href, { onInvalidate })`-et hív minden `MOBILE_MORE_NAV`-elemre, amelynek van `href`-je. Ma ez az `/archive` (`lib/nav.ts:34`).
- **Az `onInvalidate` újra prefetchel** (a `prefetching.md` mintája). A `router.refresh()` érvényteleníti a szegmens-gyorsítótárat (`node_modules/next/dist/client/components/router-reducer/reducers/refresh-reducer.js:42`), így a bejegyzés minden frissítés után elveszne. Lecsatoláskor az üresjárati hívás törlődik, és az újra-prefetch leáll.
- **Csak élesben fut** (`process.env.NODE_ENV === "production"`), mint a Next saját viewport-prefetchje. Fejlesztői módban az előnézet különben a valódi `/archive` útvonalat kérné le, az `(app)` layout `getViewer()`-ével együtt, mert az előnézet nem osztja a layoutot. Ez az előnézet invariánsába ütközne (ARCHITECTURE.md → Invariants).
- **Minden szélességen fut.** A `MobileNav` minden szélességen felcsatolódik, `md`-től csak a CSS rejti. Asztalon az oldalsáv látható Archívum-linkjét a Next úgyis előtölti, és a szegmens-gyorsítótár a kettőt összevonja.
- **Ha a prefetch elbukik vagy lejár:**
  - egy előtöltött töltési határ `staleTimes.static` ideig, alapból 5 percig használható (`staleTimes.md`);
  - a panel megnyitásakor a link a nézetbe kerül, és a Next újra előtölti;
  - ha a koppintás ezt is megelőzi, az út olyan, mint ma: a régi oldal marad, amíg a szerver el nem küldi a vázat, a pont pedig a bezáruló panelben van. Ezt az R1 elfogadja.
- **A többi link** a Next alapértelmezett viewport-prefetchjén marad. A saját `loading.tsx` miatt a prefetch már a vázat is hozza.

### 2.5 Mit lát a tag

| Eset | 0–100 ms | Utána |
| --- | --- | --- |
| Előtöltött link | a váz felülete az első képkockában, és a menü aktív jelölése átvált | a helykitöltők 150 ms-tól, aztán az oldal |
| Nem előtöltött link (lassú hálózat, hideg függvény, fejlesztői mód) | a régi oldal | a pont 100 ms-tól; a szerver első darabjával a váz, aztán az oldal |
| „Több” → Archívum | előtöltve: mint az első sor | prefetch nélkül: a régi oldal, amíg a váz meg nem jön (2.4) |
| Az öt tag-frissítés | nincs változás | a sáv 100 ms-tól a frissített oldal megjelenéséig |
| Háttérfrissítés | nincs változás | nincs változás |
| Kemény betöltés (URL, újratöltés, PWA-indítás) | üres böngészőlap az első bájtig | a héj és a váz egyben, aztán az oldal |

Hideg indulásnál tehát a kattintás utáni első 100 ms-ban mindig van válasz, két kivétellel:

- a prefetch nélküli „Több” → Archívum;
- a kemény betöltés, amely a hideg indulás alatt nem mutathat semmit. Ilyen volt az alapmérés 3040 ms-os, kijelentkezett `/login`-je.

## 3. Csomag és mérés

### 3.1 zod ki a kliensből

A zod három úton jut a kliensbe. Ezeket a `"use client"` fájlok import-gráfja és a build chunkjai mutatják:

1. `use-reader-state.ts` → `lib/reader-store.ts:2` → `lib/state.ts:1`, a `/` és az `/archive/[week]` útvonalon. A `mark-post-read.tsx:4` ugyanezen az úton húzza be a `/library/[id]`-n.
2. `post-editor.tsx:12` → `lib/overrides.ts:1`, és `post-editor.tsx:13` → `lib/post-edit.ts`, a `/library/[id]`-n. A `post-edit.ts` az `editPayload` modulja; a modul szintjén ott van a `patchSchema` (`:11`), és importálja a `blocks.ts`-t és az `overrides.ts`-t.
3. `post-editor.tsx:7` → `app/components/post-blocks.tsx:3-4` → `lib/blocks.ts:1` és `lib/post-view.ts:2,4`, szintén a `/library/[id]`-n. A `blocks.ts`-ből a `post-blocks.tsx` csak a `safeHref`-et veszi, ami ott a `util.ts` újraexportja.

   A szerkesztő csak a beküldőnek renderelődik, a kódja mégis a `/library/[id]` első betöltésében van: a build ezen chunkja tartalmazza a `blocks.ts` `discriminatedUnion`-ját.

**Költözések:**

- **A három korlát:** a `TODO_TEXT_MAX` (`state.ts:8`), a `TITLE_MAX` és a `SUMMARY_MAX` (`overrides.ts:11-12`) a függőség nélküli `lib/pipeline/util.ts`-be kerül, a `REEXTRACT_COOLDOWN_MINUTES` mellé. A sémák onnan importálják őket. Újraexport nincs, mindegyiknek egy helye van.
- **A `MINE_LIMIT`** (`lib/link-chat.ts:11`) is oda kerül. Ez nem zod-út, mert a `link-chat.ts` csak típust importál a `my-sources.ts`-ből. De a szerveroldali `my-sources.ts:3` ma a kliens logikából importálja (TODO → „Apró rendrakás a taiyaki után”).
- **Az `editPayload`** (`post-edit.ts:21-30`) a `lib/post-view.ts`-be költözik.
- **A `toPost`, a `readMinutes` és a `parseTranslatedBlocks`** (`post-view.ts:50-96`) egy új, csak szerveroldalon importált `lib/post-row.ts`-be költözik. A hívóik: a `lib/content.ts`, a `post-article.tsx`, a `lib/translate.ts` és a tesztjeik.
- **A `post-view.ts` így zod-mentes.** Benne marad: a típusok, a `shownTitle`, a renderer segédei és az `editPayload`. A `blocks.ts`-ből és az `overrides.ts`-ből csak `import type`-pal importál.
- **A `post-blocks.tsx`** a `safeHref`-et a `@/lib/pipeline/util`-ból veszi, a blokktípusokat `import type`-pal.
- **A sémák szerveroldalon maradnak:** `state.ts`, `overrides.ts`, `blocks.ts`, `post-edit.ts`.

**Várható hatás:** a `/` és az `/archive/[week]` 241,2 KiB-os, a `/library/[id]` 237,2 KiB-os gzip első betöltése nagyjából a zod-chunk 48,7 KiB-jával kisebb lesz. Az R1 saját kliens-kódja (a pont, a sáv és a provider) ebből pár KiB-ot visszavesz minden `(app)` útvonalon.

### 3.2 Őrteszt

- **Új fájl:** `lib/client-bundle.test.ts`.
- **Gyökerek:** minden `.ts`/`.tsx` az `app/` alatt, amelynek első utasítása a `"use client"` direktíva. Ma 21 ilyen fájl van.
- **Bejárás:**
  - A telepített `typescript` (5.9.3, devDependency) fordító-API-jával (`ts.createSourceFile`) olvassa minden fájl `import … from` és `export … from` utasítását.
  - Kihagyja az `import type` / `export type` formát, és azt az importot, amelynek minden neve `type`: ezeket a fordító törli.
  - Az `@/x`-et a repó gyökeréhez, a `./x`-et és a `../x`-et relatívan oldja fel. Sorra próbálja a `.ts`, `.tsx`, `/index.ts` és `/index.tsx` végződést.
  - Minden elért repó-fájlba belép, kliensbe és nem kliensbe is. Egy kliens fájl által importált szerverfájl is a kliens csomagba kerül, mint a `post-blocks.tsx`.
  - Csomagokba nem lép be.
- **Bukás:** ha bármely elért fájl `zod`-ot vagy `zod/…`-t importál. Az üzenet a teljes láncot kiírja a gyökértől.
- **Nem üres:** kimondja, hogy legalább 15 gyökér van, és hogy a bejárás eléri a `lib/reader-store.ts`-t, a `lib/post-view.ts`-t és az `app/components/post-blocks.tsx`-et.
- **Mutációs próba:** a `reader-store.ts` visszakapja az `import { TODO_TEXT_MAX } from "./state.ts"` sort. A tesztnek a lánc megnevezésével kell elbuknia.

### 3.3 Mérés előtte és utána

- **Helyi mérés** (az előtte-számok: 2026-09-27, HEAD `a4cec60`, a meglévő production buildből; a Célok táblája):
  - `npm run build` után a `.next/diagnostics/route-bundle-stats.json` minden útvonalának első betöltési chunkjait egyenként gzip-eli (level 6), és összeadja;
  - a három útvonal chunkjaiban `ZodError`-t keres;
  - a Supabase-hívásokat kódolvasással számolja (`Promise.all` vagy soros `await`), mert helyben nincs valódi Supabase-késleltetés.
- **Élő mérés:**
  - a tulajdonos által jóváhagyott, egyszeri, csak olvasó, bejelentkezett, szkriptből futó munkamenet, kijelentkezéssel zárva;
  - egyszer deploy előtt (megvolt, 2026-09-27, a Kontextus táblája), és egyszer deploy után, ugyanazzal a szkripttel;
  - méri az `/archive`, egy zárt hét (2026-09-28 00:00 UTC-től a W39) és a `/` TTFB-jét: az első kérést (hideg) és négy meleg futás mediánját, a válasz régiójával (`x-vercel-id`) együtt;
  - a számokat riportoljuk, ígéretet nem teszünk.
- **Ami a szkriptből nem látszik,** azt a tulajdonos élesben nézi meg: a második `GET /api/state` hiányát a DevTools Network panelén, a zárt hét tartalomlekérdezéseinek hiányát a Supabase API-naplójában (a Célok táblája).

## 4. Biztonság

- **Az admin kliens új helyen** (1.5). A SECURITY.md → Reader vs admin client új engedélyezett használatként rögzíti:
  - a `lib/content.ts` zárt-hét és archívum-lista betöltői;
  - csak a három tartalomtábla és az `archive_issues` nézet;
  - csak sikeres `getReader()` után, gyorsítótárazva.

  A négy invariáns az 1.5-ben van. A belépési pont típusa (a `Reader` paraméter) és az `archivedWeek` tesztje (5.) tartja őket.
- **A böngészőbe nem kerül kulcs.** Új env-változó és `NEXT_PUBLIC_` változó nincs.
- **A `GET /api/state`** az `issue` paramétert az `isoWeekMonday`-jel ellenőrzi, mielőtt a szűrőbe kerül (400 `invalid_issue`). A `like`-mintát a segéd építi az ellenőrzött id-ből, nyers felhasználói szöveg nem kerül bele. Az RLS továbbra is a saját sorokra szűkít.
- **A gyorsítótár kulcsa** egy ellenőrzött hét-id, illetve a lista fix kulcsa. A zárt hetek tartalma minden tagnak ugyanaz.
- **A `revalidateTag`** csak a `CRON_SECRET`-tel védett cron route-ból fut.
- **A prefetch** ugyanazokat a session-ellenőrzött útvonalakat kéri, mint egy kattintás, és csak élesben fut.
- **Az előnézet:**
  - a négy új váz-nézet nem olvas adatot;
  - a prefetch fejlesztői módban nem fut;
  - a Playwright a valódi útvonalak kéréseit a böngészőben tartja vissza (5.), így azok nem érik el a szervert.

## 5. Tesztelés

- **Egységtesztek** (`node --test`):
  - `getRadar`: az egy beágyazott válasz leképezése (a tételek sorrendje, a GitHub-tuple-ök, az `issue.id`), a hét és a legutóbbi kiadás ága, és hibánál dob.
  - `getReaderState`: a hét-szűrő a lekérdezésben, a teendők szűrés nélkül.
  - A hét-minta segédje: minden kategóriára az `itemId(…)` kimenete illeszkedik, a `post:12` és a szomszéd hét tétele nem; hibás id-re `null`.
  - A seed-szabály: egy kulcs első felcsatolása nem tölt, a második igen, a `null` seed mindig.
- **Route-réteg** (`lib/test/route-hooks.ts`; a `STUBS` kap egy `next/cache` bejegyzést, amelyben az `unstable_cache` átengedő, a `revalidateTag` pedig rögzíti a hívásait):
  - a zárt vagy nyitott döntés (`archivedWeek`, a stubolt admin klienssel és `adminCalls`-szal): a múlt hét a gyorsítótárazott admin betöltőn megy, a mostani és a jövő hét az olvasó kliensén. Mutáció: `<` helyett `<=`, amire a tesztnek el kell buknia;
  - `GET /api/state`: 400 `invalid_issue` hiányzó és hibás id-re, 200 és szűrt állapot érvényesre;
  - a cron: `revalidateTag("archive", { expire: 0 })` sikeres és bukott `runDaily` után is. Mutáció: a hívás törlése, amire a tesztnek el kell buknia.
- **Render-tesztek** (a statikus harness; a `next-stub.ts` kap egy `useLinkStatus`-t, amely `{ pending: false }`-t ad, és a `useRouter()` kap `prefetch`-et):
  - az öt `loading.tsx`: pontosan egy `role="status"`, a szövege magyarul „Betöltés…”, angolul „Loading…”;
  - a `PendingDot` `aria-hidden`; a `NavEntry` link ágában ott van, a keresés gombjában nincs;
  - a felső sáv: nyugalmi állapotban nincs sáv-elem, a jelölés `aria-hidden`;
  - a `shell.test.ts` smoke-renderje az új darabokkal együtt (a `RefreshProvider`-rel burkolt héj, a vázak);
  - a `useRefresh` a provideren kívül dob, ezért a meglévő `post-toolbar.test.ts` és `post-editor.test.ts` a renderelt elemet `RefreshProvider`-be teszi.
- **Őrteszt:** 3.2.
- **Playwright az előnézeten**, 360, 768 és 1280 px-en, `page.bringToFront()` után (TESTING.md → Pitfalls):
  - **A pont:**
    - a valódi `(app)` útvonalak kéréseit (a `/`, a `/library…` és az `/archive…` útvonalét) a `page.route` válasz nélkül visszatartja, így egyik sem éri el a szervert; a `/dev/…` kérések átmennek;
    - kattintás egy `NavEntry`-re, egy hétkártyára és egy posztkártyára: 80 ms-nál a pont nem látszik, 150 ms-tól igen;
    - egy előnézeti link kattintása után, amelyre a szerver válaszol, eltűnik.
  - **A sáv:**
    - a `/dev/preview/post` nyelvváltójával, amely valódi `router.refresh()`-t indít;
    - a frissítés kérését a `page.route` 800 ms-mal késlelteti: 80 ms-nál nincs sáv, 150 ms-tól van, a válasz után eltűnik;
    - a Library beküldésre a `&slow=1` nem hat (a `SubmitForm` nem kap `delayMs`-t), ezért a sáv próbája a poszt-oldal nyelvváltóját használja, és a `SubmitForm` nem változik.
  - **A vázak:** a négy `*-loading` nézetben a helykitöltők `animation-delay`-e 150 ms, 400 ms-ra teljesen láthatók, és nincs vízszintes görgetés.
  - **Csökkentett mozgás** (`emulateMedia({ reducedMotion: "reduce" })`): a pont nem pulzál, a sáv statikus és teljes szélességű, a vázak nem pulzálnak, és beúszás nélkül jelennek meg.
  - **A konzol** tiszta.
- **Futásidejű ellenőrzés:** az előnézet minden nézete, a négy új is, 200-at ad, hiba nélkül (TESTING.md → Test layers).
- **Élő ellenőrzés:** a 3.3 utólagos mérése, és a valódi `(app)` navigáció (a váz, a pont és a prefetch) a tulajdonos telefonján és asztali gépén.
- **Az öt ellenőrzés:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run dup` (0 új klón).

## 6. Dokumentáció

Minden tény egy helyen szerepel, a többi hely hivatkozik rá.

- **SECURITY.md → Reader vs admin client:** az új engedélyezett használat (4.).
- **ARCHITECTURE.md:**
  - **Invariants:**
    - a gyorsítótár szabályai: csak zárt hét és az archívum-lista, egy napig; a cron minden futás után azonnal érvényteleníti a listát; felhasználói adat, cookie és a mostani hét soha nem kerül bele; előbb az auth; hibát nem tárol; a kulcs verziója a tartalom alakjával együtt változik;
    - a meglévő id-invariáns mellé: az olvasói állapot hét-szűrője a Radar-id rögzített formájára épít.
  - **Boundaries → Server and client components:** a kliens által elért modul nem importál zod-ot, és ezt a `lib/client-bundle.test.ts` őrzi.
  - **Codemap:** a route groupok, a `page-skeletons`, a `refresh-bar`, a `lib/post-row.ts`, és a `post-view.ts` új szerepe.
- **CLAUDE.md:**
  - **Auth:** a `getReader()` `cache()`-e.
  - **Egy új „Server path” rész:**
    - oldalanként a lekérdezések (az 1.3 táblája);
    - az olvasói állapot szűkítése;
    - a két gyorsítótár mechanikája: a függvények, a kulcsok, a tag és a `revalidateTag`;
    - a szabályokra az ARCHITECTURE.md-re, az admin-használatra a SECURITY.md-re, a régióra a README.md-re hivatkozik.
  - **App shell and navigation:**
    - a pont, a vázak és a route groupok, a felső sáv (`useRefresh`, az öt művelet, a kimaradó háttérfrissítő) és a prefetch;
    - a Reader state pontban a seed-szabály és a hét-szűrő a mai „A GET on mount still revalidates” mondat helyett.
  - **Routes:** a `GET /api/state` `?issue=` paramétere és a 400 `invalid_issue`; a cron `revalidateTag`-je.
  - **Data contract:** a `CurrentIssue.id`; a `toPost` új helye, a `lib/post-row.ts`.
- **DESIGN.md:**
  - a Components alatt egy új rész a pontról, a vázakról és a sávról, szó szerinti kivonatokkal (a `.pending-dot` szabály, a sáv osztálylistája és egy váz gyökere), amelyeket a `lib/design-excerpts.test.ts` tart szinkronban;
  - Elevation & Depth → Motion: a 100 ms, a 150 ms, a sáv mozgása és a csökkentett mozgás állapotai;
  - Elevation & Depth → Layering: a sáv `z-[70]`-e;
  - Principles, 5. pont: a vázak beúszása töltési állapot, nem oldaltartalom.
- **TESTING.md:**
  - az őrteszt: mit jár be, és a mutációs próbája;
  - a `next/cache` stub a route-rétegben;
  - a `next-stub.ts` új exportjai;
  - a Playwright-pontok: a valódi útvonalak visszatartása `page.route`-tal, a frissítés késleltetése, a csökkentett mozgás.
- **CODE_STYLE.md → Imports:** a „the client editor can import `lib/post-edit.ts`” mondat a `post-view.ts`-re vált, és bekerül egy sor: kliens által elért modul nem importál zod-ot.
- **AGENTS.md → Commands:** az előnézet nézetlistája a négy `*-loading` nézettel.
- **README.md:**
  - Deploy, 3. pont: a `regions` sor;
  - Roadmap: link erre a specifikációra.
- **TODO.md:**
  - **kész:** a „Kevesebb getClaims() kérésenként” pont; a `MINE_LIMIT` sor az „Apró rendrakás” alól; a zod-sor a „Responzívabb UI/UX” parkolt listájából;
  - **a „Lassú archívum” pont** az R1 előtte–utána mérésére mutat;
  - **új, a tulajdonosé:** a Fluid compute ellenőrzése a Vercel dashboardon; az utólagos élő mérés;
  - **új, a Technikai adósság alá:** az `unstable_cache` cseréje `use cache`-re, ha jön a Cache Components mérföldkő, és hogy a mérföldkőről a mérés után születik döntés.

## 7. Élesítés

- **Egy ágon, egy deployjal.** Az ág az `r1-speed`. Séma- és env-változás nincs.
- **A deploy a tulajdonosé:** push, majd a Vercel buildel. A `regions` csak az új deploytól hat, a régi deploymentek `fra1`-ben maradnak.
- **Deploy után:**
  - az `x-vercel-id` `…::dub1`-re végződik;
  - a napi cron lefut (Vercel → Cron Jobs);
  - a projekt beállításaiban a Fluid compute be van kapcsolva;
  - aztán jön az utólagos élő mérés (3.3).
- **Visszaállítás:** Vercel Instant Rollback az előző deploymentre. Visszahozza a `fra1`-et és a régi kódot, séma nem változott. Az R1 gyorsítótár-bejegyzéseit a régi kód nem olvassa, és egy nap alatt lejárnak.

## 8. Kockázatok

- **A régióváltás az egyik lábat rövidíti, a másikat hosszabbítja.** A `dub1` minden lekérdezésből kiveszi a Frankfurt–Írország kört, de egy magyarországi tag és a függvény közti út hosszabb lesz. A nyereség a soros DB-körök számával nő. Egy gyorsítótár-találatos `/archive`-nak nincs DB-köre, ott csak a hosszabb láb marad. Az utólagos mérés dönt; a visszaút egy sor törlése a `vercel.json`-ból.
- **A hideg indulás marad a fő érzett költség.** Az R1 csak láthatóvá teszi a várakozást (2.5). A további karok a „Nem része” alatt vannak.
- **Az `unstable_cache` leváltott API a Next 16-ban,** az utódja a `use cache`. A Cache Components mérföldkő cserélné le.
- **A Next adatgyorsítótára túléli a deployt.** Ha egy alakváltozásnál elmarad a `v1` emelése, egy napig régi alak jönne. A kulcs mellé a `lib/content.ts`-ben egy megjegyzés kerül.
- **Az admin kliens új helyen fut.** A négy invariáns és a belépési pont típusa tartja. Egy hiba kára a mindenki által olvasható tartalomra korlátozódik.
- **A hét-szűrő a Radar-id formájára épít.** Ha az `itemId()` formája valaha változna, a szűrő csendben kihagyna sorokat. Az id-invariáns ezt tiltja, és egy teszt köti a segédet az `itemId()`-hez.
- **A zárt hetek gyorsítótára csak a második héttől hoz.** Ma nincs zárt hét; az első a W39 lesz, 2026-09-28 00:00 UTC-től.
- **A route groupok fájlokat mozgatnak.** Az importok és a dokumentáció követik őket, az URL-ek nem változnak.
- **A prefetch-bejegyzés 5 perc után lejár, és a frissítés is törli.** Az `onInvalidate` és a panel saját viewport-prefetchje pótolja; a maradék rés a 2.4-ben van leírva.
- **Fejlesztői módban a Strict Mode miatt egy `GET /api/state` marad** (1.4), ezért a kritériumot élesben mérjük.
