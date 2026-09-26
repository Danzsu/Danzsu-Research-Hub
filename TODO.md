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
- [ ] **A két megszűnt Groq-modell cseréje** (2026-09-25-i döntés). A `llama-3.3-70b-versatile` megszűnt, ezért most minden napi futás és beküldés-tisztítás a Gemini-tartalékra esik vissza. *SQL Editor*:
  ```sql
  update public.model_settings set model = 'openai/gpt-oss-120b' where task = 'daily_shortlist';
  update public.model_settings set model = 'openai/gpt-oss-20b'  where task = 'ingest_cleanup';
  select task, provider, model, fallback_model from public.model_settings order by task;
  ```
  Elvárt: a `daily_shortlist` sorában `groq | openai/gpt-oss-120b`, az `ingest_cleanup` sorában `groq | openai/gpt-oss-20b`, a tartalékok változatlanok.
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

### 6. GitHub
- [ ] **Branch-védelem a `main`-en** (a CI első futása után). *Settings → Rules → Rulesets → New branch ruleset*, cél: a `main` (Default branch).
  - **Require status checks to pass**: `checks` (a CI egyetlen jobja; a lista az első futás után kínálja fel).
  - **Block force pushes** és **Restrict deletions**.
  - **Require a pull request before merging**: ki. PR-kötelezettség nincs, a `main` továbbra is fast-forwarddal kap új commitot.
  - A `main`-re így csak olyan commit kerülhet, amelyen a CI már zöld. Előbb az ágat pushold, várd meg a zöld futást, utána jöhet a fast-forward `main` pusha.
- [ ] **Privát sebezhetőség-bejelentés bekapcsolása:** *Settings → Code security → Private vulnerability reporting*. A SECURITY.md erre az útra küldi a bejelentőket; amíg ki van kapcsolva, csak a tulajdonos közvetlen elérése marad.
- [ ] **Dependabot-PR-ek:** hetente jöhet egy PR a két action frissítéséről, és csak legalább 7 napos kiadásról. Merge előtt a CI legyen zöld, és a kommentben szereplő tag legyen az új.

---

## B. Funkciók (fontossági sorrendben)

### Kész
- [x] **Reszponzív UX:** mobilos chip-sáv a kategóriákhoz, a haladás és a to-do lenyíló panelben (`2xl` alatt), 360 px-en sincs vízszintes görgetés, legalább 40 px-es érintési felületek, betöltési, hiba- és 404-oldal, `manifest` (kezdőképernyőre tehető)
- [x] **Sidebar-hiba:** a Tailwind 3-as szintaxis miatt asztali nézetben hibás volt a sidebar szélessége
- [x] **Archívum részletoldal:** `/archive/2026-W38`, ugyanazzal az olvasó felülettel
- [x] **Nyelvválasztás megjegyzése:** `lang` cookie, minden oldal ezt használja
- [x] **Márkanév:** NEON NEWS RADAR
- [x] **App-keret és ergonómia (UI/UX A):** közös navigáció (asztalon összecsukható oldalsáv, mobilon alsó sáv), a Megnyitás olvasottnak jelöl visszavonással, olvasatlanok elöl, a Top 3 teljes kártya, teendő a hírhez kötve, olvasott Library-posztok, élő frissítés beküldés közben, billentyűparancsok, nyelvváltás frissítés nélkül, offline előnézet (`/dev/preview`).
- [x] **Teszt-keményítés és CI** (2026-09-25): route-tesztek a route-teszt réteggel, a `safeFetch` minden hívóhelye, a `fakeDb` szűrői, rögzített blokk-id-k, a `Progress` értéke a képernyőolvasónak, GitHub Actions CI az öt ellenőrzéssel. Terv: [docs/superpowers/plans/2026-09-25-test-hardening.md](docs/superpowers/plans/2026-09-25-test-hardening.md).

### Kutatási dashboard — ütemterv (5 alprojekt)
- [ ] **1. Egységes poszt-sablon és olvasóeszközök.** Specifikáció: [docs/superpowers/specs/2026-09-24-unified-post-template-design.md](docs/superpowers/specs/2026-09-24-unified-post-template-design.md).
  - [x] **M1:** blokkok, kinyerők, zajszűrés, képek, fordítás, kis javítások.
  - [ ] **M2 olvasóeszközök** — terv szükséges. Kiemelés és komment, Key insights, Fogalmak.
    - A teszt-keményítés törölte a `post-article.test.ts`-t (osztálynév-tesztek voltak). Az M2 terv 7. és 10. feladata ezt a fájlt bővíti, ezért ott a fájl újra létrejön a fejlécével: a `testPost` és a `render` importja, és a `renderArticle` segéd.
    - A teszt-keményítés óta a `fakeDb` `rpcError` mezője `PostgrestErrorShape` típusú, ezért az M2 `rpcError`-fixture-jei a `pgError(...)`-t használják. Az M2 terv `rpcError: { code: "XX000", message: "boom" }` sora (`reader-tools-m2.md:4043`) így `rpcError: pgError("XX000", "boom")` lesz, különben a `tsc` TS2739-cel bukik.
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
  - Most az **A** van bent, 2026-09-25-től ~56 px-es ikonsávvá csukható (`[`, vagy a lábléc gombja). A csere egyetlen fájl: `app/components/desktop-nav.tsx`.
