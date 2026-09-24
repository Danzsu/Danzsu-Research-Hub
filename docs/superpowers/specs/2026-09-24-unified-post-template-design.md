# Egységes poszt-sablon és olvasóeszközök — specifikáció

**Dátum:** 2026-09-24 · **Állapot:** jóváhagyásra vár · **Alprojekt:** 1 / 5

## Kontextus

A NEON NEWS RADAR célja, hogy „második agyként” működjön: amit a felhasználó hasznosnak talál, azt később gyorsan visszakereshesse. Ehhez minden anyagot **az oldalon belül kell megemészteni**: a beküldött linkek tartalma átmásolódik, és egy **egységes sablonban** jelenik meg, amit csak szöveggel, képpel és videóval kell kitölteni. A designnal soha nem kell újra foglalkozni.

Ma a Library csak a cikkek nyers szövegét menti, bekezdésekre bontva, képek nélkül. A YouTube-videóknál csak összefoglaló van.

A tágabb terv öt alprojektből áll, ez az első:

1. **Egységes poszt-sablon és olvasóeszközök** ← ez a dokumentum
2. Privát gyűjtemény (linkek, idézetek, toolok, jegyzetek, keresés, export)
3. Statisztika oldal
4. Discord-bemenet (slash-parancs és üzenet-menü)
5. Chat-LLM a gyűjtemény fölött (pgvector, forrásmegjelölés)

## Döntések (a tervezés során egyeztetve)

| Kérdés | Döntés |
| --- | --- |
| Fő cél | Visszakeresés |
| Ki látja a saját jegyzeteket | Csak a tulajdonosuk (a posztok közösek maradnak a meghívott körrel) |
| Források | Cikk/blog, YouTube, arXiv/PDF, GitHub repo, X-poszt |
| Tartalommodell | Típusos blokkok JSON-ban, egy renderer (nincs nyers HTML) |
| Nyelv | Eredeti szöveg; magyar fordítás csak kattintásra, utána elmentve |
| Szerkesztés | Kis javítások: blokk elrejtése, cím/összefoglaló átírása, újrakinyerés. A szöveget nem lehet átírni. |
| Olvasóeszközök | Színes kiemelés és komment (privát), Key insights, Fogalmak — **mind csak kattintásra, az adott cikken belül** |
| Videó | Csak beágyazás, letöltés soha |
| Forrásjelölés | Minden poszton, linkkel az eredetire |
| `noarchive` oldalak | Nincs tükrözött szöveg és kép; helyette AI által saját szavakkal írt jegyzet, forráslinkkel |

## Hatókör

**M1 — Egységes sablon:** blokkmodell, forrásonkénti kinyerők, háromrétegű zajszűrés, képtükrözés, forrásjelölés, kérésre fordítás, kis javítások.

**M2 — Olvasóeszközök:** színes kiemelés és komment, „Jegyzeteim” panel, Key insights, Fogalmak (cikkben és `/glossary` oldalon).

**Nem része:** a 2–5. alprojekt, valamint a „Jövőbeli funkciók” szakaszban felsoroltak.

## 1. Adatmodell

### 1.1 Blokkok — `lib/blocks.ts`

Egyetlen zod-séma (`zod/v4`) írja le a blokkokat. Ez validálja a kinyerők kimenetét, a modell-válaszokat (fordítás) és a teszteket.

```ts
type Inline = { text: string; href?: string; bold?: true; italic?: true; code?: true };

type Block = { id: string } & (
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; content: Inline[]; cite?: string }
  | { type: "code"; language?: string; code: string }
  | { type: "image"; path: string | null; originalUrl: string; alt: string; caption?: string;
      width: number; height: number; placeholder?: string /* ~300 bájtos base64 előnézet */ }
  | { type: "video"; provider: "youtube"; videoId: string; start?: number }
  | { type: "chapters"; items: { seconds: number; title: string }[] }
  | { type: "repo"; fullName: string; stars: number; language?: string; topics: string[]; license?: string }
  | { type: "divider" }
);
```

- **`id`:** a blokk típusából és normalizált szövegéből képzett rövid hash, azonos blokkoknál sorszámmal kiegészítve (`…-2`). Nem a pozícióból jön, ezért újrakinyerés után is stabil. Erre hivatkozik az elrejtés, a kiemelés és a Key insights forráshivatkozása.
- **Link (`href`):** csak `http:` és `https:` maradhat; minden más kiesik.
- **`image.path`:** `null`, ha a kép nem tölthető le. Ilyenkor „kép nem elérhető” jelzés és link az `originalUrl`-re.

### 1.2 Adatbázis-változások (új migráció)

