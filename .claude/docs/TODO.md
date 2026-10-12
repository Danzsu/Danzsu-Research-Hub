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
- [ ] A séma feltöltése: *SQL Editor*, a fájlokat egyenként, a [README migrációs táblázatának](../../README.md#migrations) sorrendjében, mindig csak az előző sikere után. A `…_drop_post_body.sql` csak az M1 deployja után jön, lásd lent.
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
- [ ] `cp config/.env.example .env.local`, majd a kulcsok beírása
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
- [ ] *Settings → Environment Variables*: minden változó a `config/.env.example`-ből (Production és Preview; a Development is, ha a sima `vercel env pull`-nak is működnie kell, különben `vercel env pull --environment=production .env.local`)
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
- [x] **Napi hírek** (2026-10-12): esti futás (13:00 UTC, 18:00-ra kész), a nap Top 10-e 3–5 rövid olvasmánnyal és történet szintű ismétlésszűréssel, 2–3 perces brief minden új Library-posztra, a `/daily` nézet és a heti „NAP TOP” jel. Spec: [specs/2026-10-12-daily-news-design.md](specs/2026-10-12-daily-news-design.md), terv: [plans/2026-10-12-daily-news.md](plans/2026-10-12-daily-news.md).
- [x] **Landing belépő, logó, források** (2026-10-12): a belépő kártya a fejléc gombjáról felcsúszó lapba költözött, a nyilvános gombok a taiyaki mozgását kapták, az új logó a felirat mellé került, három új forrás jött be, és mind a 22 régi csatorna élőben ellenőrizve.
- [x] **Alkalmazás-ikon** (2026-10-11): a lángos-rombusz logó a böngészőfülön, a manifestben és az iOS kezdőképernyőn (Next fájlkonvenció: `app/icon.png`, `app/apple-icon.png`).
- [x] **2a „Vizuális audit és új komponensek”** (2026-10-11): a hírkártya egy elsődleges gombbal és egy eszközsorral, a forrás a meta sorban; 11 px-es betűpadló; a kártya három jele (olvasott halvány, 👎 szaggatott, Később signal sáv); a címek a saját oszlophoz méretezve, alacsonyabb másodlagos hero; az R3 elrendezés (alacsony képernyő, a panel oszlopa a Radar szélessége szerint, 900 px-es kártya, 75ch sorok, 1–4 oszlopos rácsok, egyszerre egy panel); fiók-menü, a „hamarosan” sorok ki; a belépés a landing keretében, a kilépés a landingre; `EmptyState`, `StatTile`, `Kbd`, `CardToolbar`, `AccountMenu`; a `motion` könyvtár az értékelés-nyomáson, a toaston és a taiyakin. Spec: [specs/2026-10-11-visual-review-and-components-design.md](specs/2026-10-11-visual-review-and-components-design.md), terv: [plans/2026-10-11-visual-review-and-components.md](plans/2026-10-11-visual-review-and-components.md).
- [x] **Kódbázis-rend és config** (2026-10-11): a dokumentáció a `.claude/` alatt, a források és az env-leírás a `config/` alatt; belépés nélkül a `/` a landingre visz; az értékelés a repó kártyáján belül; a GitHub repók saját `/github` menüpontja; a napi futás törli a régi rangokat. Terv: [plans/2026-10-11-codebase-order-and-config.md](plans/2026-10-11-codebase-order-and-config.md). A 2a vizuális audit specje: [specs/2026-10-11-visual-review-and-components-design.md](specs/2026-10-11-visual-review-and-components-design.md).
- [x] **Reszponzív UX:** mobilos chip-sáv a kategóriákhoz, a haladás és a to-do lenyíló panelben (`2xl` alatt), 360 px-en sincs vízszintes görgetés, legalább 40 px-es érintési felületek, betöltési, hiba- és 404-oldal, `manifest` (kezdőképernyőre tehető)
- [x] **Sidebar-hiba:** a Tailwind 3-as szintaxis miatt asztali nézetben hibás volt a sidebar szélessége
- [x] **Archívum részletoldal:** `/archive/2026-W38`, ugyanazzal az olvasó felülettel
- [x] **Nyelvválasztás megjegyzése:** `lang` cookie, minden oldal ezt használja
- [x] **Márkanév:** NEON NEWS RADAR
- [x] **App-keret és ergonómia (UI/UX A):** közös navigáció (asztalon összecsukható oldalsáv, mobilon alsó sáv), a Megnyitás olvasottnak jelöl visszavonással, olvasatlanok elöl, a Top 3 teljes kártya, teendő a hírhez kötve, olvasott Library-posztok, élő frissítés beküldés közben, billentyűparancsok, nyelvváltás frissítés nélkül, offline előnézet (`/dev/preview`).
- [x] **Teszt-keményítés és CI** (2026-09-25): route-tesztek a route-teszt réteggel, a `safeFetch` minden hívóhelye, a `fakeDb` szűrői, rögzített blokk-id-k, a `Progress` értéke a képernyőolvasónak, GitHub Actions CI az öt ellenőrzéssel. Terv: [.claude/docs/plans/2026-09-25-test-hardening.md](plans/2026-09-25-test-hardening.md).
- [x] **Taiyaki link-chat** (2026-09-27): taiyaki-gomb asztalon a sarokban, mobilon az alsó sáv közepén (az Archívum a „Több”-be került), mini chat a saját 10 legutóbbi beküldéssel és élő állapottal, „Újra” a hibás beküldésen. Terv: [.claude/docs/plans/2026-09-26-taiyaki-link-chat.md](plans/2026-09-26-taiyaki-link-chat.md).
- [x] **R1 „Gyors”** (2026-09-28): a függvények Dublinban futnak Fluid compute-tal, egy auth-ellenőrzés kérésenként, egy lekérdezés a Radarhoz, az olvasói állapot a nézett hétre szűkül, és `GET /api/state` csak Vissza után fut; a zárt hetek és az archívum-lista egy napig gyorsítótárban vannak. Oldalformájú vázak, függő pont a linkeken, felső sáv a frissítésekhez, a „Több” linkjeinek prefetchje; a zod kikerült a kliens csomagjából. Terv: [.claude/docs/plans/2026-09-27-r1-speed.md](plans/2026-09-27-r1-speed.md).
- [x] **Hírek csomag** (2026-09-30): hat új forrás (Mistral, Microsoft Research, Meta AI Research, Anthropic Research, Recode China AI, ChinAI) és öt laborneves Hacker News-keresés (`Grok`, `DeepSeek`, `Qwen`, `Kimi`, `MiniMax`, pontos egyezéssel, csak a címben). Új menüpont: **AI cégek** (`/companies`), fent a legutóbbi napi futás öt legjobb céges hírével, alatta a hét többi céges hírével. Az xAI és a LinkedIn géppel nem olvasható ([truthful_sites.md](truthful_sites.md) → Kizárva).
- [x] **„Olvasd itt” és automatikus tükör** (2026-09-30): minden hírkártyán „Olvasd itt”: ha a cikkből már van Library-poszt, oda visz, ha nincs, a taiyaki chatben beküldi. A napi futás a hét 85 pont feletti híreit és a Top 3-at a rendszer-fiók nevén sorba teszi, a `/api/cron/mirror` 07, 08 és 09 UTC-kor feldolgozza őket. Egy forráson egyszerre egy futás dolgozik (`claimed_at` lease). Terv: [.claude/docs/plans/2026-09-30-read-here-mirror.md](plans/2026-09-30-read-here-mirror.md).
- [x] **G1 „Értékelés, GitHub-fül és Gyűjtemény”** (2026-10-03): 👎 👍 ❤ a hírkártyákon, a Top 10 repóin, a Library-posztokon és a GitHub-fülön; a 👎-os sor halvány, és a Libraryben és a GitHub-fülön a lista végére kerül. A napi futás a repókat is pontozza, és elmenti a csillagszámukat és a nyelvüket. Új: az archívum **GitHub-füle** (`/archive/github`, minden heti Top 10 repója egy listában, értékelés és nyelv szerint szűrve) és a **Gyűjtemény** (`/collection`, a ❤-es hírek, posztok és repók, hetektől függetlenül). Terv: [.claude/docs/plans/2026-10-03-g1-ratings-github-collection.md](plans/2026-10-03-g1-ratings-github-collection.md).
- [x] **R2 „Visszajelzés”** (2026-10-01): a chat saját buboréka azonnal megjelenik, a hibás küldés és teendő visszaadja a szövegét, az ismételt válasz nem halmozódik; a felső sáv a teljes Mentés, Fordítás és beküldés alatt fut; egy közös, jól olvasható hibasor; a Library olvasási hibája hibaoldalt mutat; a poszt oldala követi az újrakinyerést; benyomódás minden kattintható elemen, 160 ms-os sheetek és toast, csökkentett mozgásnál semmi nem mozdul, érintőképernyőn 40 px. Terv: [.claude/docs/plans/2026-10-01-r2-feedback.md](plans/2026-10-01-r2-feedback.md).

### Kutatási dashboard — ütemterv (5 alprojekt)
- [ ] **1. Egységes poszt-sablon és olvasóeszközök.** Specifikáció: [.claude/docs/specs/2026-09-24-unified-post-template-design.md](specs/2026-09-24-unified-post-template-design.md).
  - [x] **M1:** blokkok, kinyerők, zajszűrés, képek, fordítás, kis javítások.
  - [ ] **M2 olvasóeszközök** — terv szükséges. Kiemelés és komment, Key insights, Fogalmak.
    - A teszt-keményítés törölte a `post-article.test.ts`-t (osztálynév-tesztek voltak). Az M2 terv 7. és 10. feladata ezt a fájlt bővíti, ezért ott a fájl újra létrejön a fejlécével: a `testPost` és a `render` importja, és a `renderArticle` segéd.
    - A teszt-keményítés óta a `fakeDb` `rpcError` mezője `PostgrestErrorShape` típusú, ezért az M2 `rpcError`-fixture-jei a `pgError(...)`-t használják. Az M2 terv `rpcError: { code: "XX000", message: "boom" }` sora (`reader-tools-m2.md:4043`) így `rpcError: pgError("XX000", "boom")` lesz, különben a `tsc` TS2739-cel bukik.
    - A taiyaki link-chat óta a `post-article.tsx` `copy`-jában nincs `kind`: a forrástípus jelvénye a `SOURCE_KIND_LABELS`-ből jön (`lib/source-kinds.ts`). A `labels.keyPoints` megmaradt.
    - A poszt-oldal forrástípus-jelvényének tesztje az újra létrejövő `post-article.test.ts`-be kerül: ma egyetlen automata teszt sem rögzíti, hogy a jelvény a `SOURCE_KIND_LABELS[post.kind][language]`.
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
  - A spec: [.claude/docs/specs/2026-09-24-ux-signals-search-design.md](specs/2026-09-24-ux-signals-search-design.md)
  - Most az **A** van bent, 2026-09-25-től ~56 px-es ikonsávvá csukható (`[`, vagy a lábléc gombja). A csere egyetlen fájl: `app/components/desktop-nav.tsx`.
- [ ] **UI/UX és keresés:** az A mérföldkő kész (terv: [.claude/docs/plans/2026-09-24-ux-a-app-shell.md](plans/2026-09-24-ux-a-app-shell.md)); hátra van a B (értékelés, GitHub-fül) és a C (keresés, lapozás).
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
  - Új források: a jelöltek, az állapotuk és a felvétel lépései a [truthful_sites.md](truthful_sites.md) → Jelöltek részben. Ide tartozik a research.google (a felhasználó kérésére, közvetlenül az M1 15. feladata után) és a DeepMind súlyozása. A ByteByteGo és az Anthropic 2026-09-27 óta bent van, a Microsoft Research és a többi új forrás 2026-09-30 óta.
  - Szűrés, hogy ne legyen túl sok (döntés, 2026-09-24):
    - naponta legfeljebb kb. 8 kiemelt tétel, csak 60 pont felett;
    - a 40–59 pontosak egy összecsukott „Többi” szakaszba kerülnek, és a keresésben is megtalálhatók;
    - forrásonkénti limit;
    - ugyanaz a hír csak egyszer jelenik meg, akárhány forrásból jön.
  - A lista pontszám szerint rendezve jelenik meg.

### Következő lépések
- [x] **A kiadás: a `visual-review` PR** (2026-10-11, a `codebase-order` után; beolvasztva 2026-10-11, PR #3). Az élő próbák még hátravannak. Migráció nincs; egy új függőség (`motion` 14.0.0). A merge után élő próba: a fiók-menü asztalon és a „Több” alatt telefonon; kilépés → landing a „Kijelentkeztél” sorral; a `/login` a landing keretében; a hírkártya eszközsora egy valódi telefonon; a Radar panel és a chat egyszerre sosem; `prefers-reduced-motion` mellett az értékelés-nyomás nem mozdul.
- [x] **A kiadás: az `app-icon` PR** (beolvasztva 2026-10-12, PR #8) (2026-10-11, pusholva, merge-re vár). Az új alkalmazás-ikon: `app/icon.png` (512 px, a böngészőfül és a manifest) és `app/apple-icon.png` (180 px, ink alapon, az iOS kezdőképernyő); a régi `public/favicon.svg` törölve. Migráció és új függőség nincs. A merge után: az új ikon a fülön (a böngésző cache-eli, Ctrl+F5 vagy új lap), és telefonon a „Hozzáadás a kezdőképernyőhöz” ikonja.
- [x] **A kiadás: a `landing-signin` PR** (beolvasztva 2026-10-12, PR #7) (2026-10-12, az `app-icon` tetején). A landing belépője a fejléc krémszínű Belépés gombjáról alulról felcsúszó lapban (az `/about`-on egy perc után magától is, látogatásonként egyszer); a Belépés, a HU/EN, a Google- és a belépőlink-gomb a taiyaki mozgásával; az új logó a felirat mellett (oldalsáv, nyilvános fejléc, státuszkártya); „Made by Danzsu” a láblécben; három új forrás (The Rundown AI, MIT Technology Review, Pragmatic Engineer). Migráció és új függőség nincs. A merge után: a lap telefonon és asztalon, egy perc várakozás az `/about`-on, a másnapi futásban az új források tételei.
- [x] **A kiadás: a `sources-review` PR** (beolvasztva 2026-10-12, PR #6) (2026-10-12, a `landing-signin` tetején). A források élő felülvizsgálata: a Hugging Face Daily Papers legtöbb szavazatot kapott 15 cikke a lezárt napokból, az arXiv két listája 40 → 10, az AWS ML 10 → 5; a HN marad teljes szöveges (a csak címben keresés a nagy modellbejelentéseket ejtené ki). Migráció és új függőség nincs. A merge utáni első hétköznapi futásban (a hétvégén nincs Daily Papers) a jelöltek között legyenek `HF Daily Papers · N upvotes` tételek.
- [x] **A kiadás: a `daily-news` PR** (beolvasztva 2026-10-12, PR #9; a migráció a merge után futott: a rés alatt a Radar és a `/daily` hibát adhatott, a 16 UTC-s tükör-kör forrásai elbukhattak — ellenőrző és visszaállító SQL a beszélgetésben, 2026-10-12) (2026-10-12, a `sources-review` tetején). **Migráció kell, a deploy előtt:** `supabase/migrations/20261012000000_daily_top_and_brief.sql` az SQL Editorban (a `daily_top` tábla és a `posts.brief` oszlop). Új függőség nincs. A cronok a deploy-jal 13:00 UTC-re (napi) és 14–16 UTC-re (tükör) költöznek. Ha a deploy 05 UTC után van, az első esti lista rövidebb lehet: a reggeli futás aznapi tételeit a válogatás már ismertnek veszi; a második estétől teljes. Az első este: a `/daily` 18:00-ra kész, a Top 10-ben 3–5 rövid olvasmány, a kártyákon a brief (ha egy hiányzik, a Library-ben a forrás állapota mutatja, miért); a heti nézetben a „NAP TOP” jelek; telefonon a sáv Radar, Napi, taiyaki, Könyvtár, Több.
- [ ] **Ütemterv a hátralévő nagy funkciókra:** [plans/2026-10-12-roadmap.md](plans/2026-10-12-roadmap.md) (2026-10-12): előbb az apróságok négy csomagja, aztán a chat AI, a keresés, a chat AI 2, a dashboard, a G2, az üzemeltetés és a tartalom.
- [ ] **Taiyaki chat AI (2d, a napi hírek után, saját spec; a tulajdonos döntése 2026-10-12):** a chat LLM-je „skilleket” kap: becsomagolt promptokat zod-sémával a meglévő `generate()` mögött (például kérdés a Library-ről és a hírekről, egy link összefoglalása, források felülvizsgálata és felvétele). **A forráslista karbantartása:** a források a `config/sources.ts`-ből egy adatbázis-táblába költöznek (migráció), mert a futó app a repót nem írhatja; a chat egy új csatornát élőben ellenőriz és javasol, de csak a tulajdonos (admin) jóváhagyása után kerül be. Nincs éles GitHub-token. A 2026-10-12-i felülvizsgálat mérése (14 napos tételszám, AI-arány, frissesség, átfedés) lesz a felülvizsgálat-skill alapja.
- [ ] **2b Keresés** (a következő spec): Postgres teljes szövegű + trigram keresés a ⌘K palettában és a `/search` oldalon, a C-spec 3.4–3.5 szerint; utána 2c dashboard, 2d chat + embedding + G3.
- [x] **A kiadás: a `codebase-order` PR** (2026-10-11; beolvasztva 2026-10-11, PR #4). Az élő próbák még hátravannak. Migráció nincs. A merge után élő próba: a `/` kijelentkezve az `/about`-ra visz; a menüben a GitHub repók és a `/github` listázza a korábbi hetek repóit (ha üres marad, a Supabase-ben a `github_repos` nézet lekérdezése a következő lépés); a Top 10 kártyáin a gombcsoport a kártyán belül; a másnapi futás után a pontszámok látszanak.
- [x] **A G1 élesítése** (a `github-ratings` branch, a `google-sso` PR merge-e után): a `supabase/migrations/20261003000000_ratings_github_repos.sql` futtatása az SQL Editorban **a deploy előtt** (a Radar lekérdezése az új oszlopokat olvassa), utána a merge. Élő próba: egy ❤ a Radaron megjelenik a Gyűjteményben, és a GitHub-fül listázza a korábbi hetek repóit.
- [x] **A kiadás: a `google-sso` PR** (2026-10-03; mindkét PR beolvasztva 2026-10-11, a migrációk lefuttatva, élesben megy). Ami nyitva maradt belőle: a Google-belépés beállítása (lent) és az élő próbák. A PR mindent visz, ami még nincs fent (az R1 és a Hírek csomag már él): „Olvasd itt” és tükör, R2, a Reddit kivétele, Google-belépés, az R3 spec. A merge élesít (production deploy), ezért ebben a sorrendben:
  1. **push:** `git push -u origin google-sso`, majd a PR megnyitása a GitHubon (a Vercel ekkor csak preview-t épít, a production nem változik);
  2. **SQL Editor:** a `supabase/migrations/20260930000000_source_claims.sql` futtatása (lent, „Az „Olvasd itt” élesítése” 1. pont);
  3. **a Google-belépés beállítása** (a következő pont 1–4. lépése);
  4. **a PR merge-e** a GitHubon; utána helyben `git checkout main && git pull`;
  5. **az élő próbák:** a Google-belépés 5. lépése, az R2 élő próbája, az R1 utólagos mérése, a taiyaki élő próbái (lent).
- [ ] **A Google-belépés beállítása** (a tulajdonosé, ebben a sorrendben, **a push előtt**: a belépő oldal első gombja ezt használja, és beállítás nélkül a Supabase nyers hibaoldalára visz; a terv: [.claude/docs/specs/2026-10-02-google-sign-in-design.md](specs/2026-10-02-google-sign-in-design.md)):
  1. **Google Cloud Console → Google Auth Platform:**
     - *Branding*: az app neve „NEON NEWS RADAR”, egy támogatási e-mail-cím, az *Application home page* `https://<production-domain>/about` és a *Privacy policy link* `https://<production-domain>/privacy` (a kettő a `/about` és `/privacy` nyilvános oldal; az éles módhoz kötelező, és csak a deploy után érhető el);
     - *Audience*: External, majd *Publish app* → **In production**. Csak alap scope-okat kér (név, e-mail, profil), ezért nem kell hozzá Google-ellenőrzés; *Testing* módban viszont csak a felvett teszt-felhasználók léphetnének be;
     - *Data access*: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`;
     - *Clients → Create client*: Web application; *Authorized redirect URIs*: `https://<projekt-ref>.supabase.co/auth/v1/callback` (a `<projekt-ref>` a Supabase projekt azonosítója, a Supabase URL-jében látszik);
     - a *Client ID*-t és a *Client secret*-et csak a Supabase-be másold, sehova máshova.
  2. **Supabase → Authentication → Sign In / Providers → Google:** bekapcsolás, a Client ID és a Client secret beillesztése, mentés. Az *Allow new users to sign up* maradjon **kikapcsolva** (ez a meghívásos kapu), és az *Email* szolgáltató maradjon bekapcsolva (a magic link tartalék).
  3. **Supabase → Authentication → URL Configuration:** a *Site URL* marad a production domain (soha ne írd át); a *Redirect URLs* közé vedd fel a `http://localhost:3000/**`-ot a helyi próbához.
  4. **A tagok címe:** minden tag Gmail- vagy Google Workspace-címen legyen meghívva, és az legyen a Google-fiókja elsődleges címe. Más szolgáltatónál lévő címen meghívott tag a magic linket használja (a Google csak a Gmail- és Workspace-címekért kezeskedik; SECURITY.md → Auth and the invite gate).
  5. **A deploy után három próba:** egy tag belép Google-lel (egy másik tag fiókjával is, nem csak a tiédével); egy nem meghívott Google-fiók a „Ez a Google-fiók nincs meghívva.” üzenetet kapja; egy megszakított Google-belépés az általános hibaüzenetet hozza.
- [ ] **Élő próba az R2 deploy után** (a tulajdonos, bejelentkezve): egy hibás Mentés és Fordítás hibasora; egy újrakinyerés követése a poszt oldalán, nyitott szerkesztővel is; egy menükattintás egy futó Fordítás alatt (azonnal navigál); a lenyomott állapot egy valódi telefonon.
- [ ] **Az „Olvasd itt” élesítése** (a tulajdonosé, ebben a sorrendben):
  1. *SQL Editor*: a `supabase/migrations/20260930000000_source_claims.sql` futtatása, **a push előtt** (a kód olvassa az oszlopot; az R2 óta a poszt oldala is, így nélküle minden poszt oldala hibaoldalt mutat);
  2. [x] a rendszer-fiók (*Authentication → Users → Add user*, Auto Confirm) és a `RADAR_MIRROR_USER_ID` a Vercelben (2026-09-30);
  3. a `google-sso` PR merge-e (fent, „A kiadás”).
- [ ] **Az R1 utólagos élő mérése** (a tulajdonosé, a deploy után; a terv 12. feladata):
  - a válasz `x-vercel-id` fejléce `…::dub1`-re végződik, a deployment adatlapján a függvények Fluid compute-tal futnak, és a napi cron lefut;
  - `node --env-file=.env.local --experimental-strip-types --no-warnings .superpowers/ux-audit/measure-live.mts after`, az egyszeri, csak olvasó, jóváhagyott munkamenettel; a számok a `live-before.json` mellé kerülnek, ígéret nélkül;
  - a DevTools Network panelén friss betöltés és előre navigálás után nincs `GET /api/state`, Vissza után egy;
  - 2026-09-28 után a Supabase API-naplójában egy zárt hét második megnyitása nem kéri az `issues`, `digest_items` és `github_top` táblát;
  - telefonon és asztalon: a váz, a függő pont és a „Több” → Archívum prefetchje a valódi `(app)` navigációban.
- [ ] **Élő próbák a taiyaki link-chat deployja után** (a kontroller futtatja, ha a felhasználó engedélyez egy bejelentkezett munkamenetet):
  - egy valódi link beküldése a chatből, és a szál „FELDOLGOZÁS…” → „KÉSZ · MEGNYITÁS →” váltása a poszt címével (a `posts(...)` beágyazás objektumként jön-e);
  - egy hibás beküldés „Újra”-ja (a sor `attempts` értéke 0 lesz, aztán 1);
  - egy már bent lévő link 409-e a „MEGNYITÁS →”-sal;
  - az `/archive` oldalon a „Több” aktív jelölése mobilon;
  - a lekérdezés leáll a panel bezárása után (`browser_network_requests`);
  - a `/library` oldalon a chatből beküldött link megjelenik a listában (`router.refresh()`; az előnézet listája fixture, ott nem látszik).
- [ ] **GitHub-radar** (ötlet, 2026-09-30; **ez következik**, a tulajdonos sorrendje 2026-10-03: GitHub-rész → keresés → olvasás a saját oldalon; az R3 Elrendezés speckel kész, és utánuk jön):
  - a heti Top 10 marad, és hetente archiválódik (ma is: `/archive/<hét>`);
  - [x] **G1** (2026-10-03): pontszám, csillagszám és nyelv a repóknak, 👎 👍 ❤ a repókon, híreken és posztokon, az archívum GitHub-füle és a Gyűjtemény (lent a „Kész” alatt);
  - **G3, a chatbe dobott GitHub-link:** ha a pontszáma eléri a heti Top 10 legalját, jelölve bekerül a Top 10-be, ha nem, szívecskét kap;
  - **G2, „A hónap repói” (Top 3) a Top 10 felett:** a régóta vagy nagyon gyorsan növő, releváns repók, havi nézetben. Ehhez napi csillagszám-mentés kell (a „Valódi GitHub trending” pont);
  - forrás: a Star History Monthly hírlevél és a star-history.com chart-linkje ([truthful_sites.md](truthful_sites.md) → Jelöltek).
- [ ] **Halasztott apróságok** (a záró reviewk „Minor” pontjai, egyik sem sürgős):
  - **R2, kész a `polish` branchen (2026-10-12)** — terv: [plans/2026-10-12-polish-2-ui.md](plans/2026-10-12-polish-2-ui.md) és [plans/2026-10-12-polish-3-chat-a11y.md](plans/2026-10-12-polish-3-chat-a11y.md):
    - [x] lenyomás közben egy-egy gyerekelem színe eltűnik (a logó „RADAR” felirata és jelvénye, a Library-kártya ikonja, az archívum száma, a GitHub-sor sorszáma): a `group-hover:` cseréket `group-active:`-val tükrözni — a felirat, a két ikon és az archívum száma kész; a jelvény (ma a `BrandMark` képe) és a GitHub-sor (a `RepoCard`-nak nincs saját lenyomása) már nem érintett;
    - a chat ritka versenye: ha a küldés utáni újratöltés elbukik, az elfogadott üzenet nem látszik, amíg a lekérdezés helyre nem jön;
    - [x] a toastnak nincs tartalék-időzítője, ha egy bővítmény letiltja az animációkat (`animationend` nem jön) — elavult: a toast 2a óta `AnimatePresence`, és nem vár `animationend`-re.
  - **Google-belépés:**
    - kézzel gyártott `?error=constructor` / `toString` / `__proto__` cím a belépő oldalon „undefined / undefined”-et mutat: `Object.hasOwn`, és a hibakódok közös `LoginError` típusa;
    - egy elkezdett Google-belépés érvényteleníti a függőben lévő, régi típusú (`?code=`) magic linket; a token-hash sablonokkal megszűnik;
    - a SECURITY.md „a `+radar` aliast a Google nem éri el” mondata csak Gmail- vagy Workspace-alapcímre igaz: ezt kiírni ott és a README rendszer-fiók lépésénél;
    - a belépő oldal fejléce, címe és EMAIL felirata még nincs a copy-objektumban.
  - **Napi hírek (záró review, 2026-10-12), kész a `polish` branchen (2026-10-12)** — terv: [plans/2026-10-12-polish-1-daily-news.md](plans/2026-10-12-polish-1-daily-news.md):
    - [x] egy beszúrás után elbukott futás elveszti a nap listáját, és az újrafuttatás sem hozza vissza; az első este (05 UTC utáni deploy) rövid lehet;
    - [x] a `daily_top` írásának hibája a `refresh_must_read`-et is kihagyja;
    - [x] régebbi listán az angol felirat „Today's”;
    - [x] egy elbukott futás után 18:00 után is „a mai 18:00-ra készül” látszik;
    - [x] a háromszor megszakadt forrás kártyáján örökre „készül…”;
    - [x] hétfőn a 13 UTC-s futásig a múlt hét látszik élőként a Radaron.
  - **2a vizuális audit (záró review, 2026-10-11), kész a `polish` branchen (2026-10-12)** — terv: [plans/2026-10-12-polish-2-ui.md](plans/2026-10-12-polish-2-ui.md):
    - [x] csökkentett mozgás alatt a toast még 160 ms-ot halványul (az opacity-t a `reducedMotion="user"` nem állítja le): `useReducedMotionConfig` → 0 időtartam;
    - [x] a panel kontextusa (`app-shell.tsx`) minden rendernél új objektum: `useMemo`;
    - [x] a panel nyitott állapota túléli az oldalt (Back után újranyílik): a dashboard lecsatolásakor bezárul;
    - [x] az archívum üres sora még nem `EmptyState`;
    - [x] a `/login` fejléce önmagára linkel (a nyilvános keret „Belépés” gombja) — elavult: a `/login` a landing-signin óta gomb nélkül (`signIn="none"`) használja a keretet;
    - [x] a súgó `Kbd`-je `text-xs`-t és `text-[11px]`-et is visel;
    - a `motion` csomagméret (`motion.*` vs `m` + `LazyMotion`) mérés nélkül: nyitott ötlet, előbb mérni kell.
- [ ] **Responzívabb UI/UX** (döntve 2026-09-26, a taiyaki után, külön terv). Az R1 Gyors és az R2 Visszajelzés kész; hátra van az **R3 Elrendezés** (a mobil fekvő keret, a széles képernyő, a panel és a chat takarása, a taiyaki kerete ink oldalon). Mindkét értelemben:
  - gyorsabb, azonnali visszajelzés (betöltési állapotok, gyorsabb oldalváltás, például a lassú `/archive`);
  - minden képernyőméreten jó elrendezés, 360 px-től a széles monitorig.
  Emellett jobb visszajelző effektek és további javítások. Előbb egy átvilágítás az egész appon: Playwright-mérések 360/768/1280 px-en és a lassú pontok felmérése. Ebből lesz egy jóváhagyandó terv.
  - A taiyaki link-chatből ide parkolt tételek:
    - [x] lassú küldésnél azonnal jelenjen meg egy „küldés…” buborék (optimista) (R2, 2026-10-01);
    - [x] ink oldalon (Library, Archívum) a sarokgomb ink kerete és árnyéka eltűnik — elavult: a sarokgomb árnyéka 2a óta signal;
    - ha a gomb után semmi nem kapható fókuszba, az előre Tab a gomb és a panel között körbejár;
    - a Radar olvasópanelje saját Tab-hurkot tart; ha ezt javítjuk, a `tabPastPanel` közös helyre költözik;
    - `md` és `2xl` között a Radar olvasópanelje eltakarja a chat panelt és a sarokgombot;
    - a `loginHref` elhagyja a query stringet (`/login?next=` csak az útvonalat kapja);
    - iOS safe area: nincs `viewport-fit=cover`, ezért a Safariban minden `env(safe-area-inset-bottom)` 0;
    - az sr-only beszélő-előtag szóköze nem jut el a Chrome akadálymentességi fájába (a csomópontok amúgy is külön vannak);
    - a chat mezőjén a stock `Textarea` `shadow-xs`-e: a lenti fix(ui) pont része;
    - [x] több sikertelen küldés egyforma „Nem ment át, próbáld újra.” buborékokat halmoz a szál végére (csak a `signed_out` van összevonva) (R2, 2026-10-01);
    - egy másik beküldés sikeres „Újra”-ja nem törli a többi bejegyzés saját `signed_out` válaszát (`retryNotices`), az csak a saját „Újra”-ig vagy a panel bezárásáig marad;
    - a retry 403-a és 404-e „Nem ment át, próbáld újra.”-ként jelenik meg (ma egyik sem fordulhat elő);
    - [x] a zod kikerült a kliens csomagjából (R1); a `lib/client-bundle.test.ts` őrzi.
- [ ] **`/glossary` a főmenübe** (döntve 2026-09-25, az M2 után): egy nem elsődleges tétel a `lib/nav.ts`-ben, a tesztjei bővítésével.
- [ ] **Admin szerepkör.** Most minden meghívott egyenrangú. Kell egy `ADMIN_EMAILS` env és egy admin API route. Erre épül a következő pont.
- [ ] **Hibás beküldések kezelése.** „Újra” és „Törlés” gomb (a saját beküldésnél a beküldőnek, egyébként az adminnak), és a posztok eltávolítása (takedown).
  - [x] A saját beküldés „Újra” gombja kész: a taiyaki link-chatben (`POST /api/sources/[id]/retry`). A „Törlés” és az admin-rész marad itt.
- [ ] **Lassú archívum** (a felhasználó jelezte 2026-09-25-én): a „Heti archívum” sokáig tölt. Kijelentkezve a szerver gyors (0,13–0,7 mp), ezért az ok a bejelentkezett úton vagy a route hideg indulásában lehet. A kivizsgáláshoz bejelentkezett mérés kell: engedély egy egyszeri teszt-munkamenetre, vagy a megfigyelésed (minden kattintásnál lassú-e, hány másodperc, mi látszik közben).
  - Az R1 „Gyors” erre is válasz (a régió, a lekérdezések, a gyorsítótár és a visszajelzés). Az előtte–utána élő mérés a spec 3.3 pontja szerint: `.superpowers/ux-audit/live-before.json` és `live-after.json`, a fenti „Az R1 utólagos élő mérése” pont.
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
- [x] **Kevesebb getClaims() kérésenként** (R1): a `getReader()` React `cache()`-ben van (`lib/supabase/server.ts`), így az `(app)` layout és az oldal egy hívást oszt meg. Kérésenként kettő maradt, mert a `proxy.ts` külön kérésben fut.
- [ ] **Elvész a fókusz** egy teendő törlése és a „+ teendő” után: a billentyűzettel dolgozó olvasónak újra kell keresnie a helyét.
- [ ] **Közel-duplikátumok, amiket a jscpd nem lát:** a Library és az Archívum üres állapotának bekezdése és linkje, a `TITLE//` span-minta, az ikonsáv gombjainak osztálylistái, és az aktív menüpont osztálytöredéke a „Több” panelben (`app-shell.tsx`) és az oldalsávban (`desktop-nav.tsx`). A taiyaki tesztjeiből: a `failedA` / `failedB` fixture és a bejegyzés-kereső kétszer a `chat-thread.test.ts`-ben, a `said` segéd kétszer a `link-chat.test.ts`-ben. Az ikon + `PendingDot` kártyafejléc span ismétlődik az `archive-view.tsx`-ben és a `library-view.tsx`-ben; egy közös szerver wrapper az ikont csak gyerekként (már renderelt elemként) kapná, nem `icon`-propként, mert egy komponens-referenciát a kliens határon át propként nem lehet átadni. A `PostToolbar` alapértelmezett propjai kétszer szerepelnek: a `shell.test.ts`-ben és a `post-toolbar.test.ts`-ben.
- [ ] **Apró rendrakás a taiyaki után:**
  - [x] a `MINE_LIMIT` a függőség nélküli `lib/pipeline/util.ts`-be került (R1);
  - a `link-chat.tsx` a Library-frissítésnél a `"/dev/preview"` útvonalat írja be a kódba; a `preview` prop ugyanezt mondja;
  - a CLAUDE.md a Library-frissítést a „Focus and keys” pont alatt írja le, a „The panel” pontba való.
- [ ] **Közös `createStore`.** A listeners / `subscribe` / `getSnapshot` váz már háromszor van meg (`reader-store`, `undo-queue`, `link-chat`).
- [ ] **A `submit-form.tsx`-nek nincs komponenstesztje.**
- [ ] **Zajos tesztkimenet.** Az `npm test` ma kb. 65 sort ír ki régebbi tesztekből (a pipeline, a fordítás és a route-ok hibanaplói). Ezekben is mockolni kell a `console`-t `t.mock.method`-dal, és ellenőrizni a hívásszámot (TESTING.md → Pitfalls, Log noise).
- [ ] **Ismétlődő route-farok a jscpd küszöbe alatt:** az elfogad-és-ütemez vég (`after(() => processSource(…))` + 202) háromszor, a `MAP[result] → jsonError` négyszer.
- [ ] **A `fakeDb` `splitColumns`-a nem érti a `!inner`-t** (és az `alias:col` formát sem); az M2-nek kell.
- [ ] **`unstable_cache` → `use cache`.** Az R1 két gyorsítótára (`lib/content.ts`) a Next 16-ban leváltott `unstable_cache`-t használja. A `use cache` a Cache Components-szel jön; ha lesz ilyen mérföldkő, az cseréli le. A mérföldkőről az R1 utólagos élő mérése után születik döntés.
- [ ] Signal-narancs szöveg paper/cream háttéren 2,7–2,9:1, kis szövegnél WCAG AA alatt; márka-döntés kell: sötétebb árnyalat kis szövegre vagy csak nagy/díszítő használat.
- [ ] fix(ui): a DESIGN.md-ben felsorolt eltérések: checkbox `rounded-none shadow-none` (`reader-panel.tsx:104`), Sheet/Input/Textarea/Checkbox/pill homályos árnyéka, `PageHero` címe `cqi`-re (a szakasz már `@container`).
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
