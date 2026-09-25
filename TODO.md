# TODO

## A. Beállítás (ez a te dolgod, kód nem kell hozzá)

### 0. Kód
- [x] A `vercel-supabase-pipeline` branch commitolása, beolvasztása a `main`-be és pusholása

### 1. Supabase
- [ ] Új projekt a [supabase.com](https://supabase.com)-on. Régiónak EU-t válassz (pl. Frankfurt).
- [ ] *Authentication → Sign In / Providers*: az **Allow new users to sign up** legyen **KI**. Ez a meghívólista.
- [ ] *Authentication → URL Configuration*:
  - Site URL: `https://neon-news-radar.vercel.app`
  - Redirect URLs: add hozzá a `https://neon-news-radar.vercel.app/**` címet (a `http://localhost:3000/**` maradhat a helyi próbához)
- [ ] **Saját SMTP nélkül a sablonok nem szerkeszthetők** (2026-09-25). Addig két szabály érvényes:
  - Magadat a *Users → Add user → Create new user* (Auto Confirm) menüben vedd fel, ne meghívóval. Az alap „Invite” sablon linkje nem léptet be.
  - A belépő linket ugyanabban a böngészőben nyisd meg, ahol kérted. Az alap Magic Link a `?code=` (PKCE) utat használja.
- [ ] *Authentication → Email Templates* (csak saját SMTP után):
  - Magic Link: a link legyen `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
  - Invite user: a link legyen `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`
  - A sablonok szövegében a név legyen **NEON NEWS RADAR** (a kód már így hívja az oldalt)
- [ ] Ajánlott: *Authentication → SMTP Settings*, saját SMTP (pl. Resend, ingyenes kerettel). A beépített levélküldés csak a Supabase-projekt csapatának tagjaihoz kézbesít, és óránként csak néhány emailt enged, ez meghívásnál gyorsan elfogy.
- [ ] *Project Settings → API Keys*: a `Publishable` és a `Secret` kulcs kimásolása
- [ ] A séma feltöltése: *SQL Editor*, a fájlokat egyenként, a [README migrációs táblázatának](README.md#migrations) sorrendjében, mindig csak az előző sikere után. A `…_drop_post_body.sql` csak az M1 deployja után jön, lásd lent.
  - ⚠️ **Ne futtasd a `supabase db push`-t:** idő előtt lefuttatná a drop migrációt, pedig az éles oldal még olvassa a `posts.body`-t. Ez a figyelmeztetés addig marad, amíg a lenti „Csak az M1 deployja után” pont kész nincs.
- [ ] Ellenőrzés a *Table Editor*-ban: 8 tábla (a `model_settings`-szel együtt) és egy `archive_issues` view, mindegyik táblán „RLS enabled”
- [ ] *Authentication → Users → Invite user*: meghívod magad
- [x] **Egységes poszt-sablon (M1) migrációja** (`20260924000000_post_blocks.sql`): lefutott és ellenőrizve, 2026-09-24. Megvannak az új `posts`-oszlopok, a privát `media` bucket, a 7 `model_settings` sor, és az `update_post_overrides` jogosultság-ellenőrzése is működik.
  - A Security Advisor két figyelmeztetése szándékos, nem kell javítani:
    - `update_post_overrides` SECURITY DEFINER: a függvény maga ellenőrzi, hogy a hívó a beküldő-e, és csak a saját két oszlopát írja.
    - Leaked Password Protection: jelszó nincs, csak magic link van.
- [ ] Halasztott élő próbák (ezeket én futtatom): `npm run ingest -- <url>` mind a hat forrástípusra, a képek a `/media` route-on, fordítás, szerkesztés és újrakinyerés. Egy X-poszt is legyen benne: az X, a YouTube és az arXiv fix hostjai új User-Agentet kapnak (`apiFetch`), ezt élesben még nem próbáltuk.
- [ ] **Csak az M1 deployja után:** futtasd le a `supabase/migrations/20260925000000_drop_post_body.sql`-t (a régi `posts.body` oszlop törlése)
  - Előtte: `select count(*) from posts where body is not null;` Ennyi posztnak van még régi, átmentett szövege, ami a droppal elvész (a blokkok nem ebből épülnek). Ha nem 0, döntsd el, kell-e őket előbb újrakinyerni.
  - ⚠️ A drop után egy Vercel *Instant Rollback* egy M1 előtti deploymentre elrontja a Library-t: a régi kód a `posts.body`-t olvassa.

### 2. API kulcsok
- [ ] **Gemini**: [aistudio.google.com](https://aistudio.google.com) → *Get API key*. Az ingyenes keretnél a Google felhasználhatja a beküldött adatot. Nyilvános hírekhez ez rendben van, de ha zavar, kapcsold be a fizetős csomagot.
- [ ] **Groq** (opcionális): [console.groq.com](https://console.groq.com) → API Keys
- [ ] **GitHub token** (opcionális): *Settings → Developer settings → Fine-grained token*, jogosultság nélkül. A GitHub API limitjét emeli a napi repókeresésnél és a GitHub-kinyerőnél.
- [ ] **CRON_SECRET**: egy hosszú, véletlen szöveg, pl. `openssl rand -hex 32`

### 3. Helyi próba
- [ ] `cp .env.example .env.local`, majd a kulcsok beírása
- [ ] `corepack pnpm@11.25.0 install --frozen-lockfile`, majd `npm run dev`
- [ ] Belépés a `http://localhost:3000/login` oldalon a meghívott címeddel. Az emailben kapott link a Site URL-re (az éles címre) mutat: a link elejét cseréld `http://localhost:3000`-ra, a Site URL-t ne írd át.
- [ ] Az első kiadás elindítása:
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
  ```
  Egy JSON-t kell kapnod `inserted` és `repos` számokkal, a főoldalon pedig meg kell jelenniük a híreknek.
- [ ] A `/library` oldalon egy YouTube-link és egy cikklink beküldése. Pár perc után mindkettőnek posztként kell megjelennie.

### 4. Vercel
- [ ] [vercel.com](https://vercel.com) → *Add New → Project* → a GitHub repó importálása. A Next.js-t és a pnpm-et magától felismeri.
- [ ] *Settings → Environment Variables*: minden változó a `.env.example`-ből (Production és Preview; a Development is, ha a sima `vercel env pull`-nak is működnie kell, különben `vercel env pull --environment=production .env.local`)
- [x] Deploy
- [ ] A projekt átnevezése `neon-news-radar`-ra (*Settings → General*), és a cím átírása `neon-news-radar.vercel.app`-ra (*Settings → Domains*)
- [ ] **Lockfile-védelem ellenőrzése:** *Settings → Build and Deployment → Install Command*. A kívánt állapot: a Vercel a `pnpm-lock.yaml` szerint, frozen módban telepít, és pnpm 11-et használ, hogy a `pnpm-workspace.yaml` 7 napos korhatára (`minimumReleaseAge`) érvényesüljön. Ha a mező üres, a pnpm CI-ban alapból frozen módban fut. Szólj, mit látsz ott, és ha kell, beállítom a `vercel.json`-ban.
- [ ] A Supabase URL Configuration átírása erre a címre (lásd az 1. pontot), utána új meghívó küldése
- [ ] Az első futás élesben: ugyanaz a `curl`, csak `https://<vercel-domain>/api/cron/daily`-re
- [ ] Másnap reggel: *Vercel → Project → Logs / Cron Jobs*, lefutott-e a napi job

### 5. Opcionális: hogy én is hozzáférjek
- [ ] A Supabase és a Vercel MCP engedélyezése a `/mcp` alatt. Utána a migrációt, az env-eket és a logokat én is meg tudom nézni.

---

## B. Funkciók (fontossági sorrendben)

### Kész
- [x] **Reszponzív UX:** mobilos chip-sáv a kategóriákhoz, a haladás és a to-do lenyíló panelben (`2xl` alatt), 360 px-en sincs vízszintes görgetés, legalább 40 px-es érintési felületek, betöltési, hiba- és 404-oldal, `manifest` (kezdőképernyőre tehető)
- [x] **Sidebar-hiba:** a Tailwind 3-as szintaxis miatt asztali nézetben hibás volt a sidebar szélessége
- [x] **Archívum részletoldal:** `/archive/2026-W38`, ugyanazzal az olvasó felülettel
- [x] **Nyelvválasztás megjegyzése:** `lang` cookie, minden oldal ezt használja
- [x] **Márkanév:** NEON NEWS RADAR

### Kutatási dashboard — ütemterv (5 alprojekt)
- [ ] **1. Egységes poszt-sablon és olvasóeszközök.** Specifikáció: [docs/superpowers/specs/2026-09-24-unified-post-template-design.md](docs/superpowers/specs/2026-09-24-unified-post-template-design.md).
  - [x] **M1:** blokkok, kinyerők, zajszűrés, képek, fordítás, kis javítások.
  - [ ] **M2 olvasóeszközök** — terv szükséges. Kiemelés és komment, Key insights, Fogalmak.
- [ ] **2. Privát gyűjtemény:** linkek, idézetek (a kiemelésekből is), toolok, jegyzetek; címkék, Inbox / Később / Archív, keresés, export.
- [ ] **3. Statisztika oldal:** heti mentések, hőtérkép, top források, címkézetlen és halott linkek.
- [ ] **4. Discord-bemenet:** slash-parancs és üzenet-menü, ugyanarra a mentési útvonalra.
- [ ] **5. Chat-LLM a gyűjtemény fölött:** pgvector, Gemini embedding, válasz forrásmegjelöléssel.
  - Kiválasztott modellek (2026-09-24, Google AI Studio). A `model_settings`-be a chat alprojekttel együtt kerülnek be, feladatonként:

    | Feladat | Modell | Miért |
    | --- | --- | --- |
    | `chat_answer` | `gemini-3.8-flash`, tartalék: `gemini-3.7-flash` | stabil, van ingyenes kerete, tud gondolkodni (thinking), függvényt hívni és Google Search / URL alapján ellenőrizni |
    | `chat_rewrite` (követő kérdés átírása, olcsó lépések) | `gemini-3.5-flash-lite` | gyors és olcsó |
    | `chat_embed` | `gemini-embedding-001`, **1536 dimenzió** | stabil; a pgvector HNSW-indexe `vector` típusnál legfeljebb 2000 dimenziót kezel. A 3072-nél kisebb méretű vektort normalizálni kell. |
    | opcionális „mély” mód | `gemini-3.1-pro-preview` | csak kapcsolóval: preview, nincs ingyenes kerete, és kb. 2,7-szer drágább |
  - **Az embedding modell „ragad”.** Ha később a `gemini-embedding-2`-re (multimodális: kép, PDF, videó) váltunk, mindent újra kell vektorizálni, ezért a vektor mellett a modellnevet is tároljuk. A 2-es jelenleg preview, ezért még nem erre építünk.
  - **Ár:** a 3.8 és a 3.7 Flash ára 2027. január 1-jén megduplázódik (input $0.75 → $1.50, output $3.75 → $7.50 / 1M token).
- [ ] **Jövőbeli:** saját online könyvtár, ahol a PDF-ek és könyvek egy GitHub-repóban vannak, nem a Supabase bucketban.

### Új ötletek (2026-09-24), a tervezés sorrendjében
- [x] **Asztali navigáció** (döntés: 2026-09-25): az **A** (oldalsáv) az alap, és egy gombbal vagy a `[` billentyűvel keskeny ikonsávvá csukható, mint a C változat. A választást egy cookie jegyzi meg.
  - A spec: [docs/superpowers/specs/2026-09-24-ux-signals-search-design.md](docs/superpowers/specs/2026-09-24-ux-signals-search-design.md)
- [ ] **UI/UX és keresés** (spec kész, terv következik):
  - egységes navigáció: asztalon oldalsáv vagy felső sáv, mobilon alsó sáv
  - mobilos ergonómia
  - okos keresés a címekben: elgépelés-tűrő, jelentés szerint is talál, szűrők
  - lapozás
  - offline előnézeti oldal mintaadatokkal, Playwright-tesztekkel
- [ ] **Olvasási jelzések:**
  - kedvenc (szív), plusz like / dislike a Radar-híreknél és a Library-posztoknál
  - a „nem hasznos” tétel az archívumban marad, csak halványítva jelenik meg, és kiszűrhető
- [ ] **Habit tracker a dashboardon:** saját szokások napi pipálással és sorozatszámlálóval. A statisztika alprojekthez kapcsolódik.
- [ ] **Kapcsolatok és kategorizálás, GitHub-archívum** (Obsidian-vault). A UI/UX design után írunk rá tervet. Döntés, 2026-09-24:
  - **1. lépés: export.** Hetente egy privát GitHub-repóba mentünk, heti mappákba (`2026/W38/cím.md` + JSON + képek). A fájlok frontmattert (címkék, forrás, értékelés) és `[[wikilinkeket]]` kapnak a kapcsolódó posztokhoz, így az Obsidian gráfnézete magától működik. Minden poszt kap egy `last_active_at` időbélyeget. A Supabase-ből ekkor még semmi nem törlődik.
  - **2. lépés: hideg tárolás.**
    - Ami egy hónapja nem változott, annak a nehéz tartalma (blokkok, képek) a GitHubról töltődik be.
    - Tartalmi változáskor (újrakinyerés, fordítás) visszatöltjük a Supabase-be, és új időbélyeget kap.
    - A saját jelölések (értékelés, olvasottság, kiemelés, komment) mindig a Supabase-ben maradnak, ezért nem kell hozzájuk visszatöltés.
  - **Szabályok:**
    - Törölni csak akkor szabad, ha a GitHub-commitot visszaolvastuk és egyezik.
    - Ha a GitHub nem érhető el, a poszt a megmaradt adatokból jelenik meg.
    - A token lejárata ellen GitHub Appot vagy lejárat előtti figyelmeztetést használunk.
    - A repó privát.
  - **Nyitott kérdés:** a chat-indexhez a szövegdarabokat is a DB-ben tartjuk-e, vagy a GitHubról olvassuk. Ezt a chat tervezésekor döntjük el.
- [ ] **Kabala (mascot) az oldalra**, hogy barátságosabb legyen.
- [ ] **Kutatási források bővítése és priorizálás:**
  - Új források az arXiv mellé:
    - Hugging Face Daily Papers (a közösség által felszavazott napi cikkek)
    - Semantic Scholar és OpenAlex (a Google Scholar helyett: annak nincs API-ja, és a letöltését a feltételei tiltják)
    - **research.google** (a felhasználó kérésére, közvetlenül az M1 15. feladata után): a Google Research blogja és a publikációs oldala (`research.google/pubs`). A pontos RSS- vagy API-végpontot a megvalósítás elején ellenőrizni kell.
    - IBM Research és Microsoft Research blog, valamint az IBM Technology cikkei és videói
    - Google DeepMind: már bent van, csak a súlyozását kell a kiemelt források közé emelni
    - Anthropic: news és engineering posztok. Hivatalos RSS-t nem ismerek, ezért ezt a megvalósítás elején ellenőrizni kell. Ha nincs, oldal-letöltéssel kerülhet be.
  - Szűrés, hogy ne legyen túl sok (döntés, 2026-09-24):
    - naponta legfeljebb kb. 8 kiemelt tétel, csak 60 pont felett;
    - a 40–59 pontosak egy összecsukott „Többi” szakaszba kerülnek, és a keresésben is megtalálhatók;
    - forrásonkénti limit;
    - ugyanaz a hír csak egyszer jelenik meg, akárhány forrásból jön.
  - A lista pontszám szerint rendezve jelenik meg.

### Következő lépések
- [ ] **Admin szerepkör.** Most minden meghívott egyenrangú. Kell egy `ADMIN_EMAILS` env és egy admin API route. Erre épül a következő pont.
- [ ] **Hibás beküldések kezelése.** „Újra” és „Törlés” gomb (a saját beküldésnél a beküldőnek, egyébként az adminnak), és a posztok eltávolítása (takedown).
- [ ] **Lassú archívum** (a felhasználó jelezte 2026-09-25-én): a „Heti archívum” sokáig tölt. Kijelentkezve a szerver gyors (0,13–0,7 mp), ezért az ok a bejelentkezett úton vagy a route hideg indulásában lehet. A kivizsgáláshoz bejelentkezett mérés kell: engedély egy egyszeri teszt-munkamenetre, vagy a megfigyelésed (minden kattintásnál lassú-e, hány másodperc, mi látszik közben).
- [ ] **Hibajelzés.** Ha a napi futás elbukik (Gemini-limit, lejárt kulcs), senki nem kap értesítést. Telegram-bot vagy email kellene. Addig a hiba a Vercel cron-logjában látszik.
- [ ] **GitHub-token lejárat-figyelmeztető** (a GitHub-archívumhoz és a `GITHUB_TOKEN`-hez).
  - A GitHub a fine-grained token minden API-válaszában visszaküldi a lejárati dátumot (`GitHub-Authentication-Token-Expiration` fejléc).
  - A napi cron ezt kiolvassa, és 14, 7 és 1 nappal a lejárat előtt figyelmeztet a hibajelző csatornán (email vagy Telegram).
  - A lejárt tokent logban és a cron válaszában is jelezze, ne hibázzon csendben.
  - Alternatíva: GitHub App, amelynek a tokenje nem jár le.
- [ ] **Library keresés.** Postgres full-text search egy `search_posts` RPC-vel, a Library fejlécében egy keresőmezővel.
- [ ] **Tag-szűrő.** A hírkártyák `#tag`-jei legyenek kattinthatók, és szűrjék a feedet.

### Tartalom minősége
- [ ] **Valódi GitHub trending.** Most csak a héten *létrehozott* repókat rangsorolja csillag szerint. A régebbi, de most gyorsan növő repókhoz napi csillagszám-mentés és a különbség számítása kell.
- [ ] **Beküldött posztok a Radarban.** A Library-posztok nem jelennek meg a heti feedben.
- [ ] **Paywall-felismerés.** Most csak a `noarchive` jelzést figyeli. A fizetős cikkekből csak a nyilvános eleje kerül be.
- [x] **Képek tükrözése** a Supabase Storage-ba. Az M1 óta a posztok képei a privát `media` bucketba kerülnek, AVIF-ként (animált képnél WebP-ként), és a `/media` route szolgálja ki őket.
- [ ] **Forráslink-figyelés.** Nincs ellenőrzés arra, hogy az eredeti link él-e még.

### Kényelmi funkciók
- [ ] **Todo cikkhez kötése.** Az adatbázis tudja (`todos.item_id`), de a hírkártyán nincs „tedd a listára” gomb.
- [ ] **Library lapozás.** Most a legutóbbi 100 poszt látszik, régebbiekhez „Továbbiak” gomb kell.
- [ ] **Napi összefoglaló emailben** a meghívottaknak.
- [ ] **Beküldés kívülről.** Egy gépi tokennel a Claude Cowork, egy iOS Shortcut vagy egy böngészőbővítmény is küldhetne linket az `/api/sources`-ra.
- [ ] **Chat felület** a Library fölött („mit írtak erről?”). Ez a legnagyobb munka.

### Technikai adósság
- [x] **Függőségek pontos verzióra.** A `package.json` minden függősége pontos verzió, a lockfile-lal összhangban, és a `jscpd` is pontos devDependency.
- [ ] **Generált Supabase-típusok** (`supabase gen types`). Most a kliens típus nélkül dolgozik.
- [x] **Pipeline-teszt** mockolt LLM-válaszokkal. Az ingest, a napi futás, a fordítás és az `llm.ts` útválasztása offline tesztekkel fedett, mockolt modellválaszokkal (`fakeDb`, `mockFetch`).
- [ ] **DNS rebinding** elleni védelem a linkletöltésnél. Csak akkor kell, ha nyilvános lesz a beküldés.