- **`posts`:**
  - `body` törlődik (a tábla most üres)
  - `blocks jsonb not null default '[]'`: eredeti nyelv
  - `blocks_hu jsonb`: csak kattintásra töltődik
  - `meta jsonb not null default '{}'`: forrásfüggő adatok (arXiv-id, szerzők, repo-statisztika, videóhossz), plusz a jelzők: `mirrored` (a teljes szöveg átmentve), `noarchive`, `extractionFailed`, `truncated` (mind `boolean`)
  - `source_site text`, `published_at date`: a forrásjelöléshez
  - `overrides jsonb not null default '{}'`: kézzel átírt `title` / `summary`
  - `hidden_blocks text[] not null default '{}'`
  - `extracted_at timestamptz`: az újrakinyerés 10 perces várakozásához
  - `insights jsonb`, `glossary_done boolean default false` (M2)
- **`sources.kind`:** az ellenőrzés bővül: `article`, `youtube`, `arxiv`, `github`, `x`, `pdf`.
- **`model_settings`:** új feladatok (a `task` check bővül), tartalékkal:
  - `ingest_pdf` (Gemini)
  - `ingest_cleanup` (Groq, tartalék: Gemini Flash-Lite)
  - `translate_post`
  - `post_insights` és `post_glossary` (M2)
- **`annotations`** (M2):
  - mezők: `id`, `user_id default auth.uid()`, `post_id` (cascade), `block_id text null`, `lang text check in ('orig','hu')`, `exact`, `prefix`, `suffix`, `color text check in ('important','idea','question')`, `comment text`, `created_at`, `updated_at`
  - RLS: csak a saját sorok
  - index: `(user_id, post_id)`
  - `block_id = null`: a poszt alatti, szöveghez nem kötött komment
- **`glossary_terms`** (M2): `id`, `term`, `normalized unique`, `definition jsonb {hu,en}`, `created_at`. **`glossary_occurrences`:** `(term_id, post_id)` PK. Olvasni minden bejelentkezett felhasználó tud, írni csak a secret key.
- **`update_post_overrides(p_post, p_overrides, p_hidden)`**: `security definer` Postgres-függvény. Csak akkor ír, ha a hívó a poszt forrásának beküldője (`sources.submitted_by = auth.uid()`). Az RLS oszloponként nem tud korlátozni, ezért nem elég.
- **Storage:** privát bucket `media` néven.

## 2. Kinyerés

### 2.1 Forrás felismerése — `detectSource(url)`

Tiszta függvény, teszttel. A beküldött URL alapján ad vissza `SourceKind`-ot:

- `youtube.com` / `youtu.be` → `youtube`
- `arxiv.org/abs|pdf|html/<id>` → `arxiv`
- `github.com/<owner>/<repo>` (további útvonal nélkül vagy `/tree/...`) → `github`
- `x.com|twitter.com/<user>/status/<id>` → `x`
- `.pdf` végű URL → `pdf`
- minden más → `article`. Ha az `article` letöltésekor `application/pdf` tartalomtípus jön vissza, a `pdf` kinyerő veszi át (ezt már nem az URL dönti el, hanem a válasz).

### 2.2 Kinyerők — `lib/pipeline/extract/<kind>.ts`

Mindegyik ugyanazt adja vissza: `{ blocks, meta, title, author, siteName, publishedAt }`.

| Forrás | Módszer |
| --- | --- |
| `article` | DOM-takarítás → Readability → **HTML→blokk átalakító** (`html-to-blocks.ts`) |
| `youtube` | oEmbed-metaadat; `video` blokk; a Gemini a videóból `chapters` blokkot ír (időbélyeggel) |
| `arxiv` | Ha elérhető, `arxiv.org/html/<id>` → átalakító (ábrákkal; a képletek szöveges alakjukban maradnak meg). Ha nem, az arXiv API-ból jön az absztrakt és a metaadatok, a PDF pedig a `pdf` kinyerőhöz megy. |
| `pdf` | A Gemini natívan olvassa a PDF-et (legfeljebb 20 MB, inline adatként), és blokkokat ad vissza. Csak szöveges blokkok, ábrák nélkül. |
| `github` | A repo adatai → `repo` blokk; a README a GitHub API-ból renderelt HTML-ként (`application/vnd.github.html+json`) → átalakító; a relatív kép- és linkhivatkozások abszolútra írva |
| `x` | `publish.twitter.com/oembed` → egyetlen poszt szövege. **Korlát:** szál és képek nélkül; a `meta.truncated` jelzi. (A végpont elérhetőségét a megvalósítás elején ellenőrizni kell.) |

