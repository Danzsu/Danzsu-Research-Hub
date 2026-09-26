# Taiyaki link-chat — specifikáció

**Dátum:** 2026-09-25 · **Állapot:** jóváhagyásra vár · **Sorrend:** az UX-A után, az M2 előtt

## Kontextus

Ma linket csak a Könyvtár oldal űrlapján lehet beküldeni. A felhasználó egy kis, mindenhol elérhető buborékot kért, olyat, mint az iPon AI-widgetje: rányom, bedob egy linket, és látja, hogy a rendszer mit csinál vele.

A beküldés háttere már kész. A `POST /api/sources` fogad egy linket és egy legfeljebb 500 karakteres megjegyzést, a megjegyzés bekerül az összefoglaló promptjába („The submitter's note”), a feldolgozás pedig `after()`-ben fut. Ez a munka csak felület, egy lekérdező route és egy „Újra” route.

## Döntések (a tervezés során egyeztetve, 2026-09-25)

| Kérdés | Döntés |
| --- | --- |
| Mit tud a v1 | Csak link bedobását (+ megjegyzés). Szabad chat nincs; az a gyűjtemény fölötti chat (5. alprojekt) lesz, ugyanebben a panelben. |
| Ikon | Saját rajzú taiyaki, „A — Klasszikus”: signal-narancs test, ink kontúr és pikkelyek, kemény ink árnyék. Forrás: `.superpowers/brainstorm/4489-1790347439/content/taiyaki-icon.html` (`#ty-a`). Az albumborítóról semmi nem kerül át. |
| Hely asztalon | Szögletes, kemény árnyékú gomb a jobb alsó sarokban, minden bejelentkezett oldalon. |
| Hely mobilon | Az alsó sáv kiemelt középső gombja: Radar, Könyvtár, **taiyaki**, Keresés, Több. Az Archívum a „Több” panelbe kerül. |
| Panel | Mini chat: a te üzeneted (link + megjegyzés) és a taiyaki válasza, élő állapottal. |
| Élő állapot | Lekérdezés 4 másodpercenként, csak amíg a panel nyitva van, a fül látszik és van függő beküldés. Nincs Realtime, nincs böngészőbe kerülő Supabase-kulcs. |
| Hibás beküldés | „Újra” gomb a saját, `failed` állapotú beküldésen. |
| Nem része a v1-nek | szabad chat, „Törlés”, telefonos megosztás-menü (Android share target), értesítés zárt panel mellett, billentyűparancs |

## 1. Felület

### 1.1 A gomb

- **Ikon:** `app/components/taiyaki-icon.tsx`, egyetlen SVG-komponens (`viewBox="0 0 64 64"`, `aria-hidden`), a fenti rajzból. Máshol is használható (később a kabalához).
- **Asztalon (`md` fölött):** `fixed bottom-6 right-6`, 56 px (`size-14`), paper háttér, 2 px ink keret, `4px 4px 0 var(--ink)` árnyék; hoverre a ház szabálya szerint `8px 8px 0 var(--signal)`, 160ms ease. `z-40`, a visszavonás-csík (`z-[60]`) alatt.
- **Mobilon (`md` alatt):** az alsó sáv középső helye. A gomb 16–18 px-rel kiemelkedik a sávból, paper háttér, ink keret, `3px 3px 0 var(--signal)` árnyék; a kattintható felület legalább 40 px.
- **Akadálymentesség:** `aria-label` („Link bedobása” / „Drop a link”), `aria-expanded`, `aria-controls` a panel id-jére.
- **A visszavonás-csík nem ütközik vele:** asztalon a csík sávja `md:right-24`-et kap, így a jobb alsó 56 px mindig a gombé. Mobilon a csík már most is a sáv fölött van.

### 1.2 Az alsó sáv változása

- A `lib/nav.ts` mondja meg, melyik menüpont hol van: a mobil sáv három navigációs helye `radar`, `library`, `search`; az `archive` a „Több” panel listájába kerül. Az asztali oldalsáv nem változik.
- A sáv öt helye: Radar, Könyvtár, taiyaki, Keresés, Több. A „Több” panel sorrendje: Archívum, nyelv, a „hamarosan” nézetek, kijelentkezés.
- Ha a jelenlegi oldal az Archívum, a „Több” gomb kapja az aktív jelölést (`aria-current` a panelben lévő Archívum linken).

### 1.3 A panel

- **Asztalon:** nem modális panel a gomb fölött, 360 px széles, legfeljebb `70dvh` magas. Nyitva marad, amíg be nem zárod (Esc vagy a bezáró gomb), így közben kimásolhatsz egy linket a mögötte lévő oldalról. Kattintás a panelen kívül nem zárja be.
- **Mobilon:** alsó Sheet (`components/ui/sheet.tsx`, `side="bottom"`), legfeljebb `75dvh`, `closeLabel` a komponens `copy`-jából.
- **Megnyitáskor** a fókusz a beviteli mezőbe kerül; bezáráskor vissza a gombra.
- **Fejléc:** ink sáv, kis taiyaki, „TAIYAKI · LINK BEDOBÁSA”, bezáró gomb (40 px).
- **Szál:**
  - első sor mindig a taiyaki köszönése: „Dobj be egy linket! Ha akarod, írd mellé, mire figyeljek.”;
  - utána a saját 10 legutóbbi beküldésed, a legrégebbi felül, mindegyik egy üzenetpár (1.4);
  - a helyi válaszok (link nélküli üzenet, hibás link, hálózati hiba) a szál végére kerülnek, és csak a panel életéig élnek, nem mentődnek;
  - új üzenetnél a szál az aljára görget (`prefers-reduced-motion` mellett ugrással);
  - a taiyaki-válaszok konténere `aria-live="polite"`.
- **Beviteli mező:** `Textarea`, legfeljebb `30dvh` magas, utána görget. Enter küld, Shift+Enter új sor. A küldés gomb 40 px, signal háttér. Küldés közben a mező és a gomb le van tiltva.
- **Szélesség:** 360 px-es képernyőn nincs vízszintes görgetés; a hosszú linkek és megjegyzések `[overflow-wrap:anywhere]`-rel törnek.

### 1.4 Egy beküldés a szálban

A te üzeneted: ink buborék, benne a link (`safeHref`, új lapon), alatta a megjegyzés, ha van.

A taiyaki válasza a beküldés állapotából:

| Állapot | Válasz |
| --- | --- |
| `pending` | „Megkaptam, *arXiv-tanulmány*.” + „FELDOLGOZÁS…” narancs ponttal. (A „sorban” és a „feldolgozás” ma egy állapot, ezért nincs szétválasztva.) |
| `done` | A poszt megjelenített címe (a beküldő átírása nyer, mint a `toPost`-ban) + „KÉSZ · MEGNYITÁS →” a `/library/<postId>` címre. |
| `failed` | „Nem sikerült feldolgozni.” + a nyers hibaüzenet kicsi mono betűvel + „ÚJRA” gomb (40 px). |

A forrástípus neve (cikk, YouTube-videó, arXiv-tanulmány, GitHub-repó, X-poszt, PDF) ugyanabból a HU/EN listából jön, amit a poszt-oldal és a Könyvtár használ. Ha ma több helyen van ilyen lista, a terv egyetlen közös helyre teszi.

## 2. Üzenet → beküldés

- **Tiszta függvény** a `lib/`-ben (`parseLinkMessage(text)`), teszttel:
  - az első `http://` vagy `https://` kezdetű szó a link; a végéről a `.,;:!?)]}'"` írásjelek levágódnak;
  - a szöveg többi része, a link nélkül, szóközökre egyszerűsítve és levágva, a megjegyzés; üresen `null`;
  - ha nincs link, az eredmény `{ error: "no_link" }`;
  - ha több link van, az első megy be, és az eredmény jelzi, hogy volt több (`moreLinks: true`).
- **Küldés:** a meglévő `POST /api/sources` `{ url, note }` törzzsel. A megjegyzést a route vágja 500 karakterre; a szálban a mentett megjegyzés látszik, így az is, ha levágódott.
- **Válaszok a szálban:**

| Válasz | Taiyaki |
| --- | --- |
| 202 | Azonnali frissítés a lekérdező route-ról; a beküldés `pending` válasszal jelenik meg. Ha `moreLinks`: „Egyszerre egy linket tudok fogadni, az elsőt küldtem be.” |
| 400 `invalid_url` | „Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.” |
| 409 `already_submitted` | „Ezt már beküldte valaki.” + „MEGNYITÁS →”, ha van már poszt. |
| 401 | „Lejárt a belépésed.” + link a `/login?next=<jelenlegi oldal>` címre. |
| hálózati hiba vagy 5xx | „Nem ment át, próbáld újra.” A beírt szöveg a mezőben marad. |
| link nélküli üzenet | „Egyelőre csak linket tudok fogadni.” Nem megy kérés. |

- **A 409 kiegészül:** a `POST /api/sources` 409-es válasza egy opcionális `postId`-t is visz, ha a meglévő forráshoz már van poszt. Ez csak bővítés, a mostani hívók nem változnak.

## 3. Adat és route-ok

### 3.1 `GET /api/sources/mine`

- `getReader()`; kijelentkezve 401 `unauthorized` (`jsonError`).
- A saját 10 legutóbbi forrás: `sources` `submitted_by = viewer.id` szűréssel (az RLS minden olvasónak megengedi a `select`-et, ezért a szűrés kötelező), `created_at` szerint csökkenően, a posztjával együtt (`posts(id, title, overrides)`).
- Válasz: `{ sources: [{ id, url, kind, status, error, note, createdAt, post: { id, title: { hu, en } } | null }] }`. A cím a beküldő átírásával, ugyanazzal a segédfüggvénnyel, amit a `toPost` használ.
- A lekérdezés és az átalakítás egy `lib/`-beli függvényben van, `fakeDb`-vel tesztelve; a route vékony.

### 3.2 `POST /api/sources/[id]/retry`

- `getReader()`; 401 kijelentkezve; nem pozitív egész id-re 404 (`parseId`).
- Olvasás olvasóként: 404, ha nincs ilyen forrás; 403 `forbidden`, ha nem a hívó küldte be; 409 `not_failed`, ha az állapota nem `failed`.
- Ezután az admin klienssel compare-and-swap: `status = 'pending', error = null, attempts = 0`, csak ha `id`, `submitted_by = viewer.id` és `status = 'failed'`. 0 sor → 409 `not_failed` (egy párhuzamos kattintás már elindította). Az `attempts` nullázása a tulajdonos döntése (2026-09-26): egy 300 s-nál megölt „Újra”-futás különben 3 vagy több próbával `pending`-ben ragadna, és a napi cron soha nem venné fel újra.
- Siker: 202 `{ ok: true }`, és `after(() => processSource(createAdminClient(), id))`. `maxDuration = 300`, mint a többi feldolgozó route-nál.
- Nincs cooldown: az állapot-CAS kizárja az átfedést, és minden futás egy felhasználói kattintás. `ponytail:` megjegyzés a kódban, hogy visszaélés esetén ide kerül egy várakozási idő.
- A logika egy `lib/`-beli függvényben van (`retrySource`), `fakeDb`-vel tesztelve: 403, 409, a CAS-feltételek és a 202.

### 3.3 Élő frissítés

- A panel nyitásakor egy lekérés; utána 4 másodpercenként, ha a panel nyitva van, `document.visibilityState === "visible"`, és van `pending` beküldés.
- Sikeres beküldés és „Újra” után azonnali lekérés.
- Ha a lekérés hibázik, a szálban egyszer megjelenik: „Most nem érem el a beküldéseidet.”; a következő sikeres lekérés eltünteti.
- Sémaváltozás nincs.

## 4. Hibakezelés, korlátok, biztonság

- **Nincs csendes hiba:** minden sikertelen kérés látható taiyaki-választ ad (2. és 3.3).
- **Csak a saját beküldések** látszanak: a szűrés a szerveren van, nem a kliensen.
- **Az „Újra”** csak a beküldőnek és csak `failed` sorra működik; az ellenőrzés a CAS feltételében is benne van, nem csak az előzetes olvasásban.
- **Linkek:** a szálban minden href `safeHref` (http/https); nyers HTML nincs.
- **Kulcsok:** a böngészőbe nem kerül Supabase-kulcs; minden adat a két route-on át jön.
- **Korlátok:** megjegyzés 500 karakter (a route vágja); a szál 10 beküldést mutat.

## 5. Tesztelés

- **Egységtesztek** (`node --test`):
  - `parseLinkMessage`: link nélkül; egy link megjegyzéssel; írásjel a link végén; zárójelben álló link; több link; csak szóközből álló megjegyzés; nagybetűs `HTTPS://`.
  - a források → szál-bejegyzések átalakítás: állapotok, a cím-átírás, a sorrend.
  - `retrySource` és a saját források lekérdezése `fakeDb`-vel: a `submitted_by` szűrés rögzítve van; 403, 409, CAS, 202.
- **Render-tesztek** (a meglévő harness): a szál mindhárom állapota, a helyi válaszok, a gomb `aria-*` attribútumai.
- **Előnézet:** a `lib/fixtures.ts` saját beküldés-mintákat kap mindhárom állapotban (negatív id-kkel, mint a többi minta), és az előnézet a chatet hálózat nélkül, mintaadatokkal rendereli.
- **Playwright az előnézeten**, 360 és 1280 px-en:
  - nincs vízszintes görgetés, a panel nyitva is;
  - mobilon a sáv öt helye, az Archívum a „Több” panelben;
  - a panel Esc-re bezárul, a fókusz a mezőbe, majd vissza a gombra kerül;
  - asztalon a visszavonás-csík és a gomb nem fedi egymást.
- **Futásidejű ellenőrzés:** az előnézet minden nézete 200-at ad, hiba nélkül (a dev szerveren).
- **Az öt ellenőrzés:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run dup` (0 klón).

## Jövőbeli bővítések (nem része ennek a specifikációnak)

- Szabad chat a gyűjtemény fölött (5. alprojekt), ugyanebben a panelben.
- „Törlés” a saját hibás beküldésre, a tükrözött képek eltakarításával (`removeUnusedMedia`).
- Telefonos megosztás-menü: PWA `share_target` a `manifest.ts`-ben (Android; iOS-en nem támogatott).
- Jelzés a gombon, ha zárt panel mellett elkészült egy beküldés.
- Billentyűparancs a panel nyitásához.
