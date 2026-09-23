# TODO

## A. Beállítás (ez a te dolgod, kód nem kell hozzá)

### 0. Kód
- [ ] A `vercel-supabase-pipeline` branch commitolása és beolvasztása a `main`-be (szólj, és megcsinálom)

### 1. Supabase
- [ ] Új projekt a [supabase.com](https://supabase.com)-on. Régiónak EU-t válassz (pl. Frankfurt).
- [ ] *Authentication → Sign In / Providers*: az **Allow new users to sign up** legyen **KI**. Ez a meghívólista.
- [ ] *Authentication → URL Configuration*:
  - Site URL: egyelőre `http://localhost:3000`, a Vercel deploy után a Vercel-domain
  - Redirect URLs: `http://localhost:3000/**` és `https://<vercel-domain>/**`
- [ ] *Authentication → Email Templates*:
  - Magic Link: a link legyen `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
  - Invite user: a link legyen `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`
- [ ] Ajánlott: *Authentication → SMTP Settings*, saját SMTP (pl. Resend, ingyenes kerettel). A beépített levélküldés óránként csak néhány emailt enged, ez meghívásnál gyorsan elfogy.
- [ ] *Project Settings → API Keys*: a `Publishable` és a `Secret` kulcs kimásolása
- [ ] A séma feltöltése:
  ```bash
  npx supabase login
  npx supabase link --project-ref <project-ref>
  npx supabase db push
  ```
- [ ] Ellenőrzés a *Table Editor*-ban: 7 tábla és egy `archive_issues` view, mindegyik táblán „RLS enabled”
- [ ] *Authentication → Users → Invite user*: meghívod magad

### 2. API kulcsok
- [ ] **Gemini**: [aistudio.google.com](https://aistudio.google.com) → *Get API key*. Az ingyenes keretnél a Google felhasználhatja a beküldött adatot. Nyilvános hírekhez ez rendben van, de ha zavar, kapcsold be a fizetős csomagot.
- [ ] **Groq** (opcionális): [console.groq.com](https://console.groq.com) → API Keys
- [ ] **GitHub token** (opcionális): *Settings → Developer settings → Fine-grained token*, jogosultság nélkül. Csak a keresési limitet emeli.
- [ ] **CRON_SECRET**: egy hosszú, véletlen szöveg, pl. `openssl rand -hex 32`

### 3. Helyi próba
- [ ] `cp .env.example .env.local`, majd a kulcsok beírása
- [ ] `corepack pnpm@11.25.0 install --frozen-lockfile`, majd `npm run dev`
- [ ] Belépés a `http://localhost:3000/login` oldalon a meghívott címeddel
- [ ] Az első kiadás elindítása:
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
  ```
  Egy JSON-t kell kapnod `inserted` és `repos` számokkal, a főoldalon pedig meg kell jelenniük a híreknek.
- [ ] A `/library` oldalon egy YouTube-link és egy cikklink beküldése. Pár perc után mindkettőnek posztként kell megjelennie.

### 4. Vercel
- [ ] [vercel.com](https://vercel.com) → *Add New → Project* → a GitHub repó importálása. A Next.js-t és a pnpm-et magától felismeri.
- [ ] *Settings → Environment Variables*: minden változó a `.env.example`-ből (Production és Preview)
- [ ] Deploy, utána a Supabase Site URL átírása a Vercel-domainre (lásd az 1. pontot)
- [ ] Az első futás élesben: ugyanaz a `curl`, csak `https://<vercel-domain>/api/cron/daily`-re
- [ ] Másnap reggel: *Vercel → Project → Logs / Cron Jobs*, lefutott-e a napi job

### 5. Opcionális: hogy én is hozzáférjek
- [ ] A Supabase és a Vercel MCP engedélyezése a `/mcp` alatt. Utána a migrációt, az env-eket és a logokat én is meg tudom nézni.

---

## B. Hiányzó funkciók (fontossági sorrendben)

### Hiányzik vagy félkész
- [ ] **Archívum részletoldal.** Az archívum kártyái nem kattinthatók, a korábbi hetek hírei nem nézhetők vissza (kell egy `/archive/[week]` oldal).
- [ ] **Library keresés.** A README kereshető könyvtárat ígér, de még nincs (Postgres full-text search, RPC-vel).
- [ ] **Hibás beküldés kezelése.** Egy `failed` link most csak naponta próbálkozik újra, legfeljebb 3-szor. Hiányzik a kézi „Újra” és „Törlés” gomb, és a posztok eltávolítása (takedown) is.
- [ ] **Hibajelzés.** Ha a napi futás elbukik (Gemini-limit, lejárt kulcs), senki nem kap róla értesítést. Kell egy email vagy Telegram üzenet hiba esetén.

### Tartalom minősége
- [ ] **Valódi GitHub trending.** Most csak a héten *létrehozott* repókat rangsorolja csillag szerint. A régebbi, de most gyorsan növő repókhoz napi csillagszám-mentés és a különbség számítása kell.
- [ ] **Paywall-felismerés.** Most csak a `noarchive` jelzést figyeli. A fizetős cikkekből csak a nyilvános eleje kerül be.
- [ ] **Képek tükrözése** a Supabase Storage-ba. Most a cikkekből csak a szöveg mentődik.
- [ ] **Forráslink-figyelés.** Nincs ellenőrzés arra, hogy az eredeti link él-e még.
- [ ] **Beküldött posztok a Radarban.** A Library-posztok nem jelennek meg a heti feedben.

### Kényelmi funkciók
- [ ] **Nyelvválasztás megjegyzése.** A dashboard mindig HU-val indul, a Library `?lang=en` paramétert használ.
- [ ] **Todo cikkhez kötése.** Az adatbázis tudja (`todos.item_id`), de a felületen nincs „tedd a listára” gomb a híreknél.
- [ ] **Napi összefoglaló emailben** a meghívottaknak.
- [ ] **Beküldés kívülről.** Egy gépi tokennel a Claude Cowork, egy iOS Shortcut vagy egy böngészőbővítmény is küldhetne linket az `/api/sources`-ra.
- [ ] **Chat felület** a Library fölött („mit írtak erről?”). Ez a legnagyobb munka.

### Technikai adósság
- [ ] Generált Supabase-típusok (`supabase gen types`); most a kliens típus nélkül dolgozik
- [ ] Teszt a napi pipeline-ra mockolt LLM-válaszokkal (most csak a tiszta segédfüggvényeknek van tesztje)
- [ ] DNS rebinding elleni védelem a linkletöltésnél. Csak akkor kell, ha nyilvános lesz a beküldés.