- [ ] **UI/UX és keresés:** az A mérföldkő kész (terv: [docs/superpowers/plans/2026-09-24-ux-a-app-shell.md](docs/superpowers/plans/2026-09-24-ux-a-app-shell.md)); hátra van a B (értékelés, GitHub-fül) és a C (keresés, lapozás).
  - okos keresés a címekben: elgépelés-tűrő, jelentés szerint is talál, szűrők
  - lapozás
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
    - **ByteByteGo** (a felhasználó ötlete, 2026-09-26): rendszertervezés és AI-infrastruktúra. RSS: `https://blog.bytebytego.com/feed`, 2026-09-26-án élőben ellenőrizve: 200, 20 tétel, a felükben a teljes szöveg (`content:encoded`). A poszt-oldalak szerverről letölthetők, `noarchive` nincs rajtuk. A „No thanks” feliratkozó ablak csak a böngészőben jelenik meg, a pipeline nem látja, így a Könyvtárba beküldött link is működik. Két dologra kell figyelni: a fizetős posztokból csak egy részlet érhető el (Substack), és vannak tisztán promóciós posztok (pl. „LAST CALL FOR ENROLLMENT”), ezeket a pontozásnak kell kiszűrnie. Javaslat: `feeds.ts`-be `limit: 5`-tel.
  - Szűrés, hogy ne legyen túl sok (döntés, 2026-09-24):
    - naponta legfeljebb kb. 8 kiemelt tétel, csak 60 pont felett;
    - a 40–59 pontosak egy összecsukott „Többi” szakaszba kerülnek, és a keresésben is megtalálhatók;
    - forrásonkénti limit;
    - ugyanaz a hír csak egyszer jelenik meg, akárhány forrásból jön.
  - A lista pontszám szerint rendezve jelenik meg.

### Következő lépések
- [ ] **Taiyaki link-chat** (döntve 2026-09-25, az UX-A után, az M2 előtt). Egy taiyaki-ikonos buborék: asztalon a jobb alsó sarokban lebeg, mobilon az alsó sáv kiemelt középső gombja, az Archívum pedig átkerül a „Több” panelbe. Megnyitva mini chat nyílik: egy link és egy opcionális megjegyzés, a válasz élő állapottal. A specifikáció: `docs/superpowers/specs/2026-09-25-taiyaki-link-chat-design.md`.
- [ ] **`/glossary` a főmenübe** (döntve 2026-09-25, az M2 után): egy nem elsődleges tétel a `lib/nav.ts`-ben, a tesztjei bővítésével.
- [ ] **Admin szerepkör.** Most minden meghívott egyenrangú. Kell egy `ADMIN_EMAILS` env és egy admin API route. Erre épül a következő pont.
- [ ] **Hibás beküldések kezelése.** „Újra” és „Törlés” gomb (a saját beküldésnél a beküldőnek, egyébként az adminnak), és a posztok eltávolítása (takedown).
  - A saját beküldés „Újra” gombja a taiyaki link-chattel érkezik. A „Törlés” és az admin-rész marad itt.
- [ ] **Lassú archívum** (a felhasználó jelezte 2026-09-25-én): a „Heti archívum” sokáig tölt. Kijelentkezve a szerver gyors (0,13–0,7 mp), ezért az ok a bejelentkezett úton vagy a route hideg indulásában lehet. A kivizsgáláshoz bejelentkezett mérés kell: engedély egy egyszeri teszt-munkamenetre, vagy a megfigyelésed (minden kattintásnál lassú-e, hány másodperc, mi látszik közben).
- [ ] **Hibajelzés.** Ha a napi futás elbukik (Gemini-limit, lejárt kulcs), senki nem kap értesítést. Telegram-bot vagy email kellene. Addig a hiba a Vercel cron-logjában látszik.
- [ ] **GitHub-token lejárat-figyelmeztető** (a GitHub-archívumhoz és a `GITHUB_TOKEN`-hez).
  - A GitHub a fine-grained token minden API-válaszában visszaküldi a lejárati dátumot (`GitHub-Authentication-Token-Expiration` fejléc).
  - A napi cron ezt kiolvassa, és 14, 7 és 1 nappal a lejárat előtt figyelmeztet a hibajelző csatornán (email vagy Telegram).
  - A lejárt tokent logban és a cron válaszában is jelezze, ne hibázzon csendben.
  - Alternatíva: GitHub App, amelynek a tokenje nem jár le.