**Visszaesési lánc:** ha a forrásfüggő kinyerő elbukik, az `article` kinyerő próbálkozik. Ha az is elbukik, a poszt metaadat-alapú lesz (`og:title` / `og:description` alapján írt összefoglaló, `meta.mirrored = false`, `meta.extractionFailed = true`, jelzés a felületen). Csak a letöltés teljes hibája `failed`.

### 2.3 Zajszűrés (három réteg)

1. **A Readability előtt: DOM-takarítás.**
   - Kiesik: `script`, `style`, `noscript`, `form`, `button`, `nav`, `aside`, `footer`, `[role=navigation|banner|complementary]`, `[aria-hidden=true]`.
   - Kiesnek azok az elemek is, amelyeknek az osztálya vagy azonosítója illeszkedik erre: `/\b(ad|ads|advert|sponsor|promo|newsletter|subscribe|share|social|related|comments?|cookie|popup|modal|banner|paywall)\b/i`, valamint a `data-ad*` attribútumos elemek.
   - Az `iframe`-ek közül csak a YouTube és a Vimeo marad.
2. **Blokkszűrés az átalakítás után:**
   - kiesnek a 64 px-nél kisebb képek, a követő pixelek, és azok a képek, amelyek URL-je ikonra, logóra, avatárra, emojira, jelvényre vagy spritera utal
   - kiesnek a megosztó linkek (`twitter.com/intent`, `facebook.com/sharer`, `linkedin.com/shareArticle`)
   - kiesnek a HU/EN sablonmondatok egy listából: subscribe, newsletter, share this, follow us, advertisement, sponsored, related articles, iratkozz fel, kapcsolódó cikkek…
   - kiesnek a csak linkből álló rövid bekezdések, az üres blokkok és az egymás után ismétlődő blokkok
3. **AI-ellenőrzés (`ingest_cleanup`):** a modell blokkonként csak az `id`-t, a típust és az első 120 karaktert kapja meg, és a hirdetés vagy sablonszöveg blokkok `id`-jeit adja vissza. Ha hibázik, ez a lépés kimarad.

### 2.4 A feldolgozás lépései — `processSource`

1. A `detectSource` eldönti a forrást, a letöltés a `safeFetch`-en megy (minden átirányításnál DNS- és IP-ellenőrzés).
2. A kinyerő blokkokat ad, mindegyiket stabil `id`-vel.
3. A zajszűrés három rétege lefut.
4. Ha az oldal `noarchive`: a blokkok helyett az AI saját szavakkal írt jegyzete kerül be (összefoglaló és strukturált tények; szó szerinti szöveg legfeljebb rövid, idézőjelbe tett idézetként), képek nélkül, `meta.mirrored = false`, `meta.noarchive = true`.
5. A képek tükrözése (3. szakasz).
6. Cím, összefoglaló és kulcspontok HU/EN (a meglévő `ingest_article` / `ingest_video` feladat).
7. Mentés: `blocks`, `meta`, a forrásjelölés mezői, `extracted_at`.

Futás: `after()` a beküldés után, legfeljebb 300 másodpercig. Ha nem fér bele, a napi cron újrapróbálja (legfeljebb 3-szor).

### 2.5 Újrakinyerés

- Csak a beküldő indíthatja, 10 percenként legfeljebb egyszer.
- Csak a gépi mezőket írja újra: `blocks`, `meta`, összefoglaló. Az `overrides` és a `hidden_blocks` sosem íródik felül.
- **Csak siker esetén cserél.** Ha az eredeti link már nem él, a régi változat marad, és a felület hibaüzenetet mutat.
- A meglévő képeket újra felhasználja (azonos útvonal), a már nem használtakat törli.
- Törli a `blocks_hu`-t, mert a fordítás elavult; a kiemelések a pontos szöveg alapján keresik újra a helyüket.

## 3. Képek

| Szempont | Megoldás |
| --- | --- |
| Letöltés | `safeFetch` (a kép-URL is idegen oldaltól jön, belső címre is mutathatna); tartalomtípus-ellenőrzés; legfeljebb 5 MB; legfeljebb 30 kép posztonként; 4 párhuzamosan |
| Feldolgozás | `sharp` (a `package.json`-ba pontos verzióval felvéve), `limitInputPixels` bekapcsolva; AVIF 640 és 1280 px szélességben; animált kép → animált WebP; SVG változatlanul |
| Útvonal | `media/<source_id>/<az eredeti URL sha1-e>-<szélesség>.avif`, tartalom alapján, így újrafelhasználható. `source_id`, mert egy forráshoz egy poszt tartozik, és a poszt azonosítója még nem létezik, amikor a képek feltöltődnek. |
| Elrendezés-ugrás ellen | A blokk tárolja a `width`/`height`-et és egy kb. 300 bájtos elmosott `placeholder`-t |
| Kiszolgálás | `app/media/[...path]/route.ts`: belépés ellenőrzése, streamelés a Storage-ból. Fejlécek: `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`. (Aláírt URL nem jó, mert minden oldalbetöltéskor más, és a böngésző újratöltené.) |
| Megjelenítés | `<img srcset sizes loading="lazy" decoding="async">`; az első kép `fetchpriority="high"`. A Next.js `<Image>` optimalizálóját nem használjuk. |
| Törlés | A forrás törlésekor (takedown) a `media/<source_id>/` mappa is törlődik |

