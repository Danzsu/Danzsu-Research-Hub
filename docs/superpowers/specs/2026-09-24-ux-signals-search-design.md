# UI/UX, olvasási jelzések és keresés: specifikáció

**Dátum:** 2026-09-24 · **Állapot:** jóváhagyásra vár · **Előfeltétel:** az 1. alprojekt M1-e (egységes poszt-sablon) be van olvasztva

## Kontextus

Az oldalt nagyjából fele-fele arányban használjuk telefonon és asztali gépen. Négy dolog lassítja a munkát:

1. **Nincs egységes navigáció.** A főoldalon oldalsáv van, a többi oldalon csak egy vissza-link.
2. **Mobilon kényelmetlen.** A gombok messze vannak a hüvelykujjtól, és sokszor menüt kell nyitni.
3. **Nehéz visszakeresni** egy korábbi hírt vagy posztot.
4. **A listák hosszúak és lassúak.**

Emellett hiányzik egy értékelés, amellyel jelölhető, mi volt hasznos és mi nem.

Ez a spec a kinézethez nem nyúl. A `CLAUDE.md` „Design language” szakasza (0-s radius, rendszerbetűk, kemény árnyékok, ink/paper/cream/signal) változatlanul érvényes. Csak azt változtatjuk meg, ami a produktivitást gátolja. Az ergonómiai pontok egy kód alapú átnézésből jönnek (`.superpowers/brainstorm/ux-audit.md`, 16 pont, fájl- és sorhivatkozással).

## Döntések (a tervezés során egyeztetve)

| Kérdés | Döntés |
| --- | --- |
| Eszköz | Telefon és asztal nagyjából fele-fele. Mobilon alsó sáv. |
| Asztali navigáció | **Nyitott.** A, B vagy C a `navigation.html` szerint. Az A mérföldkő elején döntünk, addig az A (oldalsáv) az alapértelmezés. |
| Keresés tárgya | Radar-hírek és Library-posztok, **csak címek**. A teljes szövegben nem keresünk, mert túl sok lenne a találat. |
| „Okos” keresés | A cím elgépelés-tűrő egyezése (pg_trgm) és jelentés szerinti keresés a cím és az összefoglaló embeddingjével (pgvector) |
| Szűrők | Címke, típus, dátum, értékelés |
| Értékelés | Egyetlen skála: 👎 nem hasznos / 👍 hasznos / ❤ kedvenc. Mellette megmarad az „Elolvastam” és a „Későbbre”. |
| Mit lehet értékelni | Radar-híreket, Library-posztokat és GitHub-repókat |
| A 👎 hatása | Halványítva marad, a listán hátrébb kerül, a keresésben lejjebb rangsorolódik. Nem tanul belőle a napi válogatás, és nincs rejtő szűrő. |
| Lapozás | „Továbbiak” gomb, a pozíció az URL-ben marad |
| Archívum | Új GitHub-fül: a repók hétről hétre, ismétlés nélkül, az értékeléssel |
| Tesztelés élő adat nélkül | Fejlesztői előnézeti oldal mintaadatokkal. Rajta Playwright-ellenőrzés 360, 768 és 1280 px-en. |

## Hatókör

Három mérföldkő, mindegyik külön tervvel. A sorrend kötött, mert a C a B értékeléseit használja a rangsoroláshoz.

- **A: app-keret, ergonómia, offline előnézet** (1. fejezet)
- **B: olvasási jelzések és a GitHub-fül** (2. fejezet)
- **C: keresés és lapozás** (3. fejezet)

**Nem része:**
- a források bővítése és a napi szűrés
- a habit tracker
- a kapcsolatok, a gráf és a GitHub-archívum
- a kabala
- a 2–5. alprojekt

Ezek mind szerepelnek a `TODO.md`-ben.

## 1. App-keret, ergonómia, offline előnézet (A)

### 1.1 Menüpontok: egy lista