- [ ] **Library keresés.** Postgres full-text search egy `search_posts` RPC-vel, a Library fejlécében egy keresőmezővel.
- [ ] **Tag-szűrő.** A hírkártyák `#tag`-jei legyenek kattinthatók, és szűrjék a feedet.
- [ ] **Élő próbák a UI/UX A deploy után** (a kontroller futtatja, ha a felhasználó engedélyez egy bejelentkezett munkamenetet):
  - a képhelykitöltő eltűnik egy valódi tükrözött képen, újratöltés után is;
  - egy poszt megnyitása olvasottnak jelöli az `item_states`-ben (`post:<id>`), és a Library-kártya elhalványul;
  - a Library frissül, amíg egy valódi beküldés feldolgozás alatt van, és utána leáll;
  - Tabbal elérhető az olvasópanel `2xl` alatt;
  - a `z` visszavon egy valódi Megnyitást;
  - a Library-be visszalépve (Vissza) az épp elolvasott poszt kártyája halvány;
  - a Radar sorrendje betöltés után nem változik (az olvasott kártyák nem ugranak át a csoportjuk végére).

### Tartalom minősége
- [ ] **Valódi GitHub trending.** Most csak a héten *létrehozott* repókat rangsorolja csillag szerint. A régebbi, de most gyorsan növő repókhoz napi csillagszám-mentés és a különbség számítása kell.
- [ ] **Beküldött posztok a Radarban.** A Library-posztok nem jelennek meg a heti feedben.
- [ ] **Paywall-felismerés.** Most csak a `noarchive` jelzést figyeli. A fizetős cikkekből csak a nyilvános eleje kerül be.
- [x] **Képek tükrözése** a Supabase Storage-ba. Az M1 óta a posztok képei a privát `media` bucketba kerülnek, AVIF-ként (animált képnél WebP-ként), és a `/media` route szolgálja ki őket.
- [ ] **Forráslink-figyelés.** Nincs ellenőrzés arra, hogy az eredeti link él-e még.

### Kényelmi funkciók
- [x] **Todo cikkhez kötése.** A hírkártya „+ teendő” gombja (UI/UX A).
- [ ] **Library lapozás.** Most a legutóbbi 100 poszt látszik, régebbiekhez „Továbbiak” gomb kell.
- [ ] **Napi összefoglaló emailben** a meghívottaknak.
- [ ] **Beküldés kívülről.** Egy gépi tokennel a Claude Cowork, egy iOS Shortcut vagy egy böngészőbővítmény is küldhetne linket az `/api/sources`-ra.
- [ ] **Chat felület** a Library fölött („mit írtak erről?”). Ez a legnagyobb munka.

### Technikai adósság
- [x] **Függőségek pontos verzióra.** A `package.json` minden függősége pontos verzió, a lockfile-lal összhangban, és a `jscpd` is pontos devDependency.
- [ ] **Generált Supabase-típusok** (`supabase gen types`). Most a kliens típus nélkül dolgozik.
- [x] **Pipeline-teszt** mockolt LLM-válaszokkal. Az ingest, a napi futás, a fordítás és az `llm.ts` útválasztása offline tesztekkel fedett, mockolt modellválaszokkal (`fakeDb`, `mockFetch`).
- [ ] **DNS rebinding** elleni védelem a linkletöltésnél. Csak akkor kell, ha nyilvános lesz a beküldés.
- [ ] **Kevesebb getClaims() kérésenként.** A UI/UX A óta kérésenként három fut: a `proxy.ts`-é, az `(app)` layout `getViewer()`-e és az oldal `getReader()`-e. Ha a `getReader`-t és a `getViewer`-t React `cache()`-be csomagoljuk (`lib/supabase/server.ts`), a layout és az oldal egy hívást oszt meg, így kettő marad (a proxy külön fut, azt a `cache()` nem éri el).
- [ ] **Elvész a fókusz** egy teendő törlése és a „+ teendő” után: a billentyűzettel dolgozó olvasónak újra kell keresnie a helyét.
- [ ] **Közel-duplikátumok, amiket a jscpd nem lát:** a Library és az Archívum üres állapotának bekezdése és linkje, a `TITLE//` span-minta, és az ikonsáv gombjainak osztálylistái.
- [ ] Signal-narancs szöveg paper/cream háttéren 2,7–2,9:1, kis szövegnél WCAG AA alatt; márka-döntés kell: sötétebb árnyalat kis szövegre vagy csak nagy/díszítő használat.
- [ ] fix(ui): a DESIGN.md-ben felsorolt eltérések: checkbox `rounded-none shadow-none` (`reader-panel.tsx:104`), Sheet/Input/Checkbox/pill homályos árnyéka, `PageHero` címe `cqi`-re (a szakasz már `@container`).
- [ ] **Playwright e2e a CI-ban** — opció, nincs jóváhagyva (2026-09-25).
  - Ára: új devDependency (`@playwright/test`, pontos és legalább 7 napos verzió, a lockfile-lal együtt), egy Chromium-letöltés a lockfile-on kívül (a csomag verziója rögzíti, CI-cache kell hozzá), `next dev` a CI-ban (a `/dev/preview` csak fejlesztői módban él), és a flaky tesztek kockázata.
  - Haszna: a billentyűparancsok, a visszavonás-csík szünete és 5 s-os véglegesítése, a dupla kattintásos törlés, a panel fókusza, a `&fail=1` visszaállás, a konzol- és hidratációs hibák, és a 360 / 768 / 1280 px-es vízszintes görgetés automatikus ellenőrzése (`.superpowers/sdd/test-audit.md`, 4. és 5. fejezet).