## 4. Megjelenítés

### 4.1 A poszt oldal — `app/library/[id]/page.tsx`

1. **Forrásjelölő fejléc** (fix, minden posztnál): a forrás típusa, `source_site`, szerző, `published_at`, olvasási idő és az **„Eredeti forrás”** gomb. Ha `meta.noarchive`: „Saját összefoglaló, az eredeti: [link]”. Ha `meta.extractionFailed`: „A tartalmat nem sikerült átmenteni, az eredeti: [link]”. Ha `meta.truncated`: „Csak az első poszt került be”.
2. **Cím, összefoglaló, kulcspontok**: az `overrides` előnyt élvez.
3. **Eszközsor:** Eredeti / Magyarul, Key insights és Fogalmak (M2), valamint a beküldőnek a Szerkesztés gomb.
4. **Tartalom:** `app/components/post-blocks.tsx`, egy kb. 68 karakteres olvasóoszlopban.
5. **Jegyzetek** (M2): a poszt alatti kommentek és a „Jegyzeteim” lista.

### 4.2 Renderer — `post-blocks.tsx`

Blokktípusonként egy elem, a meglévő design-szabályok szerint (`CLAUDE.md`):

| Blokk | Megjelenés |
| --- | --- |
| `heading` | display betű |
| `paragraph` | 17 px, szellős sorköz |
| `quote` | signal bal szegély |
| `code` | ink háttér, mono betű, a blokkon belül görget |
| `image` | `<figure>` képaláírással |
| `video` | 16:9 `youtube-nocookie` iframe |
| `chapters` | időbélyeg-gombok, amelyek a videót a megfelelő percre állítják |
| `repo` | kártya a repo adataival |
| `divider` | elválasztó |

- Az elrejtett blokkok helyén egy „N elrejtett blokk, megjelenítés” sáv látszik.
- `dangerouslySetInnerHTML` nincs.
- A renderer `annotations` és `glossary` bemenetet is kap (M2), és a kiemeléseket, valamint a fogalmak aláhúzását egy **tiszta függvény** (`applyMarks`) számolja ki a blokkok szövegéből, kirajzolás közben. Így a DOM-ot nem kell utólag módosítani.

### 4.3 Fordítás (kérésre)

- `POST /api/posts/[id]/translate` → `translate_post` feladat.
- A modell a blokklistát kapja, és ugyanezt a szerkezetet adja vissza, csak lefordított szöveggel.
- Mentés csak akkor, ha az `id`-k, a típusok és a darabszám egyezik. Ezután a `blocks_hu`-ba kerül, és az Eredeti / Magyarul kapcsoló vált közöttük.

### 4.4 Kis javítások

- A **Szerkesztés** gomb csak a beküldőnek látszik. Ilyenkor a cím és az összefoglaló szerkeszthető, és minden blokk mellett van egy elrejtés-ikon. Mentés az `update_post_overrides` függvénnyel.
- **Újrakinyerés:** `POST /api/posts/[id]/reextract` (2.5 szakasz).

## 5. Olvasóeszközök (M2) — mind csak kattintásra

### 5.1 Kiemelés és komment (privát)

- **Jelölés:** kijelölés egy blokkon belül → eszköztár: **Kiemelés** (Fontos / Ötlet / Kérdés) és **Komment**. Telefonon az eszköztár alul, rögzítve jelenik meg.
- **Horgony:** `block_id`, `exact`, és az előtte, illetve utána álló 32 karakter (`prefix`, `suffix`), a W3C TextQuoteSelector mintájára. A nyelv (`orig` vagy `hu`) is mentődik, a kiemelés abban a nézetben jelenik meg.
- **Megjelenés:**
  - Fontos: `<mark>` signal-árnyalattal
  - Ötlet: cián
  - Kérdés: pontozott aláhúzás
  - Rákattintva megnyílik a komment, szerkeszthető és törölhető.