A navigáció egyetlen tömbből épül fel: `lib/nav.ts`, amely tiszta modul, relatív importokkal. Mindkét elrendezés, a mobilos alsó sáv és az asztali nézet is, ebből dolgozik.

| Menüpont | Útvonal | Megjegyzés |
| --- | --- | --- |
| Radar | `/` | |
| Library | `/library` | |
| Keresés | `⌘K`, illetve `/search` | A C mérföldkőig csak a paletta helye foglalt |
| Archívum | `/archive` | |
| Gyűjtemény, Statisztika, Chat | nincs | Halványan, „hamarosan” jelzéssel, nem kattinthatók |

Az aktív menüpontot az útvonal előtagja dönti el. Az `/archive/2026-W38` például az Archívumot jelöli aktívnak.

### 1.2 Elrendezés

- **Route group:** az `app/(app)/layout.tsx` fogja közre az összes bejelentkezett oldalt. A `/login` és az `/auth/*` kívül marad. Az URL-ek nem változnak.
- **Mobil (`md` alatt), alsó sáv öt hellyel:** Radar · Library · Keresés · Archívum · Több.
  - A „Több” egy alulról nyíló panel, benne: nyelvváltás, kijelentkezés és a jövőbeli nézetek.
  - A sáv figyelembe veszi az `env(safe-area-inset-bottom)` értéket.
  - A tartalom alján annyi hely marad, hogy a sáv ne takarjon ki semmit.
- **Asztal (`md` fölött):** a választott változat (A, B vagy C). Mindháromban ugyanazok a menüpontok, és a keresés ⌘K-val nyílik.
- **A Radar kategóriái** minden szélességen chip-sávban jelennek meg. Az oldalsáv kategórialistája megszűnik.
- **Fejlécek:** a `PageHeader` (vissza-link és logó) helyét a keret veszi át. A `PageHero` (cím-sáv) marad.

### 1.3 Visszavonás-csík: egy közös elem

Neve: `app/components/undo-toast.tsx`. Egy alul megjelenő sáv: „Olvasottnak jelölve · Visszavonás”, 5 másodpercig látható.

- Egyszerre egy csík lehet kint. Ha új érkezik, a régi művelet véglegessé válik.
- `aria-live="polite"`.
- Új csomag nem kell hozzá.
- A felhasználói műveletek (olvasott, törlés, értékelés) mind ezt használják.

### 1.4 Ergonómiai javítások (az átnézés alapján)

1. **Megnyitás = olvasott.**
   - A „Megnyitás” gomb az új lap megnyitásával együtt olvasottnak jelöli a hírt, és feldobja a visszavonás-csíkot.
   - Az „Elolvastam” jelölés kézzel is átállítható marad.
2. **Olvasatlanok elöl.** Az olvasott tételek a saját csoportjuk végére kerülnek. A must-read / pontszám sorrend csoporton belül megmarad.
3. **Minden gomb a kártya aljára, egy sorba:** `[Megnyitás] [👎 👍 ❤] [Később] [+ teendő]`.
   - Az értékelő skála a B mérföldkőben kerül a helyére.
   - A „+ teendő” a hírhez köti a teendőt (`todos.item_id`). Az API ezt már most is fogadja.
4. **Top 3.** Teljes értékű kártyák, ugyanazokkal a gombokkal, és nem ismétlődnek lent a listában.
5. **Teendők.**
   - A hozzáadás, a pipálás és a törlés azonnal megjelenik. Hibánál a változás visszaáll, és hibaüzenet jelenik meg.
   - A törlés visszavonható.
   - Mobilon a panel alulról nyílik (`side="bottom"`).
6. **Library.**
   - A megnyitott poszt olvasottnak számít. Az `item_states` táblában `post:<id>` kulccsal tároljuk, séma-változás nélkül.
   - A lista halványítja az olvasott posztokat.