- [ ] **DB-tesztek a CI-ban** — opció, nincs jóváhagyva (2026-09-25).
  - Ára: egy új CI-job egy digesttel rögzített `postgres` service-konténerrel; egy shim (`auth.uid()` a `request.jwt.claim.sub`-ból, `auth.users`, `storage.buckets`, az `anon` / `authenticated` / `service_role` szerepek); a migrációk és sima SQL-ellenőrzések `psql -v ON_ERROR_STOP=1`-gyel. npm-függőség nélkül is megoldható.
  - Alternatívák: `@electric-sql/pglite` devDependencyként (hogy a szerepei és az RLS-e elég-e, az ellenőrizetlen), vagy a Supabase CLI helyi stackje (Docker, nehezebb).
  - Haszna: az RLS, a grantok, az `update_post_overrides` 42501-e és a `refresh_must_read` „pontosan 3” szabálya az egyetlen valódi jogosultsági réteg, és ma egyiket sem teszteli semmi.
- [ ] **Az audit következő tételei** (`.superpowers/sdd/test-audit.md`, 5. fejezet, „Next after these”):
  - az arxiv → article tartalék (I2: mutációs próba arra, hogy az `arxiv` bekerül-e a `NO_ARTICLE_FALLBACK` halmazba, kihagyva a cikk-tartalékot);
  - a github-kinyerés AI-tisztítása (I5: mutációs próba arra, hogy az AI-tisztítás kimarad-e a `github` forrástípusnál);
  - egy `arxiv.org/pdf/<id>.pdf` URL felismerése (U10: mutációs próba arra, hogy egy ilyen URL többé nem azonosítható-e arxivként).

  A `Task` ↔ `model_settings_task_check` teszt az M2 terv 1. feladatában van (`TASKS`), ide nem kell.
- [ ] **A túlélő próbák maradéka és a még teszt nélküli bekötések:**
  - a `/auth` előtag a `lib/public-paths.ts`-ben (P2: mutációs próba arra, hogy a záró `/` nélküli `/auth` előtag is nyilvános útvonalnak számít-e; egy tesztsor);
  - a `proxy.ts` (X4: mutációs próba arra, hogy a proxy a megfordított útvonal-halmazon irányít-e át): ehhez a `@supabase/ssr` `createServerClient`-jének helyettese kell a route-rétegben;
  - az `app/auth/login` és az `app/auth/callback` tényleg a `safeNext`-en át irányít-e;
  - a `getReaderState` sor-leképezése (`lib/content.ts`).
- [ ] **A `corepack pnpm@11.25.0` és a CI Node-verziója a Dependabot és a pnpm 7 napos korhatára (`minimumReleaseAge`) alól kimaradnak** — egyik sem npm- vagy Actions-függőség, amit valamelyik gate ellenőrizne. Bármelyik emelése előtt kézzel kell ellenőrizni, hogy a célverzió legalább 7 napos kiadás-e (lásd lent a Node-verzió emelésének lépéseit, ugyanez a szabály a pnpm-re is).
- [ ] **A CI Node-ja legalább 24.18.1-re.** A `.github/workflows/ci.yml` ma a `24.16.0`-n fut, mert a render harness csak ezen ellenőrzött.
  - A nodejs.org `dist/index.json` a 24.17.0-t (2026-06-17) és a 24.18.1-et (2026-07-28) biztonsági kiadásnak jelöli.
  - A lépések: előbb a render harness (`lib/test/render.ts`, `lib/test/tsx-hooks.ts`) és a teljes `npm test` ellenőrzése az új verzión, aztán a `node-version` sor emelése egy legalább 7 napos kiadásra.
  - Addig a kockázat kicsi: a job titok nélkül, csak `contents: read`-del fut.