- **„Jegyzeteim”:** asztali gépen egy jobb oldali, rögzített panel, mobilon a poszt alatt, gombbal nyitva. A szöveg sorrendjében mutatja a jegyzeteket, színenként szűrhető, kattintásra a helyükre görget és felvillantja őket.
- **Újrahorgonyzás:** ha a `block_id` nem található, a teljes szövegben keressük az `exact` + `prefix`/`suffix` hármast. Ha így sincs meg, „helye nem található” jelöléssel marad a listában.
- **API:** `/api/annotations` (létrehozás, módosítás, törlés). A felhasználót az RLS és az `auth.uid()` alapértelmezés azonosítja.

### 5.2 Key insights (közös, egyszer készül el)

- `POST /api/posts/[id]/insights` → `post_insights` feladat.
- Kimenet: `{ text: {hu,en}, importance: "high"|"medium"|"low", blockId }[]`. Ez a `posts.insights`-ba kerül.
- Megjelenés: ●●● / ●● / ●. Kattintásra a forrásbekezdéshez görget. Ha elkészült, a rövid kulcspontok helyére ez kerül.

### 5.3 Fogalmak / glosszárium (közös)

- `POST /api/posts/[id]/glossary` → `post_glossary` feladat. Kimenet: fogalmak HU/EN definícióval, ebben a szövegkörnyezetben értelmezve.
- A fogalmak `normalized` alakjuk alapján kerülnek a `glossary_terms`-be: ami már létezik, az megtartja a definícióját, és csak egy új `glossary_occurrences` sort kap. A posztnál `glossary_done = true` lesz.
- A cikkben minden fogalom első előfordulása pontozott aláhúzást kap, rámutatásra vagy koppintásra megjelenik a definíció.
- **`/glossary` oldal:** A–Z, keresővel, fogalmanként a posztokra mutató linkekkel. Csak a már lekért fogalmak szerepelnek benne.

## 6. Hibakezelés, korlátok, biztonság

- **Korlátok:** 400 blokk vagy 200 000 karakter; 30 kép × 5 MB; 20 MB PDF; 300 másodperces futás.
- **Modellhiba:** a `model_settings`-ben megadott tartalék modell jön. Ha az AI-zajszűrés hibázik, csak a szabályok futnak.
- **Kérésre futó funkciók:** hiba esetén a gomb hibát jelez és újra megnyomható; részleges eredmény nem mentődik.
- **Biztonság:**
  - minden idegen letöltés a `safeFetch`-en megy (a képek is)
  - nincs nyers HTML
  - linkekből csak `http(s)`
  - `sharp` pixel-korláttal
  - a `/media` route csak belépve érhető el, `nosniff` és CSP fejléccel
  - a posztot csak a beküldő módosíthatja, ezt a Postgres-függvény ellenőrzi

## 7. Tesztelés

- **Egységtesztek** (`node --test`; az `npm test` mintája `lib/**/*.test.ts`-re bővül):
  - `html-to-blocks`: teszt-HTML-eken, köztük hirdetéssel, megosztó gombokkal, hírlevél-dobozzal, ikonképekkel, kapcsolódó cikkekkel. Mindegyiknél bizonyítani kell, hogy kiesik.
  - a blokk-`id` stabilitása (blokk beszúrása után is ugyanaz)
  - `detectSource` minden forrástípusra
  - `applyMarks` és az újrahorgonyzás
  - a linkek tisztítása (`javascript:` kiesik)
  - a fordítás szerkezetének ellenőrzése (eltérő `id` vagy darabszám esetén elutasítás)
- **Élő próba helyben:** forrástípusonként egy valódi link (cikk, YouTube, arXiv HTML, arXiv csak PDF-fel, GitHub, X, PDF), majd Playwright-os képernyőképek 360 és 1280 px-en, és ellenőrzés, hogy nincs vízszintes görgetés.
- **Ellenőrzés:** a type check, a lint, a tesztek és a build hibátlan.

## Jövőbeli funkciók (nem része ennek az alprojektnek)

- **Saját online könyvtár:** PDF-ek és könyvek egy GitHub-repóban tárolva, nem a Supabase bucketban. A poszt a repóban lévő fájlra hivatkozna. A `pdf` kinyerő ebben az esetben kivételt kap: a tárolás a GitHubon marad.
- Margós kommentek, amelyek a kiemelés magasságában állnak, mint a Google Docsban.
- Bekezdéseken átívelő kiemelés.
- X-szálak és X-képek teljes beolvasása.
- A 2–5. alprojekt: privát gyűjtemény, statisztika, Discord-bemenet, chat-LLM.