7. **Beküldés közben élő állapot.** Amíg van feldolgozás alatt álló forrás, a Library 5 másodpercenként frissül. Utána leáll.
8. **Nyelvváltás oldalfrissítés nélkül** ott, ahol mindkét nyelv már be van töltve: Radar, Library-lista, Archívum.
9. **Érintési felületek.** A Top 3 forrás-linkje és a teendő-törlés is legalább 40 px (`size-10 sm:size-8`).
10. **Üres állapotok.** Mindegyik megmondja, mi a teendő. Például: „Még üres, küldj be egy linket fent ↑”.

### 1.5 Billentyűparancsok (asztal)

| Billentyű | Művelet |
| --- | --- |
| `j` / `k` | Következő / előző kártya (fókusz és görgetés) |
| `o` | A kártya megnyitása (egyben olvasott, lásd 1.4) |
| `r` | Olvasott ki/be |
| `l` | Későbbre |
| `⌘K` vagy `/` | Keresés (C mérföldkő) |
| `?` | A billentyűparancsok listája |

- A parancsok nem futnak, ha a fókusz beviteli mezőn, szövegdobozon vagy `contenteditable` elemen van.
- A billentyű → művelet leképezés tiszta függvény, teszttel.

### 1.6 Offline előnézet

- **`app/dev/preview/page.tsx`:** ha `process.env.NODE_ENV !== "development"`, `notFound()`.
  - A `proxy.ts` csak fejlesztői módban engedi be bejelentkezés nélkül a `/dev/` útvonalat.
  - Élesben az útvonal nem létezik.
- **Mintaadatok: `lib/fixtures.ts`.**
  - Minden blokktípus.
  - Mind a négy sáv: noarchive, extractionFailed, truncated, clipped.
  - Hosszú címek és URL-ek.
  - Üres állapotok.
  - Értékelt, olvasott és halványított tételek.
- **Ellenőrzés.** A kontroller Playwrighttal (MCP-eszközökkel, új függőség nélkül) nézi végig 360, 768 és 1280 px-en:
  - nincs vízszintes görgetés;
  - minden kattintható elem legalább 40 px mobilon;
  - látszik a fókuszkeret;
  - mobilon megjelenik az alsó sáv;
  - működnek a billentyűparancsok.

## 2. Olvasási jelzések és GitHub-fül (B)

### 2.1 Skála

| Érték | Jelentés |
| --- | --- |
| `-1` | 👎 nem hasznos |
| `1` | 👍 hasznos |
| `2` | ❤ kedvenc |

Nincs érték: nincs sor a táblában. Az aktív gomb újbóli megnyomása törli az értékelést. Egy tételnek egyszerre legfeljebb egy értékelése lehet.

### 2.2 Adatmodell (új, additív migráció)

```sql
create table public.ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('item', 'post', 'repo')),
  target_id text not null check (char_length(target_id) <= 200),
  value smallint not null check (value in (-1, 1, 2)),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
-- RLS: own rows only, like item_states.
```

A `target_id` értéke:
- Radar-hírnél a `digest_items.id`. Ez örökre stabil (lásd `CLAUDE.md`).
- Posztnál a `posts.id` szövegként.
- Repónál a kisbetűs `owner/repo`. Így egy repó értékelése minden héten érvényes.

A `github_top` két új, nullázható oszlopot kap: `stars int` és `language text`. A napi futás ezentúl ezeket is menti, a régi sorokban üresek maradnak.

### 2.3 API

A meglévő `/api/state` route egy új műveletet kap: `set_rating`, paraméterei `{ kind, id, value | null }`.
- A bemenetet zod ellenőrzi.
- A hitelesítés a `getReader` feladata, és az RLS érvényes.
- A logika a `lib/`-ben van, tesztelhető formában. A route vékony marad.

### 2.4 Felület

- **`RatingControl`:** három gomb egy csoportban, `aria-pressed` állapottal, legalább 40 px-esek. A kattintás azonnal látszik, hiba esetén visszaáll.
- **Helyek:**
  - Radar-kártyák lábléce, a Top 3-mal együtt;
  - a poszt eszköztára;
  - a Library-lista sorai;
  - a GitHub top 10 a Radaron;
  - az archívum GitHub-füle.
- **A 👎-os tétel:**
  - halványítva jelenik meg, és a vonala szaggatott, hogy ne tévesszük össze az „olvasott” halványítással;
  - a lista végére kerül a Library-ben, az archivált heteknél és a GitHub-fülön. Az élő Radaron a helyén marad, csak halványabb.

### 2.5 Az archívum GitHub-füle

- **Útvonal:** `/archive/github`. A statikus szegmens megelőzi a `[week]` dinamikus szegmenst, így nem ütközik a heti oldalakkal. Az archívum fejlécében két fül lesz: „Hetek” és „GitHub”.
- **Egy sor egy repó (kisbetűs `repo` szerint csoportosítva):** az első és az utolsó hét, hány héten volt fent, a legjobb helyezés, a legutóbbi `focus`, a `language` és a `stars`, és az értékelésed.
- **Adat:** egy `security_invoker` nézet vagy RPC a `github_top` és az `issues` fölött.
- **Rendezés és szűrés:**
  - alapból a legutóbbi hét szerint csökkenő sorrendben;
  - szűrhető értékelésre és nyelvre;
  - a lista alján „Továbbiak” gomb.

## 3. Keresés és lapozás (C)

### 3.1 Index (additív migráció)

- **Bővítmények:** `pg_trgm` és `vector` (pgvector). Mindkettő elérhető a Supabase-en.
- **Címegyezés:** trigram GIN index a `lower(title->>'hu')` és a `lower(title->>'en')` kifejezésre, a `digest_items` és a `posts` táblán is.
- **Jelentés szerinti keresés:** mindkét tábla két új oszlopot kap: `embedding vector(1536)` és `embedding_model text`. Az index HNSW, koszinusz-távolsággal.
- **Mit embeddelünk:** `title.en`, `title.hu` és `summary.en` sortöréssel összefűzve. A vektort L2-normalizáljuk, mert az 1536-os kimenet nem normalizált.

### 3.2 Embedding készítése

- **Függvény:** új `embed(db, texts)` a `lib/llm.ts`-ben. A modellt a `model_settings` új `search_embed` sora adja meg: `gemini-embedding-001`, `outputDimensionality: 1536`. Modellnév nem kerül a kódba.
- **Mikor készül:**
  - a napi kurálásnál, az új hírekhez;
  - a `processSource`-ban, az összefoglaló után;
  - a meglévő sorokhoz egy egyszeri szkripttel (`scripts/backfill-embeddings.mts`).
- **Hibatűrés:** ha az embedding hibára fut, a sor vektor nélkül kerül be. A napi cron futásonként legfeljebb 200 vektor nélküli sort felvesz, és pótolja őket.
- **Modellváltás:** a vektor mellé mentjük a modell nevét (`embedding_model`). Így egy későbbi váltásnál látszik, mit kell újravektorizálni.

### 3.3 Keresés: RPC és API

- **RPC:** `search_content(q, q_embedding, kinds, tags, date_from, date_to, rating, lim, off)`.
  - `security invoker`, tehát az RLS érvényes. Az értékeléseket az `auth.uid()` alapján illeszti.
  - Egységes sorokat ad vissza: `kind`, `id`, `title`, `href`, `tags`, `date`, `rating`, `score`.
- **Pontszám:**
  - alap: `0.6 × trigram-hasonlóság` (a hu és en cím közül a jobb) `+ 0.4 × (1 − koszinusz-távolság)`;
  - ❤ +0.10, 👍 +0.05, 👎 −0.30;
  - a küszöb alatti találatok kimaradnak.
  - A súlyok konstansok, a terv egy helyen rögzíti őket.
- **API:** `/api/search` (GET).
  - `getReader`, a lekérdezés legfeljebb 200 karakter.
  - A kérdéshez egyetlen embedding-hívás készül. Ha ez elbukik, `q_embedding = null` és csak a címegyezés fut, a felület pedig ezt jelzi.

### 3.4 Felület

- **⌘K-paletta:**
  - dialógus, a leütések után 250 ms várakozással;
  - nyilakkal és Enterrel kezelhető;
  - Esc-re bezárul;
  - az első 8 találatot mutatja típusikonnal és értékeléssel;
  - legalul „Összes találat” link a keresőoldalra.
- **`/search` oldal:**
  - a szűrők az URL-ben vannak;
  - minden találat mellett ott van az értékelő skála;
  - a lista alján „Továbbiak”.

### 3.5 Lapozás

- **Hol:** Library, archívum-lista, GitHub-fül, keresési találatok.
- **Hogyan:** a „Továbbiak” egy sima link, amely növeli az `?n=` értékét (30 → 60 → …, legfeljebb 600). A szerver rendereli, JavaScript nem kell hozzá, és a vissza gomb ugyanoda visz.
- **Görgetés:** a link egy horgonyra ugrik (`#tetel-30`) az új adag elejére, így nem veszik el a görgetési hely.
- **Segédfüggvény:** az `n` értelmezése és felső korlátja tiszta függvény, teszttel.

## 4. Hibakezelés, korlátok, biztonság

- **Minden felhasználói művelet azonnal látszik** (olvasott, értékelés, teendő). Hibánál a változás visszaáll, és egy hibacsík jelenik meg. Csendes hiba nincs.
- **Keresés:**
  - az embedding hibája esetén csak címegyezés fut;
  - az RPC hibája esetén hibaállapot jelenik meg, újrapróbálás gombbal;
  - a lekérdezés hossza korlátozott, az SQL paraméteres.
- **Előnézet:** csak fejlesztői módban létezik. Élesben mind az útvonal, mind a `proxy.ts`-kivétel kikapcsol.
- **Billentyűparancsok:** gépelés közben nem futnak. Az animált görgetés figyelembe veszi a `prefers-reduced-motion` beállítást.
- **Migrációk:**
  - mind additívak;
  - a felhasználó az SQL Editorban futtatja őket, az M1-hez hasonlóan;
  - a `TODO.md` lépésenként leírja, mit kell futtatni és ellenőrizni.
- **Kulcsok:**
  - a `ratings` és az `item_states` tábla csak a saját sorokat engedi;
  - a `search_content` az olvasó jogaival fut, soha nem a titkos kulccsal.

## 5. Tesztelés

- **Tiszta segédfüggvények `node --test`-tel** (a `lib/`-ben, relatív importokkal):
  - menülista és aktív útvonal;
  - értékelés-váltás (ugyanaz még egyszer = törlés);
  - rendezés (olvasatlan elöl, 👎 hátul);
  - billentyű → művelet leképezés, szövegmezőben kikapcsolva;
  - visszavonás-sor logikája;
  - az `?n=` lapozás;
  - GitHub-előzmény csoportosítása, ha TypeScriptben készül;
  - a keresési pontszám kombinálása, ha TypeScriptben készül.
- **Bekötési tesztek** a meglévő `fakeDb`-vel és `mockFetch`-csel:
  - `set_rating` és a posztok olvasottsága;
  - embedding írása és pótlása;
  - `/api/search`, amikor az embedding hibára fut.
- **Playwright az előnézeti oldalon** (1.6), minden mérföldkő végén.
- **Élő próba** a migrációk után:
  - 5 átfogalmazott, magyar és angol keresés;
  - az RPC válaszideje 500 ms alatt;
  - az értékelések megmaradnak újratöltés után.
- **A Review Focus** (a terv írja meg):
  - gépelés közbeni billentyűparancs;
  - dupla kattintás az értékelésen;
  - offline hálózat alatti visszaállás;
  - 360 px és az alsó sáv takarása;
  - keresés embedding nélkül.

## 6. Nyitott döntés

- **Asztali navigáció:** A (oldalsáv), B (felső sáv) vagy C (ikonsáv), a `.superpowers/brainstorm/…/navigation.html` alapján. Az A mérföldkő elején döntünk. Ha addig nincs döntés, az A az alapértelmezés.
