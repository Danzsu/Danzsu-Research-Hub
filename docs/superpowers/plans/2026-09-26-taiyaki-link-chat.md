# Taiyaki link-chat — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minden bejelentkezett oldalon egy taiyaki-gomb (asztalon a jobb alsó sarokban, mobilon az alsó sáv kiemelt közepén) mini chatet nyit, amelybe linket lehet bedobni megjegyzéssel. A szál a saját 10 legutóbbi beküldést mutatja élő állapottal, a hibás beküldés „Újra” gombbal újraindítható.

**Architecture:**
- **Két új route, egy bővítés, séma nélkül.**
  - `GET /api/sources/mine`: a saját beküldések, a szűrés a szerveren (`submitted_by = viewer.id`).
  - `POST /api/sources/[id]/retry`: olvasás olvasóként, majd egy admin-kliens compare-and-swap, amely a tulajdonost és a `failed` állapotot is újra ellenőrzi, és az `attempts`-et nullázza.
  - A `POST /api/sources` 409-es válasza `postId`-t is visz, ha a linkhez már van poszt.
  - A logika a `lib/my-sources.ts`-ben van, a route-ok vékonyak.
- **A chat logikája keretrendszer nélkül él** (`lib/link-chat.ts`), ahogy a `reader-store.ts`:
  - `parseLinkMessage`;
  - `toThread` (a források → szál-bejegyzések);
  - `createLinkChat`: egy kis store a lekérdezés szabályaival (4 s, csak nyitott panel, látható fül, függő beküldés mellett), a küldéssel és az „Újra”-val;
  - két transport: `httpTransport` (a három route) és `memoryTransport` (az előnézet, hálózat nélkül).
- **A felület három komponens.**
  - `taiyaki-icon.tsx`: a rajz.
  - `chat-thread.tsx`: a szál, tiszta props-ból, így a statikus render-harness teszteli.
  - `link-chat.tsx`: a gomb és a panel. Asztalon nem modális Radix-Dialog a gomb fölött, mobilon alsó Sheet; ugyanaz a `Sheet`, a `modal` a szélességtől függ.
  - A keret (`app-shell.tsx`) tartja a nyitott állapotot, és két helyre teszi a gombot.
- **Közös helyek:**
  - a forrástípus-nevek a `lib/source-kinds.ts`-be kerülnek, és ezt használja a poszt-oldal jelvénye is;
  - a cím-átírás szabálya a `shownTitle` (`lib/post-view.ts`), ezt használja a `toPost` is;
  - a gomb „előrejövése” a `.lift` szabály a `globals.css`-ben, közösen a Top 3 kártyákkal;
  - a `SubmitForm` a chat `httpTransport.submit`-jét hívja.

**Tech Stack:** Node 24.16.0 (`node:test`, `t.mock.timers`, type stripping), Next.js 16.3.4 (route handlerek, `after()`), React 19.2.6 (`useSyncExternalStore`), radix-ui 1.6.7 (Dialog a `components/ui/sheet.tsx`-en át), Tailwind 4.2.1, lucide-react 1.46.0 (`SendHorizontal`), linkedom 0.18.13, Playwright MCP.

**Spec:**
- `docs/superpowers/specs/2026-09-25-taiyaki-link-chat-design.md` — kötelező.
- `.superpowers/brainstorm/decisions.md`, a „Chat bubble” és a „Taiyaki link-chat design APPROVED” pontok.
- Az ikon: `.superpowers/brainstorm/4489-1790347439/content/taiyaki-icon.html`, `#ty-a` („A — Klasszikus”). Saját rajz, az albumborítóról semmi nem kerül át.
- **A tulajdonos kiegészítése (2026-09-26), kötelező:** a taiyaki-gomb hoverre pontosan úgy „jön előre”, mint a Top 3 kártyák (`globals.css`: `translate(-2px, -2px)` és `8px 8px 0 var(--signal)`). A nyugalmi árnyék `4px 4px 0 var(--ink)` marad. A `transform` és a `box-shadow` 160ms ease-szel vált, a hover `@media (hover: hover)`-ban. Ugyanez `:focus-visible`-re is. `prefers-reduced-motion` mellett az árnyék vált, eltolás nincs. Az asztali gombra és a mobil középső helyre is vonatkozik. Nem másoljuk a kártya osztálylistáját, és a `npm run dup` 0 klón. Playwright-próba kell hozzá: hover és Tab.

**Next.js-dokumentáció, amit a terv használ** (a `node_modules/next/dist/docs/` alatt elolvasva):
- `01-app/03-api-reference/03-file-conventions/route.md`: a `params` Promise.
- `01-app/01-getting-started/15-route-handlers.md`: a GET route handler alapból nincs cache-elve. A `/api/sources/mine`-hoz ezért nem kell `dynamic`; a build `ƒ`-nek mutatja.
- `01-app/03-api-reference/04-functions/after.md`: `after()` route handlerben, a `maxDuration` határáig.
- Ugyanott a `use-offline.md`: kísérleti, config-kapcsolós. Nem használjuk, az offline állapotot a `fetch` hibája jelzi.

**Előfeltétel és sorrend:**
- Ez a terv a `test-hardening` ág `main`-be olvasztása után fut, a UX-A keretre és a teszt-keményítés rétegére épül:
  - `lib/test/route-hooks.ts` (`routeStub`, `resetRoute`, `signedIn`, `scheduledSourceIds`);
  - a `STUBS` térkép a `lib/test/tsx-hooks.ts`-ben;
  - a `fakeDb` szűrői és a `pgError`.
- Ág: `git switch main`, a `main` frissítése a tulajdonos lépése, majd `git switch -c taiyaki-link-chat`.
- A kiinduló tesztszám **488**. Ennyi a `test-hardening` `8bd62e9` commitján, és ennyi a mostani fején, a `9e5cf80`-on is (`fix: align the top three must-read cards`). Az utóbbi csak a Top 3 lépcsőzését vette ki a `globals.css`-ből, egy margót a `digest-dashboard.tsx`-ben és egy mondatot a `CLAUDE.md`-ből, tesztet nem érintett. Ha a `main`-en más a szám, a feladatonkénti növekményt vesd össze: 1. +4, 2. +7, 3. +10, 4. +6, 5. +13, 6. +6, 7. +2, 8. +2, végül 538.
- **Ellenőrzés.** A terv minden kódját egy `git archive 8bd62e9` másolaton futtattam le, a `node_modules`-t junctionnel rákötve. Ezen a másolaton ellenőriztem:
  - `npx tsc --noEmit`, `npm run lint`, `npm test` (538 zöld) és `npm run dup` (0 klón);
  - `npx next build --webpack`. A Turbopack a junctionnel kötött `node_modules`-t nem fogadja el, a valódi repóban a sima `npm run build` fut;
  - a feladatok mutációs próbáit (mind bukást ad);
  - a 7. és a 8. feladat Playwright-köreit `next dev --webpack` alatt, a `/dev/preview`-n.
- **Minden fájlt olvass újra szerkesztés előtt.** Ha egy „előtte” részlet eltér a fájltól, a fájl az irányadó, és csak ennek a tervnek a változtatását vidd át. A `9e5cf80` után a 7. feladat `globals.css`-horgonyait (a `.must-card` sora, a hover-blokk, a `.story-read` és a reduced-motion blokk) újra ellenőriztem: mind megvan, változatlanul.

## Egyeztetés a spec-kel és a kóddal

1. **A `sources` RLS-e minden olvasónak megengedi a `select`-et** (`20260923000000_init.sql`, „readers see sources”), `update`-et viszont senkinek. Ezért:
   - a „saját” szűrés a lekérdezésben van (`.eq("submitted_by", viewerId)`);
   - az „Újra” CAS-a az admin klienssel fut, a spec szerint.
2. **A `posts.source_id` `unique`**, így a PostgREST a `sources` → `posts(...)` beágyazást egy objektumként adja, vagy `null`-t. A `listMySources` és a 409-es lookup így olvassa.
3. **A `postRoute` (`lib/api.ts`)** pontosan azt adja, amit a spec a retry route-tól kér: 401 kijelentkezve, 404 nem pozitív egész id-re. Az M2 terv a nevére épít (`onDemandRoute`), ezért nem nevezzük át. A retry route `{ postId: sourceId }`-ként bontja ki, a doc-komment pedig kimondja, hogy bármely `[id]` route-ra jó.
4. **A `fakeDb` `sources` lánca négy helyen kevés volt:**
   - nem volt `maybeSingle`;
   - az `update` egyetlen `.eq`-et fogadott, szűrés és átírás nélkül;
   - a listázás figyelmen kívül hagyta az `order`-t, és csak a `pending` sorokat olvasta;
   - a select nem tudott hibát adni.

   Az 1. feladat pótolja ezeket. A `posts` update építőjével közös `updateChain` segéd nélkül a jscpd klónt jelez, ezért az 1. feladat ki is emeli.
5. **Forrástípus-lista ma egy helyen van:** a `post-article.tsx` `copy.kind` (rövid, nagybetűs: `TANULMÁNY`, `VIDEÓ`). A Könyvtár csak ikonokat használ (`kindIcons`). A spec a chatben a teljes nevet kéri („arXiv-tanulmány”), ugyanabból a listából. Ezért egy közös lista készül a spec neveivel, és a jelvény CSS-sel nagybetűsít (Ruling lent).
6. **A cím-átírás szabálya a `toPost`-ban élt** (`overrides.title ?? row.title`). A spec szerint a chat ugyanazt a segédet használja, ezért a szabály kikerül `shownTitle`-ként.
7. **A `SubmitForm` saját `fetch`-csel hívja a `POST /api/sources`-t.** A chatnek is kell ugyanez, így a két fetcher egy lesz (`httpTransport.submit`).
8. **A statikus render-harness a portálozott Sheet-tartalmat `null`-nak rendereli** (`shell.test.ts`, a DigestDashboard-teszt kommentje). Ezért:
   - a szál külön, tiszta komponens (`ChatThread`), és közvetlenül tesztelhető;
   - a `LinkChat`-nek csak smoke-renderje van;
   - a kattintás, a fókusz és az Esc a Playwright-körben dől el.
9. **A Radix Dialog (radix-ui 1.6.7)** a kódban ellenőrizve:
   - Leírás nélkül nem figyelmeztet (`descriptionPresent`).
   - A `contentProps`-ban átadott `id` felülírja a sajátját.
   - Nem modális módban az `onCloseAutoFocus` `preventDefault`-ja után a mi fókuszunk marad.
   - `onInteractOutside` `preventDefault`-tal a kívüli kattintás nem zár.
   - Trigger nélkül a Radix nem tudja, hova adja vissza a fókuszt. A panelt ezért a mi gombjaink nyitják, és a fókuszt mi adjuk vissza a nyitó gombnak.
10. **`t.mock.timers`.**
    - Egy tesztben csak egyszer kapcsolható be. A második `enable` `ERR_INVALID_STATE`-et dob, ezért a segéd nem kapcsol, a teszt maga.
    - A `setImmediate` nincs a mockolt API-k között, így a `flush()` erre épül.
11. **A `useIsMobile` első renderje `false`.** A panel csak kattintásra nyílik, addigra a hook beállt, így a `modal` a nyitáskor már helyes.
12. **Az előnézet.**
    - A `/dev/preview` útja nem tartozik egyik menüponthoz sem (`activeNavId` → `null`). A „Több” aktív jelölése ezért ott nem látszik, egységteszt és élő próba fedi.
    - A Library nézet 5 másodpercenként `router.refresh()`-t hív. Ez a nyitott panelt, a szálat és a beírt szöveget nem bántja (ellenőrizve, 11 s).
13. **A kiemelt mobil gomb 16 px-rel a sáv fölé nyúlik**, és két dolgot takarna ki:
    - A visszavonás-csík mai sávja (`bottom: 4.75rem`) 6 px-re belelógna. A sáv ezért 1rem-mel feljebb kerül (8. feladat).
    - A lap alját ma 4rem padding védi a sáv alatt, de a gomb teteje a lap aljától 82 px-re van. A padding ezért 5.25rem lesz.

## Döntések

- **A tulajdonos döntése (2026-09-26):** az „Újra” CAS-a `status = 'pending'`, `error = null` mellett `attempts = 0`-t is ír — egy „Újra”-futás, amelyet a Vercel a 300 s-os határon megöl, `pending`-ben marad, és `attempts >= 3` mellett a napi cron (`retryPendingSources`: `attempts < 3`) soha nem venné fel, a szál pedig „Újra” gomb nélkül örökké „FELDOLGOZÁS…”-t mutatna — az ára: egy újra elbukó forrás, akárcsak egy friss beküldés, még két napi automatikus próbát kap. A 3. feladat kódja, két tesztje és egy mutációs sora rögzíti.
- Ruling: a retry route a meglévő `postRoute`-ot használja `{ postId: sourceId }` kibontással — az M2 terv a nevére épít, és a 401/404 viselkedés egyezik — ha téves: egy mechanikus átnevezés `idRoute`-ra, három route-ban.
- Ruling: a `posts(...)` beágyazás objektum vagy `null`, nem tömb — a `posts.source_id` `unique`, és a PostgREST 11+ az egy-az-egyhez kapcsolatot objektumként adja — ha téves: a kész válaszoknál nem látszik cím; a TODO élő próbája megfogja, és egy sor (`[row.posts].flat()[0]`) javítja.
- Ruling: egy közös lista (`SOURCE_KIND_LABELS`) a spec neveivel, a poszt-oldal jelvénye `uppercase`-szel mutatja („ARXIV-TANULMÁNY”, „YOUTUBE-VIDEÓ”, „X-POSZT”, „CIKK”) — a spec egy listát kér, és a chat mondata a teljes nevet — ha téves: a jelvény hosszabb lesz; rövid formához egy második mező kellene ugyanabban a listában.
- Ruling: a lekérdezés legfeljebb `MAX_POLLS = 150`-szer fut (10 perc) nyitásonként, küldésenként és „Újra”-nként — egy `pending`-ben ragadt forrás (az időkorláton túl megölt futás) különben egész nap 4 másodpercenként kérdezne, ahogy a `RefreshWhileProcessing` is korlátoz — ha téves: 10 perc után a szál csak újranyitásra frissül.
- Ruling: csak a legfrissebb lekérés eredménye érvényes (`latest` számláló) — egy későn érkező régi válasz visszaírhatná a `pending`-et egy kész forrásra, és a lekérdezés is leállna — ha téves: nincs költsége.
- Ruling: a helyi válaszok csak taiyaki-buborékok, a saját üzenet nem jelenik meg mellettük. A mező szövege csak 202 után ürül, minden más válasznál (no_link, 400, 409, 401, hálózat) marad — a spec a hálózati hibára ezt kéri, és a többinél is a javítás a természetes lépés — ha téves: egy `setText("")` a panelben.
- Ruling: küldés közben a mező `readOnly` + `aria-disabled`, a gomb `disabled` — egy `disabled` mező elveszítené a fókuszt, és a következő üzenethez vissza kellene kattintani — ha téves: a mező átírható `disabled`-re, a fókusz visszaadásával.
- Ruling: ha a `GET /api/sources/mine` 401-et ad, egyszer megjelenik a „Lejárt a belépésed” válasz. Minden más hiba a „Most nem érem el…” — a spec a 401-et csak a küldésre írja, de a pollozó 401 is kijelentkezést jelent — ha téves: a 401 is a „nem érem el” sort mutatja.
- Ruling: az „Újra” 409-e (`not_failed`) csak frissítést vált ki, hibaüzenetet nem. A 403, 404 és 5xx a „Nem ment át” választ adja — a 409 azt jelenti, hogy egy másik kattintás vagy fül már elindította — ha téves: egy külön válaszszöveg.
- Ruling: a „MEGNYITÁS →” mobilon bezárja a Sheetet, asztalon a panel nyitva marad — a mobil Sheet takarná a megnyitott posztot, asztalon a spec szerint csak Esc vagy a bezáró gomb zár — ha téves: egy `onOpenPost` prop.
- Ruling: a nyitáskor a fókusz mobilon is a mezőbe kerül, ahogy a spec kéri — a mobil billentyűzet emiatt felugrik, ezt a spec vállalja — ha téves: a mobil ág a Sheetre fókuszál, mint az olvasópanel.
- Ruling: a `memoryTransport` a `parseSubmittedUrl`-t és a `detectSource`-ot is futtatja — így az előnézet a valódi forrástípust és a 400-as választ is megmutatja — ha téves: nincs költsége.
- Ruling: a `parseLinkMessage` szavanként dolgozik. A linket tartalmazó egész szó kikerül a megjegyzésből. A link végén álló `)` megmarad, ha a linkben nyitották (Wikipédia). A szóhoz tapadt link („Nézd:https://…”) nem link, szó szerint a spec szabálya szerint — ha téves: az utóbbi eset „no_link” választ kap.
- Ruling: a `.lift` sima osztály a `globals.css`-ben. A Top 3 kártyák hover-szabályával közös selector-lista, a kártyák viselkedése nem változik (fókuszra nem emelkednek, és csökkentett mozgásnál is eltolódnak, mint ma). Csak a `.lift` kapja a `:focus-visible` és a `prefers-reduced-motion` szabályt — a tulajdonos kiegészítése a gombra vonatkozik — ha téves: a kártyákra a `.lift` osztály felrakása egy sor a `story-card.tsx`-ben.
- Ruling: a mobil visszavonás-csík sávja `4.75rem` → `5.75rem`, a tartalom alsó paddingje `4rem` → `5.25rem` (8. feladat) — a kiemelt gomb teteje a lap aljától 82 px — ha téves: a csík 16 px-szel magasabban ül.
- Ruling: az asztali gomb alatt nincs külön padding — lebegő gomb, csak egy 56 px-es sarkot takar, a lap alján álló kattintható elemek (kártyák, linkek) ennél szélesebbek — ha téves: egy `md:pb-24` a keret tartalom-oszlopán.
- Ruling: a „Több” gomb aktív jelölése `data-active` (+ `data-[active]:text-signal`), az `aria-current` a panelbeli Archívum linken marad — egy panelt nyitó gomb nem „az aktuális oldal”, a spec 1.2 is a linkre teszi az `aria-current`-et — ha téves: nincs költsége, egy attribútum cseréje.

## Nyitott kérdések a felhasználónak

Nincs. Az egyetlen kérdésre (nullázza-e az „Újra” az `attempts`-et) a tulajdonos 2026-09-26-án igennel válaszolt. A döntés a Döntések között áll, a spec 3.2 is így szól.

## Global Constraints

- **Ág:** `taiyaki-link-chat`, a `main`-ből, a `test-hardening` beolvasztása után. A push a tulajdonosé.
- **Új függőség nincs.**
  - A `package.json` és a `pnpm-lock.yaml` nem változik: minden függőség pontos verzió, a lockfile marad.
  - A `pnpm-workspace.yaml` érintetlen: `minimumReleaseAge: 10080` (7 nap), `minimumReleaseAgeIgnoreMissingTime: false`, `strictDepBuilds`.
- **Séma nem változik** (spec 3.3). Tilos:
  - `supabase db push`;
  - `npx shadcn add`.
- **Duplikáció:** minden feladat végén `npm run dup` → `Found 0 clones.`
  - Segéd előtt `grep -rn`.
  - A CLAUDE.md közös helyeit használjuk: `jsonError`, `postRoute`, `POST_ERRORS`, `getReader`, `parseId`, `parseSubmittedUrl`, `detectSource`, `safeHref`, `readOverrides`, a `Button` `signal` változata, a `focus-ring`, a `Sheet` `closeLabel`-je.
  - Ez a terv új közös helyeket is ad: `SOURCE_KIND_LABELS`, `shownTitle`, `httpTransport`, `updateChain`, `.lift`.
  - A tulajdonosnak a duplikáció a legfontosabb.
- **Importok és tesztek:**
  - A `lib/` alatt relatív `.ts` import, `@/` csak a három Next-only szervermodulban.
  - Futtatás: `node --experimental-strip-types --no-warnings --test`. Minden `[` `[[]`-ként írandó egy tesztútban (`app/api/sources/[[]id]/retry/route.test.ts`), különben 0 teszt fut, és 0-val lép ki. Az `ℹ tests` sor soha nem lehet 0.
  - A route-tesztek a `lib/test/route-hooks.ts`-t használják relatív úton, `resetRoute()`-tal kezdenek, és minden route-tesztfájlban van egy bejelentkezett eset, amely eléri a handlert.
  - A `mockDns` soha nem hívható kétszer egy teszttörzsben. Ez a terv nem is használja.
  - linkedom-csomópontot soha ne adj az `assert`-nek: attribútumot, `textContent`-et vagy darabszámot hasonlíts.
- **A tesztek viselkedést rögzítenek, nem osztálynevet.**
  - Minden új teszt kommentje megnevezi a mutációt, amit megöl.
  - Minden feladatban van egy mutációs lépés: ideiglenes, alkalmazd, futtasd a megnevezett tesztfájlt, lásd a FAIL-t, állítsd vissza. Utána a `git diff --stat` csak a feladat saját változását mutatja.
  - Ami CSS vagy geometria (lift, csík-sáv, 360 px), az Playwrightban mérhető, nem osztálynév-tesztben.
- **UI-feladatok futásidejű próbája** (6., 7., 8.):
  - `npm run dev`, és a `/dev/preview` minden nézete (`&fail=1`-gyel is) és a `/dev/preview/post` 200-at ad. A válaszban nincs „Too many re-renders”, „Unhandled Runtime Error” és „Application error”.
  - Utána a Playwright MCP-kör.
- **React:**
  - setState render közben csak őrrel, és ez a terv sehol nem is teszi;
  - `eslint-disable` a `react-hooks` szabályaira tilos.
- **Biztonság:**
  - A route-ok `getReader()`-rel azonosítanak, minden JSON-hiba `jsonError`, a ház hibakódjaival.
  - A „saját” szűrés a szerveren van, mert az RLS minden olvasónak megengedi a `select`-et.
  - Az „Újra” a tulajdonost és a `failed` állapotot az olvasásban és a CAS-ban is ellenőrzi.
  - A szálban minden href `safeHref`, nyers HTML nincs.
  - A böngészőbe nem kerül Supabase-kulcs, minden adat a route-okon át jön.
  - Az előnézet soha nem hív valódi API-t: a minták id-je negatív, és a beküldés, a lekérdezés és az „Újra” a `memoryTransport`-on megy, ahogy a Library előnézete a beküldést csonkolja.
- **Dizájn és reszponzivitás** (CLAUDE.md):
  - 360 px-en nincs vízszintes görgetés;
  - az érintési felület legalább 40 px;
  - `dvh`, nem `vh`;
  - a sarkok szögletesek (radius 0);
  - az árnyékok kemények, 0 blur;
  - az átmenetek 160ms ease-ek;
  - a hover-stílus `@media (hover: hover)`-ban (a Tailwind `hover:` ezt magától teszi);
  - a fő oszlopon belül container query.
- **Szövegek:** komponensenként egy `copy` objektum `{ hu, en }`, angol-only felirat nincs. A megosztott adatlisták (`NAV_ITEMS`, `SHORTCUTS`, `SOURCE_KIND_LABELS`) `Localized` értékeket tartanak.
- **Commitok:** Conventional Commits, kisbetűs, felszólító módú angol tárgy, attribúciós sor nélkül, explicit pathspec-kel (`git add <fájlok>`, majd `git commit -m`).
- **Dokumentáció:** a 9. feladat frissíti a README.md-t, a CLAUDE.md-t (Routes, Layout, App shell, Offline preview, Conventions, Database, Security) és a TODO.md-t.
- **Tiltott parancs:** ha az engedélyrendszer egy parancsot blokkol, állj meg, és jelentsd. Változatot soha ne futtass.

## Review Focus

1. **Dupla kattintás az „Újra”-n.** Elvárt: egy futás indul, a második kattintás nem indít újat, és nem ad hibát. A tesztjei:
   - a 3. feladat: `POST /api/sources/[id]/retry: of two overlapping clicks, one starts the run and the other answers 409 not_failed` (két párhuzamos kérés: egy 202, egy 409, egy ütemezett futás);
   - a 3. feladat: `retrySource's compare-and-swap repeats the owner and the status check…`;
   - az 5. feladat: `retry: a second click while the first is on its way sends nothing, and a 409 reloads the thread like a 202`.
2. **A panel bezárása után tovább futó lekérdezés.** Elvárt: a bezárás után egyetlen `GET /api/sources/mine` sem megy ki. A tesztje (5. feladat): `the thread polls every 4 s while the panel is open and a source is pending, and never after it closes`, mellette a rejtett fül és a `MAX_POLLS` tesztje.
3. **Egy másik olvasó beküldései a szálban.** Elvárt: csak a sajátok látszanak, akkor is, ha a más beküldése frissebb. A tesztjei (2. feladat): `listMySources answers the viewer's own latest MINE_LIMIT sources, newest first` és `GET /api/sources/mine answers the caller's own sources only`.
4. **Írásjeles vagy több linkes üzenet.** Elvárt: a mondatvégi pont, zárójel vagy idézőjel nem kerül a linkbe, a Wikipédia zárójele igen. Több link közül az első megy be, és a szál szól, hogy volt több. A tesztjei (4. feladat): `…strips sentence punctuation around the link…` és `…sends the first of several links and says there were more`.
5. **Küldés hálózat nélkül.** Elvárt: „Nem ment át, próbáld újra.”, a szöveg a mezőben marad, és a küldés gomb újra aktív. A tesztjei:
   - az 5. feladat: `send: every refusal, offline included, becomes a reply and keeps the text` és `retry: offline or refused, it says so and frees the button`;
   - a 7. feladat, Playwright 8. pont (`&fail=1`).

---

## Fájlszerkezet

| Fájl | Felelősség | Feladat |
| --- | --- | --- |
| `lib/pipeline/fake-db.ts` (+ `fake-db.test.ts`) | a `sources`-lánc: `maybeSingle`, `order`, szűrt és átíró `update`, `sourceSelectError`; `updateChain` (a `posts` update-tel közös) | 1 |
| `lib/post-view.ts` | `shownTitle`, a `toPost` is ezt hívja | 2 |
| `lib/my-sources.ts` (+ teszt) | `MySource`, `MINE_LIMIT`, `listMySources`; `RetryResult`, `retrySource` | 2, 3 |
| `app/api/sources/mine/route.ts` (+ teszt) | `GET /api/sources/mine` | 2 |
| `app/api/sources/route.ts` (+ teszt) | a 409 `postId`-ja | 2 |
| `app/api/sources/[id]/retry/route.ts` (+ teszt), `lib/api.ts` (doc-komment) | `POST /api/sources/[id]/retry` | 3 |
| `lib/link-chat.ts` (+ teszt) | `parseLinkMessage`; `toThread`, `ChatNotice`, transportok, `createLinkChat` | 4, 5 |
| `app/(app)/library/submit-form.tsx` | a `httpTransport.submit`-et hívja | 5 |
| `lib/source-kinds.ts`, `app/(app)/library/[id]/post-article.tsx` | a közös forrástípus-nevek; a jelvény ezekből | 6 |
| `app/components/taiyaki-icon.tsx`, `chat-thread.tsx` (+ `chat-thread.test.ts`) | a rajz; a szál | 6 |
| `lib/fixtures.ts` (+ teszt) | `previewMySources` | 6 |
| `app/components/link-chat.tsx` | `TaiyakiButton`, `LinkChat`, `CHAT_PANEL_ID`, `ChatPreview` | 7 |
| `app/globals.css` | `.lift` | 7 |
| `app/components/app-shell.tsx`, `undo-toast.tsx`, `app/dev/preview/page.tsx`, `app/dev/preview/post/page.tsx`, `app/components/shell.test.ts` | bekötés, a csík sávja, az előnézet | 7, 8 |
| `lib/nav.ts` (+ teszt), `app/components/nav-parts.tsx` | `mobileMore`, `MOBILE_BAR_NAV`, `MOBILE_CHAT_SLOT`, `MOBILE_MORE_NAV`, `inMobileMore`; `NavEntry` `onClick` | 8 |
| `README.md`, `CLAUDE.md`, `TODO.md` | dokumentáció | 9 |

**Nem része ennek a tervnek** (spec, „Nem része a v1-nek”): szabad chat, „Törlés”, Android share target, jelzés zárt panel mellett, billentyűparancs.

---

### Task 1: A `fakeDb` `sources`-lánca: `maybeSingle`, rendezés, szűrt és átíró `update`

**Files:**
- Modify: `lib/pipeline/fake-db.ts` (`FakeIngestTables`, `sourcesQuery`, új `updateChain`, a fő doc-komment, a `sources` és a `posts` ág `update`-je)
- Test: `lib/pipeline/fake-db.test.ts`

**Interfaces:**
- Consumes: `pgError`, `PostgrestErrorShape`, `passes`, `Filter` (a teszt-keményítésből).
- Produces:
  - `FakeIngestTables.sourceSelectError?: PostgrestErrorShape`: minden `sources` select (listázás, `single()`, `maybeSingle()`) ezzel a hibával felel.
  - A `sources` select lánca: `.eq/.neq/.lt`, `.order(column, { ascending? })`, `.limit(n)`, `.single()`, `.maybeSingle()`. A listázás `pending` nélkül a `sources` / `source` sorokat olvassa.
  - A `sources` update: `.update(values).eq(…)….eq(…)`, `await`-elhető (`data: null`), vagy `.select(...)`-tel az illeszkedő sorok `{ id }`-ja. Átír: egy későbbi select látja.
  - `updateChain(filter, run)`: belső segéd, a `posts` update is ezt használja, változatlan viselkedéssel.

- [ ] **Step 1: A négy új teszt**

`lib/pipeline/fake-db.test.ts`: az import sora

```ts
import { fakeDb } from "./fake-db.ts";
```

helyett:

```ts
import { fakeDb, pgError } from "./fake-db.ts";
```

A fájl végére:

```ts

// Kills: `order()` ignored (the listing comes back in fixture order), the sort after `limit`, and a
// listing that reads only `pending` (listMySources passes none, and would always get []).
test("a sources listing without `pending` reads the sources rows: filtered, ordered, then limited", async () => {
  const sources = [
    { id: 1, submitted_by: "owner", created_at: "2026-09-20T10:00:00Z" },
    { id: 2, submitted_by: "other", created_at: "2026-09-23T10:00:00Z" },
    { id: 3, submitted_by: "owner", created_at: "2026-09-22T10:00:00Z" },
    { id: 4, submitted_by: "owner", created_at: "2026-09-21T10:00:00Z" },
  ];
  const db = fakeDb(undefined, { sources });
  const { data } = await db.from("sources").select("id").eq("submitted_by", "owner").order("created_at", { ascending: false }).limit(2);
  assert.deepEqual(data?.map((row) => row.id), [3, 4]);
});

// Kills: maybeSingle() answering the first of several rows, or an error for none.
test("a sources maybeSingle() answers the one matching row, null for none, and PGRST116 for several", async () => {
  const db = fakeDb(undefined, { sources: [{ id: 1, status: "failed" }, { id: 2, status: "failed" }] });
  assert.equal((await db.from("sources").select("id, status").eq("id", 2).maybeSingle()).data?.id, 2);
  assert.deepEqual(await db.from("sources").select("status").eq("id", 3).maybeSingle(), { data: null, error: null });
  assert.equal((await db.from("sources").select("status").eq("status", "failed").maybeSingle()).error?.code, "PGRST116");
});

// Kills: an update that ignores its filters (every row changes), or one that isn't written through —
// then a second compare-and-swap on the same status matches again, and one retry starts two runs.
test("a sources update changes only the rows its filters match, writes through, and .select() reports them", async () => {
  const tables = { sources: [{ id: 5, status: "failed" }, { id: 6, status: "failed" }] };
  const db = fakeDb(undefined, tables);
  const claim = () => db.from("sources").update({ status: "pending" }).eq("id", 5).eq("status", "failed").select("id");
  assert.deepEqual((await claim()).data, [{ id: 5 }]);
  assert.deepEqual((await claim()).data, []);
  assert.deepEqual(tables.sources.map((row) => row.status), ["pending", "failed"]);
  assert.deepEqual(db.sourceUpdates, [{ status: "pending" }, { status: "pending" }]);
});

// Kills: sourceSelectError ignored by one of the three terminal calls.
test("sourceSelectError answers the listing, single() and maybeSingle() alike", async () => {
  const error = pgError("08006", "connection failure");
  const db = fakeDb(undefined, { sources: [{ id: 1 }], sourceSelectError: error });
  const results = [
    await db.from("sources").select("id").order("id").limit(10),
    await db.from("sources").select("id").eq("id", 1).single(),
    await db.from("sources").select("id").eq("id", 1).maybeSingle(),
  ];
  for (const result of results) assert.deepEqual(result, { data: null, error });
});
```

(A `select("id, status")` azért kell, mert a supabase-js a select-szövegből típust következtet: a `select("status")` sorának nincs `id`-je a `tsc` szerint.)

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/fake-db.test.ts`
Elvárt: `ℹ tests 5`, `ℹ fail 4`:
- a listázás: `AssertionError … strictly deep-equal` (`[]`, mert `pending` nélkül üres);
- `TypeError: db.from(...).select(...).eq(...).maybeSingle is not a function` (kétszer);
- `TypeError: db.from(...).update(...).eq(...).eq is not a function`.

- [ ] **Step 3: A fake** (`lib/pipeline/fake-db.ts`)

A `FakeIngestTables`-ben ez:

```ts
  /** Rows `retryPendingSources`' pending-sources listing filters (`eq`/`neq`/`lt`), then limits. */
  pending?: Record<string, unknown>[];
  /** Forces `sources`' `insert(...).select().single()` to resolve with this error, e.g. `pgError("23505", …)`. */
  sourceInsertError?: PostgrestErrorShape;
```

helyett:

```ts
  /** Rows `retryPendingSources`' pending-sources listing filters (`eq`/`neq`/`lt`), orders, then limits.
   *  Without it, a listing (`listMySources`) reads `sources` / `source` instead. */
  pending?: Record<string, unknown>[];
  /** Forces `sources`' `insert(...).select().single()` to resolve with this error, e.g. `pgError("23505", …)`. */
  sourceInsertError?: PostgrestErrorShape;
  /** Forces every `sources` select (the listing, `single()`, `maybeSingle()`) to resolve with this error. */
  sourceSelectError?: PostgrestErrorShape;
```

A teljes `sourcesQuery` (a doc-kommentjével együtt, a `function sourcesQuery(…) {…}` végéig) helyére:

```ts
const notOneRow = (count: number) => pgError("PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${count} rows`);

/** `sources`' select chain, filters applied: the listing (`order`, then `limit`) over `listed`, the
 *  one-row lookups over `lookedUp` — `single` answers PGRST116 unless exactly one row matches,
 *  `maybeSingle` answers null for none and PGRST116 for several. `error` answers all three. */
function sourcesQuery(
  listed: Record<string, unknown>[],
  lookedUp: Record<string, unknown>[],
  onEq: (column: string, value: unknown) => void,
  error: PostgrestErrorShape | undefined,
) {
  const filters: Filter[] = [];
  let sortBy: { column: string; ascending: boolean } | undefined;
  const matching = (rows: Record<string, unknown>[]) => rows.filter((row) => filters.every((filter) => passes(row, filter)));
  // A row missing the column keeps its place (a stable sort), like the rest of the sparse-fixture rules.
  const sorted = (rows: Record<string, unknown>[]) => {
    if (!sortBy) return rows;
    const { column, ascending } = sortBy;
    return [...rows].sort((a, b) => {
      const [x, y] = [a[column], b[column]] as [string | number | undefined, string | number | undefined];
      if (x === undefined || y === undefined || x === y) return 0;
      return (x < y ? -1 : 1) * (ascending ? 1 : -1);
    });
  };
  const filter = (op: Filter["op"]) => (column: string, value: unknown) => {
    if (op === "eq") onEq(column, value);
    filters.push({ column, op, value });
    return query;
  };
  const query = {
    eq: filter("eq"),
    neq: filter("neq"),
    lt: filter("lt"),
    order: (column: string, { ascending = true }: { ascending?: boolean } = {}) => {
      sortBy = { column, ascending };
      return query;
    },
    limit: async (n: number) => (error ? { data: null, error } : { data: sorted(matching(listed)).slice(0, n), error: null }),
    single: async () => {
      if (error) return { data: null, error };
      const rows = matching(lookedUp);
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: notOneRow(rows.length) };
    },
    maybeSingle: async () => {
      if (error) return { data: null, error };
      const rows = matching(lookedUp);
      return rows.length > 1 ? { data: null, error: notOneRow(rows.length) } : { data: rows[0] ?? null, error: null };
    },
  };
  return query;
}

type UpdateResult = { data: unknown; error: unknown };

/** An update's chain as supabase-js builds it: `.eq` / `.is` filters, each handed to `filter`, then
 *  awaited as is or through `.select(...)`; `run` learns which, since only `.select` reports rows. */
function updateChain(filter: (column: string, value: unknown, op: "eq" | "is") => void, run: (withRepresentation: boolean) => Promise<UpdateResult>) {
  const builder = {
    eq: (column: string, value: unknown) => {
      filter(column, value, "eq");
      return builder;
    },
    is: (column: string, value: unknown) => {
      filter(column, value, "is");
      return builder;
    },
    select: () => run(true),
    then: (onFulfilled: (result: UpdateResult) => unknown, onRejected?: (reason: unknown) => unknown) => run(false).then(onFulfilled, onRejected),
  };
  return builder;
}
```

A `fakeDb` fő doc-kommentjében ez:

```ts
 * only `.is(...)` matches null); a `sources` `single()` that matches no row, or several, answers
 * PostgREST's PGRST116 error.
```

helyett:

```ts
 * only `.is(...)` matches null); a `sources` `single()` that matches no row, or several, answers
 * PostgREST's PGRST116 error, and `maybeSingle()` does for several. A `sources` listing applies
 * `order(column, { ascending })` before `limit(n)`. A `sources` update applies its `.eq` filters
 * and writes through, so a later select sees it.
```

A `from("sources")` ágában ez:

```ts
    if (table === "sources") {
      const lookedUp = tables.sources ?? (tables.source ? [tables.source] : []);
      return {
        select: () => sourcesQuery(tables.pending ?? [], lookedUp, (column, value) => eqCalls.push({ table: "sources", column, value })),
```

helyett:

```ts
    if (table === "sources") {
      const lookedUp = tables.sources ?? (tables.source ? [tables.source] : []);
      const recordEq = (column: string, value: unknown) => eqCalls.push({ table: "sources", column, value });
      return {
        select: () => sourcesQuery(tables.pending ?? lookedUp, lookedUp, recordEq, tables.sourceSelectError),
```

Ugyanitt az `update`:

```ts
        update: (values: Record<string, unknown>) => ({
          eq: async (column: string, value: unknown) => {
            eqCalls.push({ table: "sources", column, value });
            sourceUpdates.push(values);
            writes.push("sources.update");
            return { data: null, error: null };
          },
        }),
```

helyett:

```ts
        // Written through, like `posts`' update below: only the rows every `.eq` filter matches change,
        // and a later `sources` select sees them, so a second compare-and-swap on a column the first
        // one moved matches 0 rows.
        update: (values: Record<string, unknown>) => {
          const filters: Filter[] = [];
          const filter = (column: string, value: unknown, op: "eq" | "is") => {
            if (op === "is") throw new Error("fakeDb: a sources update filters with .eq only");
            recordEq(column, value);
            filters.push({ column, op, value });
          };
          return updateChain(filter, async (withRepresentation) => {
            sourceUpdates.push(values);
            writes.push("sources.update");
            const matched = lookedUp.filter((row) => filters.every((rule) => passes(row, rule)));
            const merged = lookedUp.map((row) => (matched.includes(row) ? { ...row, ...values } : row));
            if (tables.sources) tables.sources = merged;
            else if (tables.source) tables.source = merged[0];
            return { data: withRepresentation ? matched.map((row) => ({ id: row.id })) : null, error: null };
          });
        },
```

A `from("posts")` ágának `update`-jében a `run` után álló

```ts
          const builder = {
            eq: (column: string, value: unknown) => {
              filters.push({ column, value, op: "eq" });
              return builder;
            },
            is: (column: string, value: unknown) => {
              filters.push({ column, value, op: "is" });
              return builder;
            },
            select: () => run(true),
            then: (onFulfilled: (result: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) =>
              run(false).then(onFulfilled, onRejected),
          };
          return builder;
```

helyére:

```ts
          return updateChain((column, value, op) => filters.push({ column, value, op }), run);
```

(A `posts` update viselkedése nem változik: ugyanazok a szűrők, ugyanaz a `run`.)

- [ ] **Step 4: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/pipeline/fake-db.test.ts`
Elvárt: `ℹ tests 5`, `ℹ pass 5`.

Futtatás: `npm test`
Elvárt: `ℹ tests 492`, `ℹ fail 0`. A régi 488 teszt változatlanul zöld. Ellenőrizve: a `processSource`-os tesztek sem érzik az átírást, mert egy futás egy forrást egyszer olvas.

- [ ] **Step 5: Mutációs próba** (`lib/pipeline/fake-db.ts`, mind a `lib/pipeline/fake-db.test.ts`-szel)

| Mutáció | Elvárt bukás |
| --- | --- |
| `sortBy = { column, ascending };` → `void column; void ascending;` | `a sources listing without \`pending\`…` |
| `sourcesQuery(tables.pending ?? lookedUp,` → `sourcesQuery(tables.pending ?? [],` | ugyanaz |
| a `maybeSingle` `rows.length > 1 ?` → `false ?` | `a sources maybeSingle() answers…` |
| `filters.every((rule) => passes(row, rule))` → `true` | `a sources update changes only…` |
| `if (tables.sources) tables.sources = merged;` → `if (tables.sources) void merged;` | ugyanaz |
| a `limit` `error ?` → `false ?` | `sourceSelectError answers…` |

- [ ] **Step 6: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run dup`
Elvárt: mind zöld, `ℹ tests 492`, `Found 0 clones.` (az `updateChain` nélkül a jscpd a két update-építőt klónnak látná).

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/fake-db.ts lib/pipeline/fake-db.test.ts
git commit -m "test: give the fake sources table maybeSingle, ordering and a filtered, written-through update"
```

---

### Task 2: `GET /api/sources/mine` és a 409 `postId`-ja

**Files:**
- Modify: `lib/post-view.ts` (új `shownTitle`, a `toPost` ezt hívja)
- Create: `lib/my-sources.ts`, `lib/my-sources.test.ts`
- Create: `app/api/sources/mine/route.ts`, `app/api/sources/mine/route.test.ts`
- Modify: `app/api/sources/route.ts`, `app/api/sources/route.test.ts`

**Interfaces:**
- Consumes: az 1. feladat `fakeDb`-je (`order`, `sourceSelectError`, `maybeSingle`); `readOverrides` (`lib/overrides.ts`); `SourceKind` (`lib/pipeline/util.ts`).
- Produces:
  - `export const shownTitle = (row: { title?: unknown; overrides?: unknown }): Localized` (`lib/post-view.ts`)
  - `export const MINE_LIMIT = 10`
  - `export type MySource = { id: number; url: string; kind: SourceKind; status: "pending" | "done" | "failed"; error: string | null; note: string | null; createdAt: string; post: { id: number; title: Localized } | null }`
  - `export async function listMySources(db: SupabaseClient, viewerId: string): Promise<MySource[] | null>`
  - `GET /api/sources/mine` → 200 `{ sources: MySource[] }`, 401 `unauthorized`, 500 `db_error`.
  - `POST /api/sources` 409: `{ error: "already_submitted", postId?: number }`.

- [ ] **Step 1: A tesztek**

`lib/my-sources.test.ts` (új):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { listMySources, MINE_LIMIT } from "./my-sources.ts";
import { fakeDb, pgError } from "./pipeline/fake-db.ts";

/** A `sources` row as the listing selects it, submitted by "owner" on 2026-09-(10 + id). */
const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status: "done",
  error: null,
  note: null,
  submitted_by: "owner",
  created_at: `2026-09-${10 + id}T08:00:00Z`,
  posts: null,
  ...overrides,
});

// Review Focus 3. Kills: the `submitted_by` filter dropped (RLS lets every reader select every source,
// so another reader's links reach the thread), `ascending: true` (the 10 oldest instead of the 10
// newest), and a limit other than MINE_LIMIT.
test("listMySources answers the viewer's own latest MINE_LIMIT sources, newest first", async () => {
  const own = Array.from({ length: 12 }, (_, index) => row(index + 1));
  const db = fakeDb(undefined, { sources: [...own, row(19, { submitted_by: "other" })] });
  const sources = await listMySources(db, "owner");
  assert.equal(MINE_LIMIT, 10);
  assert.deepEqual(sources?.map((source) => source.id), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
});

// Kills: the model's title shown over the submitter's override (the thread and the post page would
// disagree), a post-less source reported with a post, and a column read under the wrong name.
test("listMySources maps each row to the thread's shape, the submitter's title override winning", async () => {
  const db = fakeDb(undefined, {
    sources: [
      row(1, { kind: "arxiv", status: "pending", note: "A módszertan" }),
      row(2, { posts: { id: 9, title: { hu: "Modell", en: "Model" }, overrides: { title: { hu: "Saját", en: "Own" } } } }),
      row(3, { status: "failed", error: "fetch 404" }),
    ],
  });
  assert.deepEqual(await listMySources(db, "owner"), [
    { id: 3, url: "https://blog.test/3", kind: "article", status: "failed", error: "fetch 404", note: null, createdAt: "2026-09-13T08:00:00Z", post: null },
    { id: 2, url: "https://blog.test/2", kind: "article", status: "done", error: null, note: null, createdAt: "2026-09-12T08:00:00Z", post: { id: 9, title: { hu: "Saját", en: "Own" } } },
    { id: 1, url: "https://blog.test/1", kind: "arxiv", status: "pending", error: null, note: "A módszertan", createdAt: "2026-09-11T08:00:00Z", post: null },
  ]);
});

// Kills: a failed query reported as an empty thread; the chat must say it can't reach the list.
test("listMySources answers null when the query fails", async () => {
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await listMySources(db, "owner"), null);
});
```

`app/api/sources/mine/route.test.ts` (új):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, pgError, type FakeIngestTables } from "../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, signedIn } from "../../../../lib/test/route-hooks.ts";

const { GET } = await import("./route.ts");

function readerWith(tables: FakeIngestTables) {
  resetRoute();
  routeStub.reader = signedIn(fakeDb(undefined, tables), "owner");
}

const source = (id: number, submittedBy: string) => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status: "pending",
  error: null,
  note: null,
  submitted_by: submittedBy,
  created_at: `2026-09-2${id}T08:00:00Z`,
  posts: null,
});

// Review Focus 3, at the route. Kills `reader.viewer.id` → `reader.viewer.email`: the filter would
// match nobody's rows (or, unfiltered, everybody's).
test("GET /api/sources/mine answers the caller's own sources only", async () => {
  readerWith({ sources: [source(1, "owner"), source(2, "other")] });
  const response = await GET();
  const body = (await response.json()) as { sources: { id: number }[] };
  assert.equal(response.status, 200);
  assert.deepEqual(body.sources.map(({ id }) => id), [1]);
});

// Kills a failed query answered as 200 with an empty thread.
test("GET /api/sources/mine answers 500 db_error when the query fails", async () => {
  readerWith({ sourceSelectError: pgError("08006", "connection failure") });
  const response = await GET();
  assert.deepEqual([response.status, await response.json()], [500, { error: "db_error" }]);
});

test("GET /api/sources/mine answers 401 when signed out", async () => {
  resetRoute();
  const response = await GET();
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
```

`app/api/sources/route.test.ts`: a `// N4: the 202 is a promise that the link gets processed after the response.` sor elé:

```ts
// Kills a lookup keyed on the raw body instead of the normalized url (host case, #hash), and a
// dropped postId: the chat's "MEGNYITÁS →" would never show, or would open another link's post.
test("POST /api/sources answers 409 with the post's id when the link is already in and has a post", async () => {
  reader({
    sourceInsertError: pgError("23505", 'duplicate key value violates unique constraint "sources_url_key"'),
    sources: [
      { id: 3, url: "https://blog.test/other", posts: { id: 8 } },
      { id: 4, url: "https://blog.test/post", posts: { id: 9 } },
    ],
  });
  const response = await submit({ url: "https://BLOG.test/post#top" });
  assert.deepEqual([response.status, await response.json()], [409, { error: "already_submitted", postId: 9 }]);
  assert.deepEqual(routeStub.scheduled, []);
});

```

A meglévő `…answers 409 already_submitted when the link is already in the library` teszt (fixture-sor nélkül) változatlan marad. Ez rögzíti, hogy poszt nélkül a válasz ugyanaz, mint eddig.

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts app/api/sources/mine/route.test.ts app/api/sources/route.test.ts`
Elvárt:
- a két új fájl betöltése `ERR_MODULE_NOT_FOUND`-dal bukik (`./my-sources.ts`, illetve `./route.ts`);
- a `route.test.ts` új esete: `[409, { error: 'already_submitted' }]` ≠ `[409, { error: 'already_submitted', postId: 9 }]`.

- [ ] **Step 3: A `shownTitle`** (`lib/post-view.ts`)

A `/** A \`posts\` row (optionally with its \`sources(submitted_by, error)\` embed) as the page's Post. */` sor elé:

```ts
/** The title readers see: the submitter's override wins over the model's (the post page, the link chat). */
export const shownTitle = (row: { title?: unknown; overrides?: unknown }): Localized =>
  readOverrides(row.overrides).title ?? (row.title as Localized);

```

A `toPost`-ban ez:

```ts
    title: overrides.title ?? (row.title as Localized),
```

helyett:

```ts
    title: shownTitle(row),
```

(A fölötte álló komment és a `summary` sora marad, az `overrides` változót a `summary` továbbra is használja.)

- [ ] **Step 4: `lib/my-sources.ts`** (új)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Localized } from "../data/digest-types.ts";
import type { SourceKind } from "./pipeline/util.ts";
import { shownTitle } from "./post-view.ts";

// The reader's own submissions, for the taiyaki link chat: GET /api/sources/mine lists them, and
// POST /api/sources/[id]/retry sends a failed one through the pipeline again. Both routes stay thin.

/** The thread shows this many of the reader's latest submissions. */
export const MINE_LIMIT = 10;

/** One of the reader's own submissions, as GET /api/sources/mine answers it (newest first). */
export type MySource = {
  id: number;
  url: string;
  kind: SourceKind;
  status: "pending" | "done" | "failed";
  error: string | null;
  note: string | null;
  createdAt: string;
  /** Its post, titled as readers see it; null until there is one. */
  post: { id: number; title: Localized } | null;
};

/**
 * The viewer's latest MINE_LIMIT submissions, newest first, each with its post. The `submitted_by`
 * filter is ours, not RLS's: every reader may select every source. Null when the query fails.
 */
export async function listMySources(db: SupabaseClient, viewerId: string): Promise<MySource[] | null> {
  const { data, error } = await db
    .from("sources")
    .select("id, url, kind, status, error, note, created_at, posts(id, title, overrides)")
    .eq("submitted_by", viewerId)
    .order("created_at", { ascending: false })
    .limit(MINE_LIMIT);
  if (error) {
    console.error("own sources query failed", error);
    return null;
  }
  return (data ?? []).map((row) => {
    // posts.source_id is unique, so PostgREST embeds the post as one object, or null.
    const post = row.posts as unknown as { id: number; title: unknown; overrides: unknown } | null;
    return {
      id: row.id,
      url: row.url,
      kind: row.kind,
      status: row.status,
      error: row.error,
      note: row.note,
      createdAt: row.created_at,
      post: post ? { id: post.id, title: shownTitle(post) } : null,
    };
  });
}
```

- [ ] **Step 5: A route-ok**

`app/api/sources/mine/route.ts` (új):

```ts
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listMySources } from "@/lib/my-sources";
import { getReader } from "@/lib/supabase/server";

/** The taiyaki link chat's thread: the caller's own latest submissions. */
export async function GET() {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const sources = await listMySources(reader.db, reader.viewer.id);
  return sources ? NextResponse.json({ sources }) : jsonError(500, "db_error");
}
```

`app/api/sources/route.ts`, ez a sor:

```ts
  if (error?.code === "23505") return jsonError(409, "already_submitted");
```

helyett:

```ts
  if (error?.code === "23505") {
    // Already in: point the submitter at its post, once there is one (the chat's "MEGNYITÁS →").
    const { data: existing } = await reader.db.from("sources").select("posts(id)").eq("url", url.toString()).maybeSingle();
    const postId = (existing?.posts as unknown as { id: number } | null | undefined)?.id;
    return jsonError(409, "already_submitted", postId ? { postId } : {});
  }
```

(A lookup hibája csendben `postId` nélküli 409-et ad. Ez a mostani válasz, a meglévő hívók nem változnak.)

- [ ] **Step 6: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts app/api/sources/mine/route.test.ts app/api/sources/route.test.ts lib/post-view.test.ts`
Elvárt: `ℹ tests 37`, `ℹ fail 0`. A `listMySources answers null…` a `console.error`-t a stderr-re írja, ahogy a `getReaderState` tesztje is. Ez várt.

- [ ] **Step 7: Mutációs próba** (mind a Step 6 négy fájljával)

| Mutáció | Elvárt bukás |
| --- | --- |
| a `.eq("submitted_by", viewerId)` sor törlése (`lib/my-sources.ts`) | `listMySources answers the viewer's own…` és `GET /api/sources/mine answers the caller's own sources only` |
| `{ ascending: false }` → `{ ascending: true }` | `listMySources answers the viewer's own…`, `…maps each row…` |
| `MINE_LIMIT = 10` → `20` | `listMySources answers the viewer's own…` |
| `title: shownTitle(post)` → `title: post.title as never` | `…maps each row…, the submitter's title override winning` |
| `if (error) {` → `if (false) {` | `listMySources answers null…`, `…500 db_error…` |
| `reader.viewer.id` → `reader.viewer.email` (a mine route) | `GET /api/sources/mine answers the caller's own sources only` |
| `sources ? NextResponse.json({ sources }) : jsonError(500, "db_error")` → `NextResponse.json({ sources: sources ?? [] })` | `…500 db_error…` |
| `.eq("url", url.toString())` → `.eq("url", String(body.url))` | `POST /api/sources answers 409 with the post's id…` |
| `postId ? { postId } : {}` → `{}` | ugyanaz |
| a `shownTitle` törzse → `(row.title as Localized)` | `toPost lets the submitter's title and summary win…` és a `…maps each row…` |

- [ ] **Step 8: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run dup`
Elvárt: mind zöld, `ℹ tests 499`, `Found 0 clones.`

- [ ] **Step 9: Commit**

```bash
git add lib/post-view.ts lib/my-sources.ts lib/my-sources.test.ts app/api/sources/mine/route.ts app/api/sources/mine/route.test.ts app/api/sources/route.ts app/api/sources/route.test.ts
git commit -m "feat: list the reader's own submissions and point a duplicate at its post"
```

---

### Task 3: `POST /api/sources/[id]/retry`

**Files:**
- Modify: `lib/my-sources.ts` (új `RetryResult`, `retrySource`), `lib/my-sources.test.ts`
- Create: `app/api/sources/[id]/retry/route.ts`, `app/api/sources/[id]/retry/route.test.ts`
- Modify: `lib/api.ts` (a `postRoute` doc-kommentje)

**Interfaces:**
- Consumes: `postRoute`, `jsonError`, `POST_ERRORS`, `ErrorAnswer` (`lib/api.ts`); `processSource` (`lib/pipeline/ingest.ts`); a route-hooks (`scheduledSourceIds`); az 1. feladat átíró `update`-je.
- Produces:
  - `export type RetryResult = "accepted" | "forbidden" | "not_found" | "not_failed" | "failed"`
  - `export async function retrySource(db: SupabaseClient, admin: SupabaseClient, viewerId: string, sourceId: number): Promise<RetryResult>`. A CAS írása `{ status: "pending", error: null, attempts: 0 }` (a tulajdonos döntése, 2026-09-26).
  - `POST /api/sources/[id]/retry` → 202 `{ ok: true }` és `after(() => processSource(createAdminClient(), sourceId))`; 401 `unauthorized`; 403 `forbidden`; 404 `not_found`; 409 `not_failed`; 500 `db_error`. `maxDuration = 300`.

- [ ] **Step 1: A tesztek**

`lib/my-sources.test.ts`: az import sora

```ts
import { listMySources, MINE_LIMIT } from "./my-sources.ts";
```

helyett:

```ts
import { listMySources, MINE_LIMIT, retrySource } from "./my-sources.ts";
```

A fájl végére:

```ts

/** Source 5 as the reader reads it (RLS select) and as the admin client claims it (the CAS), plus
 *  source 6, the viewer's other failed one, which a retry of 5 must leave alone. */
function retryDbs(asRead: Record<string, unknown>, asClaimed: Record<string, unknown> = asRead) {
  const tables = { sources: [{ id: 5, ...asClaimed }, { id: 6, submitted_by: "owner", status: "failed" }] };
  return { db: fakeDb(undefined, { sources: [{ id: 5, ...asRead }] }), admin: fakeDb(undefined, tables), tables };
}

// Kills a claim that writes the wrong values (the old error stays on the row, or the attempts aren't
// reset: a retry killed at 300 s would then stay pending at 3+ attempts, which the daily cron never
// picks up), and one not keyed on the id (source 6 would be sent back too).
test("retrySource sends the viewer's failed source, and only it, back to pending with no error and its attempts reset", async () => {
  const { db, admin, tables } = retryDbs({ submitted_by: "owner", status: "failed", error: "fetch 404", attempts: 3 });
  assert.equal(await retrySource(db, admin, "owner", 5), "accepted");
  assert.deepEqual(tables.sources, [
    { id: 5, submitted_by: "owner", status: "pending", error: null, attempts: 0 },
    { id: 6, submitted_by: "owner", status: "failed" },
  ]);
});

// Kills the read's owner check, its status check, and a read keyed on anything but the id.
test("retrySource refuses another reader's source, one that isn't failed, and a missing one, writing nothing", async () => {
  const cases = [
    [{ submitted_by: "other", status: "failed" }, 5, "forbidden"],
    [{ submitted_by: "owner", status: "done" }, 5, "not_failed"],
    [{ submitted_by: "owner", status: "failed" }, 6, "not_found"],
  ] as const;
  for (const [asRead, sourceId, expected] of cases) {
    const { db, admin } = retryDbs(asRead);
    assert.equal(await retrySource(db, admin, "owner", sourceId), expected);
    assert.deepEqual(admin.sourceUpdates, [], expected);
  }
});

// The spec's rule: the checks are in the CAS too, not only in the read. The read passes both; the
// row the admin client finds is someone else's, then no longer failed. Kills the CAS's
// `.eq("submitted_by", …)` and its `.eq("status", "failed")`, each on its own.
test("retrySource's compare-and-swap repeats the owner and the status check: a row that changed since the read stays as it is", async () => {
  for (const asClaimed of [{ submitted_by: "other", status: "failed" }, { submitted_by: "owner", status: "pending" }]) {
    const { db, admin, tables } = retryDbs({ submitted_by: "owner", status: "failed" }, asClaimed);
    assert.equal(await retrySource(db, admin, "owner", 5), "not_failed");
    assert.deepEqual(tables.sources[0], { id: 5, ...asClaimed });
  }
});

// Kills a read error taken for "not found" (the route would answer 404 instead of 500).
test("retrySource answers failed when the read fails", async () => {
  const db = fakeDb(undefined, { sourceSelectError: pgError("08006", "connection failure") });
  assert.equal(await retrySource(db, fakeDb(), "owner", 5), "failed");
});
```

`app/api/sources/[id]/retry/route.test.ts` (új):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDb, type FakeIngestDb } from "../../../../../lib/pipeline/fake-db.ts";
import { resetRoute, routeStub, scheduledSourceIds, signedIn } from "../../../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

const retry = (id = "5") => POST(new Request(`http://localhost/api/sources/${id}/retry`, { method: "POST" }), { params: Promise.resolve({ id }) });

/** Source 5, submitted by "owner", in `status`, as both the reader and the admin client see it. */
function sourceAs(viewer: string, status = "failed"): FakeIngestDb {
  resetRoute();
  const row = { id: 5, submitted_by: "owner", status };
  routeStub.reader = signedIn(fakeDb(undefined, { sources: [row] }), viewer);
  const admin = fakeDb(undefined, { sources: [row] });
  routeStub.admin = admin;
  return admin;
}

// Kills `reader.viewer.id` → `reader.viewer.email` (nobody could retry), and a scheduled run of the
// wrong source. The run gets a fresh admin client, like POST /api/sources' own.
test("POST /api/sources/[id]/retry answers 202 to the submitter of a failed source, and schedules its run", async () => {
  const admin = sourceAs("owner");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [202, { ok: true }]);
  assert.deepEqual(admin.sourceUpdates, [{ status: "pending", error: null, attempts: 0 }]);
  const run = fakeDb();
  routeStub.admin = run;
  assert.deepEqual(await scheduledSourceIds(run), [5]);
});

// Review Focus 1: a double click. Both requests read "failed"; only the first compare-and-swap
// matches, so one run starts and the other click answers 409. Kills the CAS's `.eq("status", "failed")`.
test("POST /api/sources/[id]/retry: of two overlapping clicks, one starts the run and the other answers 409 not_failed", async () => {
  sourceAs("owner");
  const responses = await Promise.all([retry(), retry()]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [202, 409]);
  assert.equal(routeStub.scheduled.length, 1);
});

test("POST /api/sources/[id]/retry answers 403 to a reader who didn't submit it, and changes nothing", async () => {
  const admin = sourceAs("intruder");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [403, { error: "forbidden" }]);
  assert.deepEqual(admin.sourceUpdates, []);
  assert.deepEqual(routeStub.scheduled, []);
});

// Kills a not_failed mapped to 403/500: the chat refreshes on 409 instead of showing an error.
test("POST /api/sources/[id]/retry answers 409 not_failed for a source that isn't failed", async () => {
  sourceAs("owner", "pending");
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [409, { error: "not_failed" }]);
  assert.deepEqual(routeStub.scheduled, []);
});

// The preview's fixture ids are negative: postRoute answers 404 before any read.
test("POST /api/sources/[id]/retry answers 404 for a missing source and for an id no source can have", async () => {
  for (const id of ["6", "-5"]) {
    sourceAs("owner");
    const response = await retry(id);
    assert.deepEqual([response.status, await response.json()], [404, { error: "not_found" }], id);
  }
});

test("POST /api/sources/[id]/retry answers 401 when signed out", async () => {
  resetRoute();
  const response = await retry();
  assert.deepEqual([response.status, await response.json()], [401, { error: "unauthorized" }]);
});
```

(A `sourceAs` ugyanazt a sor-objektumot adja mindkét fake-nek. Az admin fake átírása új objektumot épít, így az olvasó fake sora `failed` marad, és a két párhuzamos kérés mindkét előzetes olvasása átmegy.)

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts "app/api/sources/[[]id]/retry/route.test.ts"`
Elvárt:
- a `lib/my-sources.test.ts` betöltése `SyntaxError: The requested module './my-sources.ts' does not provide an export named 'retrySource'`;
- a route-teszt `ERR_MODULE_NOT_FOUND` (`./route.ts`).

- [ ] **Step 3: `retrySource`** (`lib/my-sources.ts` végére)

```ts

export type RetryResult = "accepted" | "forbidden" | "not_found" | "not_failed" | "failed";

/**
 * "Újra" on the viewer's own failed submission. Read as the reader, then claimed with the admin
 * client (readers can't update `sources`) in one compare-and-swap that repeats both checks: only a
 * row that is still the viewer's and still `failed` goes back to `pending`. Of two overlapping
 * clicks only one can win; the other's update matches 0 rows and answers "not_failed".
 * The claim also resets `attempts`: a retry run killed at 300 s would otherwise stay `pending` at
 * 3+ attempts, which `retryPendingSources` never picks up.
 */
export async function retrySource(db: SupabaseClient, admin: SupabaseClient, viewerId: string, sourceId: number): Promise<RetryResult> {
  const { data: source, error } = await db.from("sources").select("submitted_by, status").eq("id", sourceId).maybeSingle();
  if (error) return "failed";
  if (!source) return "not_found";
  if (source.submitted_by !== viewerId) return "forbidden";
  if (source.status !== "failed") return "not_failed";

  // ponytail: no cooldown — the status CAS rules out overlapping runs, and each run is one click; add a wait here if it gets abused.
  const { data: claimed, error: claimError } = await admin
    .from("sources")
    .update({ status: "pending", error: null, attempts: 0 })
    .eq("id", sourceId)
    .eq("submitted_by", viewerId)
    .eq("status", "failed")
    .select("id");
  if (claimError) return "failed";
  return claimed?.length ? "accepted" : "not_failed";
}
```

- [ ] **Step 4: A route** (`app/api/sources/[id]/retry/route.ts`, új)

```ts
import { after, NextResponse } from "next/server";
import { jsonError, POST_ERRORS, postRoute, type ErrorAnswer } from "@/lib/api";
import { retrySource, type RetryResult } from "@/lib/my-sources";
import { processSource } from "@/lib/pipeline/ingest";
import { createAdminClient, getReader } from "@/lib/supabase/server";

export const maxDuration = 300;

// Exhaustive by construction, like the posts/[id] routes: a RetryResult with no entry is a tsc error.
const RETRY_STATUS: Record<Exclude<RetryResult, "accepted">, ErrorAnswer> = {
  ...POST_ERRORS,
  not_failed: { status: 409, error: "not_failed" },
};

export const POST = postRoute(getReader, async (_request, { reader, postId: sourceId }) => {
  const result = await retrySource(reader.db, createAdminClient(), reader.viewer.id, sourceId);
  if (result !== "accepted") {
    const { status, error } = RETRY_STATUS[result];
    return jsonError(status, error);
  }
  // Like POST /api/sources: answer now, process after the response.
  after(() => processSource(createAdminClient(), sourceId));
  return NextResponse.json({ ok: true }, { status: 202 });
});
```

`lib/api.ts`, a `postRoute` doc-kommentjében ez:

```ts
/**
 * A `posts/[id]` route handler: 401 when `getReader` finds no session, 404 for an id no post can
 * have (the same answer as "no such post"), otherwise `handler` with the reader and the post id.
 */
```

helyett:

```ts
/**
 * An `[id]` route handler (the `posts/[id]` routes and `sources/[id]/retry`, which reads the id as
 * `{ postId: sourceId }`): 401 when `getReader` finds no session, 404 for an id no row can have
 * (the same answer as "no such row"), otherwise `handler` with the reader and the id.
 */
```

- [ ] **Step 5: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/my-sources.test.ts "app/api/sources/[[]id]/retry/route.test.ts"`
Elvárt: `ℹ tests 13`, `ℹ fail 0`.

- [ ] **Step 6: Mutációs próba** (mind a Step 5 két fájljával)

| Mutáció | Elvárt bukás |
| --- | --- |
| a CAS `.eq("submitted_by", viewerId)` sorának törlése | `retrySource's compare-and-swap repeats the owner and the status check…` |
| a CAS `.eq("status", "failed")` sorának törlése | ugyanaz, és `…of two overlapping clicks…` |
| a CAS `.eq("id", sourceId)` sorának törlése | `retrySource sends the viewer's failed source, and only it…` és a CAS-teszt |
| `.update({ status: "pending", error: null, attempts: 0 })` → `.update({ status: "pending", attempts: 0 })` | `retrySource sends…` és `…answers 202 to the submitter…` |
| `.update({ status: "pending", error: null, attempts: 0 })` → `.update({ status: "pending", error: null })` (a nullázás elmarad) | `retrySource sends…` (a sor `attempts: 3` marad) és `…answers 202 to the submitter…` |
| `if (source.submitted_by !== viewerId) return "forbidden";` törlése | `retrySource refuses…` és `…answers 403…` |
| `if (source.status !== "failed") return "not_failed";` törlése | `retrySource refuses…` |
| a read `.eq("id", sourceId)` → `.eq("submitted_by", viewerId)` | `retrySource refuses…`, `…403…`, `…404…` |
| `if (error) return "failed";` törlése | `retrySource answers failed when the read fails` |
| `reader.viewer.id` → `reader.viewer.email` (route) | `…202…`, `…overlapping clicks…`, `…409 not_failed…` |
| az `after(…)` sor törlése | `…202…` és `…overlapping clicks…` |
| `not_failed: { status: 409, error: "not_failed" }` → `not_failed: POST_ERRORS.forbidden` | `…overlapping clicks…` és `…409 not_failed…` |

- [ ] **Step 7: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run dup`
Elvárt: mind zöld, `ℹ tests 509`, `Found 0 clones.`

- [ ] **Step 8: Commit**

```bash
git add lib/my-sources.ts lib/my-sources.test.ts lib/api.ts "app/api/sources/[id]/retry/route.ts" "app/api/sources/[id]/retry/route.test.ts"
git commit -m "feat: let a submitter retry a failed submission"
```

---

### Task 4: `parseLinkMessage`

**Files:**
- Create: `lib/link-chat.ts`, `lib/link-chat.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `export type LinkMessage = { url: string; note: string | null; moreLinks: boolean } | { error: "no_link" }`
  - `export function parseLinkMessage(text: string): LinkMessage`
  - A szabály: a szöveg szavakra bomlik (`\s+`). Egy szó link, ha az elejéről a `([{<'"` jeleket, a végéről a `.,;:!?)]}'"` jeleket levágva `http://` vagy `https://` kezdetű (kis- és nagybetűre érzéketlenül), és utána van még karakter. A végén álló `)` marad, ha a linkben legalább annyi `(` van, ahány `)`. Az első ilyen szó a link. A többi szó szóközzel összefűzve a megjegyzés, üresen `null`. A `moreLinks` jelzi, ha több link-szó volt.

- [ ] **Step 1: A tesztek** (`lib/link-chat.test.ts`, új)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkMessage } from "./link-chat.ts";

const linkOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "url" in message ? message.url : null;
};
const noteOf = (text: string) => {
  const message = parseLinkMessage(text);
  return "note" in message ? message.note : undefined;
};

// Kills a message with no link sent as one ("https://" alone, or a link glued to a word, is none).
test("parseLinkMessage finds no link in plain text, a bare scheme, or a link glued to a word", () => {
  for (const text of ["szia, mi újság?", "   ", "https://", "Nézd:https://example.test/a"]) {
    assert.deepEqual(parseLinkMessage(text), { error: "no_link" }, text);
  }
});

// Kills the note keeping the link, and a note that isn't the rest of the message.
test("parseLinkMessage takes the link and keeps the rest of the message as its note", () => {
  assert.deepEqual(parseLinkMessage("https://example.test/a nézd meg a második részt"), {
    url: "https://example.test/a",
    note: "nézd meg a második részt",
    moreLinks: false,
  });
});

// Review Focus 4. Kills the CLOSING strip (the full stop ends up in the URL, a 404), the OPENING strip
// (a link in parentheses is not found), and the balanced-parenthesis rule (Wikipedia's links break).
test("parseLinkMessage strips sentence punctuation around the link, but keeps a parenthesis the link itself opened", () => {
  assert.equal(linkOf("Ezt olvasd: https://example.test/a."), "https://example.test/a");
  assert.equal(linkOf("Szerinted jó? https://example.test/a?!"), "https://example.test/a");
  assert.equal(linkOf('"https://example.test/a",'), "https://example.test/a");
  assert.equal(linkOf("(https://example.test/a) fontos"), "https://example.test/a");
  assert.equal(linkOf("https://en.wikipedia.org/wiki/Taiyaki_(food)."), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
  assert.equal(linkOf("(lásd https://en.wikipedia.org/wiki/Taiyaki_(food))"), "https://en.wikipedia.org/wiki/Taiyaki_(food)");
});

// Review Focus 4. Kills `moreLinks` always false (the reader never learns the second link was left
// out), and the second link dropped from the note.
test("parseLinkMessage sends the first of several links and says there were more", () => {
  assert.deepEqual(parseLinkMessage("https://a.test/1 és https://b.test/2"), {
    url: "https://a.test/1",
    note: "és https://b.test/2",
    moreLinks: true,
  });
});

// Kills `note || null` (an empty string is stored as a note), and a note whose whitespace isn't collapsed.
test("parseLinkMessage collapses the note's whitespace, and a blank one is null", () => {
  assert.equal(noteOf("  https://example.test/a  \n\t "), null);
  assert.equal(noteOf("sok   szóköz\n\nés sor https://example.test/a"), "sok szóköz és sor");
});

// Kills the `i` flag: a pasted "HTTPS://" link is still a link. The route's parseSubmittedUrl lowercases it.
test("parseLinkMessage takes an upper-case scheme as a link, as typed", () => {
  assert.deepEqual(parseLinkMessage("HTTPS://EXAMPLE.TEST/A"), { url: "HTTPS://EXAMPLE.TEST/A", note: null, moreLinks: false });
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/link-chat.test.ts`
Elvárt: a fájl betöltése `ERR_MODULE_NOT_FOUND`-dal bukik (`./link-chat.ts`).

- [ ] **Step 3: `lib/link-chat.ts`** (új)

```ts
// The taiyaki link chat's logic, framework-free so node --test runs it: a message → a submission,
// the reader's own sources → the thread, and the live thread's polling rules. The panel
// (app/components/link-chat.tsx) binds it to React.

export type LinkMessage = { url: string; note: string | null; moreLinks: boolean } | { error: "no_link" };

const OPENING = /^[([{<'"]+/;
const CLOSING = /[.,;:!?)\]}'"]$/;
const count = (text: string, char: string) => text.split(char).length - 1;

/** The link one whitespace-separated word holds, or null. Sentence punctuation around it is not part
 *  of it, but a `)` that closes a `(` inside the link is (Wikipedia's `…/Taiyaki_(food)`). */
function linkIn(word: string): string | null {
  let link = word.replace(OPENING, "");
  while (CLOSING.test(link) && !(link.endsWith(")") && count(link, "(") >= count(link, ")"))) link = link.slice(0, -1);
  return /^https?:\/\/\S/i.test(link) ? link : null;
}

/** The first link in `text` is the submission; the rest of the text, without that word and with its
 *  whitespace collapsed, is the note. Any further link stays in the note, and `moreLinks` says so. */
export function parseLinkMessage(text: string): LinkMessage {
  const words = text.split(/\s+/).filter(Boolean);
  const links = words.map(linkIn);
  const first = links.findIndex((link) => link !== null);
  if (first === -1) return { error: "no_link" };
  const note = words.filter((_, index) => index !== first).join(" ");
  return { url: links[first]!, note: note || null, moreLinks: links.filter((link) => link !== null).length > 1 };
}
```

- [ ] **Step 4: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/link-chat.test.ts`
Elvárt: `ℹ tests 6`, `ℹ pass 6`.

- [ ] **Step 5: Mutációs próba** (`lib/link-chat.ts`, a `lib/link-chat.test.ts`-szel)

| Mutáció | Elvárt bukás |
| --- | --- |
| `let link = word.replace(OPENING, "");` → `let link = word;` | `…strips sentence punctuation…` |
| a `while` feltétele → `CLOSING.test(link) && false` | ugyanaz |
| a `while` feltétele → `CLOSING.test(link)` (zárójel-szabály nélkül) | ugyanaz (Wikipédia) |
| `moreLinks: …` → `moreLinks: false` | `…sends the first of several links…` |
| `note: note \|\| null` → `note` | `…collapses the note's whitespace…`, `…upper-case scheme…` |
| a `/i` jelző elhagyása | `…upper-case scheme…` |
| `/^https?:\/\/\S/i` → `/^https?:\/\//i` | `…finds no link…` (`https://`) |
| `const note = words.filter(…).join(" ");` → `words.join(" ")` | négy teszt |
| `text.split(/\s+/)` → `text.split(" ")` | `…collapses the note's whitespace…` |

- [ ] **Step 6: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run dup`
Elvárt: mind zöld, `ℹ tests 515`, `Found 0 clones.`

- [ ] **Step 7: Commit**

```bash
git add lib/link-chat.ts lib/link-chat.test.ts
git commit -m "feat: parse a chat message into a link and a note"
```

---

### Task 5: A chat logikája: a szál, az élő frissítés, a küldés, az „Újra” és a transportok

**Files:**
- Modify: `lib/link-chat.ts`, `lib/link-chat.test.ts`
- Modify: `app/(app)/library/submit-form.tsx` (a `postSource` a `httpTransport.submit`-et hívja)

**Interfaces:**
- Consumes: `MySource` (2. feladat); `safeHref` (`lib/blocks.ts`); `detectSource`, `parseSubmittedUrl`, `SourceKind` (`lib/pipeline/util.ts`); `parseLinkMessage` (4. feladat).
- Produces:
  - `export type ChatReply = { state: "pending"; kind: SourceKind } | { state: "done"; postId: number; title: Localized } | { state: "failed"; error: string | null }`
  - `export type ChatEntry = { id: number; url: string; href: string | undefined; note: string | null; reply: ChatReply }`
  - `export function toThread(sources: MySource[]): ChatEntry[]` (a legrégebbi elöl)
  - `export type ChatNotice = { kind: "no_link" | "more_links" | "invalid_url" | "network" | "signed_out" } | { kind: "already_submitted"; postId: number | null }`
  - `export type Answer = { status: number; body: Record<string, unknown> }`
  - `export type ChatTransport = { mine(): Promise<Answer>; submit(url: string, note: string | null): Promise<Answer>; retry(sourceId: number): Promise<Answer> }`
  - `export const httpTransport: ChatTransport`; `export function memoryTransport(seed: MySource[], fail: boolean): ChatTransport`
  - `export const POLL_MS = 4000`; `export const MAX_POLLS = 150`
  - `export type ChatSnapshot = { sources: MySource[] | null; notices: ChatNotice[]; unreachable: boolean; sending: boolean; retrying: number[] }`
  - `export function createLinkChat(transport: ChatTransport, isVisible: () => boolean)` → `{ subscribe, getSnapshot, open(), close(), send(text): Promise<boolean>, retry(sourceId): Promise<void> }`; `export type LinkChat`

- [ ] **Step 1: A tesztek** (`lib/link-chat.test.ts`)

Az import-blokk

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkMessage } from "./link-chat.ts";
```

helyett:

```ts
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  createLinkChat,
  MAX_POLLS,
  memoryTransport,
  parseLinkMessage,
  POLL_MS,
  toThread,
  type Answer,
  type ChatNotice,
  type ChatTransport,
} from "./link-chat.ts";
import type { MySource } from "./my-sources.ts";
```

A fájl végére:

```ts

const source = (id: number, status: MySource["status"], overrides: Partial<MySource> = {}): MySource => ({
  id,
  url: `https://blog.test/${id}`,
  kind: "article",
  status,
  error: null,
  note: null,
  createdAt: "2026-09-24T08:00:00Z",
  post: null,
  ...overrides,
});

/** Lets every settled promise run its callbacks (setImmediate isn't one of the mocked timers). */
const flush = () => new Promise((resolve) => setImmediate(resolve));
const answer = (status: number, body: Record<string, unknown> = {}) => async (): Promise<Answer> => ({ status, body });
const offline = async (): Promise<Answer> => {
  throw new TypeError("Failed to fetch");
};

/** GET /api/sources/mine answers `sources` and the writes answer 202, unless `answers` says otherwise; every call is counted. */
function fakeTransport(sources: MySource[], answers: { [K in keyof ChatTransport]?: () => Promise<Answer> } = {}) {
  const calls = { mine: 0, submit: [] as [string, string | null][], retry: [] as number[] };
  const transport: ChatTransport = {
    mine: () => {
      calls.mine++;
      return answers.mine?.() ?? answer(200, { sources })();
    },
    submit: (url, note) => {
      calls.submit.push([url, note]);
      return answers.submit?.() ?? answer(202, { ok: true, id: 1 })();
    },
    retry: (sourceId) => {
      calls.retry.push(sourceId);
      return answers.retry?.() ?? answer(202, { ok: true })();
    },
  };
  return { transport, calls };
}

/** Moves the mocked clock on by `ms`, and lets the load it starts land. */
async function wait(t: TestContext, ms: number) {
  t.mock.timers.tick(ms);
  await flush();
}

/** An open chat whose thread holds `sources` (one pending by default), its first load landed. */
async function opened(sources = [source(1, "pending")], isVisible = () => true) {
  const { transport, calls } = fakeTransport(sources);
  const chat = createLinkChat(transport, isVisible);
  chat.open();
  await flush();
  return { chat, calls };
}

// Kills the oldest-first order, a reply that ignores the status, and a link that skips safeHref.
test("toThread lists the oldest first, answers each status, and never links a non-http URL", () => {
  const entries = toThread([
    source(3, "failed", { error: "fetch 404" }),
    source(2, "done", { post: { id: 9, title: { hu: "Cím", en: "Title" } } }),
    source(1, "pending", { kind: "arxiv", url: "javascript:alert(1)", note: "Figyelj a módszertanra" }),
  ]);
  assert.deepEqual(entries.map(({ id }) => id), [1, 2, 3]);
  assert.deepEqual(entries.map(({ reply }) => reply), [
    { state: "pending", kind: "arxiv" },
    { state: "done", postId: 9, title: { hu: "Cím", en: "Title" } },
    { state: "failed", error: "fetch 404" },
  ]);
  assert.deepEqual(entries.map(({ href }) => href), [undefined, "https://blog.test/2", "https://blog.test/3"]);
  assert.equal(entries[0].note, "Figyelj a módszertanra");
});

// Review Focus 2. Kills `close()` keeping its timer (one more GET after the panel is gone), and a
// POLL_MS other than 4 s.
test("the thread polls every 4 s while the panel is open and a source is pending, and never after it closes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { chat, calls } = await opened();
  await wait(t, POLL_MS - 1);
  assert.equal(calls.mine, 1);
  await wait(t, 1);
  assert.equal(calls.mine, 2);
  chat.close();
  await wait(t, POLL_MS * 3);
  assert.equal(calls.mine, 2);
  assert.equal(POLL_MS, 4000);
});

// Kills the pending rule (a finished thread polls on), and the visibility rule (a hidden tab still fetches).
test("the thread polls only while a source is pending, and a hidden tab skips the fetch until it is visible again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const finished = await opened([source(1, "done"), source(2, "failed")]);
  await wait(t, POLL_MS * 3);
  assert.equal(finished.calls.mine, 1);
  finished.chat.close();

  let visible = false;
  const { calls } = await opened(undefined, () => visible);
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 1);
  visible = true;
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 2);
});

// Kills the MAX_POLLS cap (a stuck pending source would poll as long as the panel stays open), and a
// count that opening the panel again doesn't restart.
test("polling stops after MAX_POLLS, and opening the panel again restarts it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { chat, calls } = await opened();
  for (let tick = 0; tick <= MAX_POLLS; tick++) await wait(t, POLL_MS);
  assert.equal(calls.mine, 1 + MAX_POLLS);
  chat.close();
  chat.open();
  await flush();
  await wait(t, POLL_MS);
  assert.equal(calls.mine, 1 + MAX_POLLS + 2);
});

// Kills the `latest` guard: a load that answers after a newer one would put a finished source back to
// pending, and, being the last word, keep showing it as processing.
test("an older load that answers late never overwrites a newer one", async () => {
  let answerFirst: (value: Answer) => void = () => {};
  const loads: Promise<Answer>[] = [
    new Promise((resolve) => {
      answerFirst = resolve;
    }),
    answer(200, { sources: [source(1, "done", { post: { id: 9, title: { hu: "Kész", en: "Done" } } })] })(),
  ];
  let call = 0;
  const chat = createLinkChat(fakeTransport([], { mine: () => loads[call++] }).transport, () => true);
  chat.open();
  assert.equal(await chat.send("https://blog.test/1"), true);
  answerFirst({ status: 200, body: { sources: [source(1, "pending")] } });
  await flush();
  assert.equal(chat.getSnapshot().sources?.[0].status, "done");
});

// Kills an unreachable flag that the next good load doesn't clear, a failed load that says nothing,
// and a 401 said again on every poll.
test("a failed load says the list is out of reach until a good one; a 401 asks, once, to sign in again", async () => {
  const loads = [offline, answer(200, { sources: [] }), answer(401, { error: "unauthorized" }), answer(401, { error: "unauthorized" })];
  let call = 0;
  const chat = createLinkChat(fakeTransport([], { mine: () => loads[call++]() }).transport, () => true);
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, true);
  chat.open();
  await flush();
  assert.equal(chat.getSnapshot().unreachable, false);
  chat.open();
  await flush();
  chat.open();
  await flush();
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "signed_out" }]);
});

// Review Focus 5, and every refusal the route answers. Kills an offline send that rejects instead of
// saying so, a 409 that drops its postId, and a refusal reported as sent (the panel would clear the field).
test("send: every refusal, offline included, becomes a reply and keeps the text", async () => {
  const cases: [() => Promise<Answer>, ChatNotice][] = [
    [answer(400, { error: "invalid_url" }), { kind: "invalid_url" }],
    [answer(409, { error: "already_submitted", postId: 9 }), { kind: "already_submitted", postId: 9 }],
    [answer(409, { error: "already_submitted" }), { kind: "already_submitted", postId: null }],
    [answer(401, { error: "unauthorized" }), { kind: "signed_out" }],
    [answer(500, { error: "insert_failed" }), { kind: "network" }],
    [offline, { kind: "network" }],
  ];
  for (const [submit, notice] of cases) {
    const chat = createLinkChat(fakeTransport([], { submit }).transport, () => true);
    assert.equal(await chat.send("https://blog.test/a"), false, notice.kind);
    assert.deepEqual(chat.getSnapshot().notices, [notice]);
    assert.equal(chat.getSnapshot().sending, false);
  }
});

// Kills a no-link message that still goes out, a 202 that waits for the next poll to show the new
// submission, and the "one link at a time" reply dropped.
test("send: no link, no request; a sent link reloads the thread at once and says when a second link was left out", async () => {
  const { transport, calls } = fakeTransport([source(1, "pending")]);
  const chat = createLinkChat(transport, () => true);
  assert.equal(await chat.send("csak egy kérdés"), false);
  assert.deepEqual(calls.submit, []);
  assert.equal(await chat.send("https://a.test/1 és https://b.test/2"), true);
  assert.deepEqual(calls.submit, [["https://a.test/1", "és https://b.test/2"]]);
  assert.equal(calls.mine, 1);
  assert.deepEqual(chat.getSnapshot().notices, [{ kind: "no_link" }, { kind: "more_links" }]);
});

// Kills the `sending` guard: a quick double Enter would submit the link twice, and the second copy
// would come back as "Someone already sent this in".
test("send: a second send while the first is on its way sends nothing", async () => {
  let answerSubmit: (value: Answer) => void = () => {};
  const { transport, calls } = fakeTransport([], {
    submit: () =>
      new Promise((resolve) => {
        answerSubmit = resolve;
      }),
  });
  const chat = createLinkChat(transport, () => true);
  const sends = [chat.send("https://blog.test/a"), chat.send("https://blog.test/a")];
  assert.deepEqual(calls.submit, [["https://blog.test/a", null]]);
  answerSubmit({ status: 202, body: { ok: true, id: 1 } });
  assert.deepEqual(await Promise.all(sends), [true, false]);
});

// Review Focus 1, the browser's half. Kills the in-flight guard (a double click sends two retries) and
// a 409 shown as an error: another click, or another tab, already started the run.
test("retry: a second click while the first is on its way sends nothing, and a 409 reloads the thread like a 202", async () => {
  let answerRetry: (value: Answer) => void = () => {};
  const { transport, calls } = fakeTransport([source(1, "failed")], {
    retry: () =>
      new Promise((resolve) => {
        answerRetry = resolve;
      }),
  });
  const chat = createLinkChat(transport, () => true);
  const clicks = [chat.retry(1), chat.retry(1)];
  assert.deepEqual(calls.retry, [1]);
  assert.deepEqual(chat.getSnapshot().retrying, [1]);
  answerRetry({ status: 409, body: { error: "not_failed" } });
  await Promise.all(clicks);
  assert.equal(calls.mine, 1);
  assert.deepEqual([chat.getSnapshot().notices, chat.getSnapshot().retrying], [[], []]);
});

// Kills an offline or refused retry that rejects instead of saying so, or that keeps its button disabled.
test("retry: offline or refused, it says so and frees the button", async () => {
  for (const retry of [offline, answer(500, { error: "db_error" })]) {
    const chat = createLinkChat(fakeTransport([], { retry }).transport, () => true);
    await chat.retry(1);
    assert.deepEqual([chat.getSnapshot().notices, chat.getSnapshot().retrying], [[{ kind: "network" }], []]);
  }
});

// Kills local replies that outlive the panel: they live only while it stays open.
test("closing the panel drops the local replies", async () => {
  const chat = createLinkChat(fakeTransport([]).transport, () => true);
  chat.open();
  await chat.send("nincs link");
  chat.close();
  assert.deepEqual(chat.getSnapshot().notices, []);
});

// Kills a preview that still accepts writes under fail=1, and a preview submission missing from the thread.
test("memoryTransport: a submission joins the thread newest first as pending, a retry sends a failed one back, and fail rejects both", async () => {
  const preview = memoryTransport([source(-1, "failed")], false);
  assert.equal((await preview.submit("https://youtu.be/dQw4w9WgXcQ", null)).status, 202);
  assert.equal((await preview.submit("http://localhost/x", null)).status, 400);
  await preview.retry(-1);
  const { body } = await preview.mine();
  assert.deepEqual((body.sources as MySource[]).map(({ kind, status }) => [kind, status]), [["youtube", "pending"], ["article", "pending"]]);
  const offlinePreview = memoryTransport([], true);
  await assert.rejects(offlinePreview.submit("https://blog.test/a", null), TypeError);
  await assert.rejects(offlinePreview.retry(-1), TypeError);
});
```

A dupla kattintásos tesztek a két hívást `await` nélkül indítják. A második hívás őre szinkron fut, így egy őr nélküli mutáns azonnal bukik, és nem akad el egy soha fel nem oldott ígéreten.

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/link-chat.test.ts`
Elvárt: a fájl betöltése `SyntaxError: The requested module './link-chat.ts' does not provide an export named 'createLinkChat'`.

- [ ] **Step 3: A logika** (`lib/link-chat.ts`)

A fájl elejére, a fejléc-komment elé:

```ts
import type { Localized } from "../data/digest-types.ts";
import { safeHref } from "./blocks.ts";
import type { MySource } from "./my-sources.ts";
import { detectSource, parseSubmittedUrl, type SourceKind } from "./pipeline/util.ts";

```

A fájl végére:

```ts

export type ChatReply =
  | { state: "pending"; kind: SourceKind }
  | { state: "done"; postId: number; title: Localized }
  | { state: "failed"; error: string | null };

/** One submission in the thread: the reader's message (`href` already through safeHref) and the taiyaki's reply. */
export type ChatEntry = { id: number; url: string; href: string | undefined; note: string | null; reply: ChatReply };

function replyTo(source: MySource): ChatReply {
  if (source.status === "failed") return { state: "failed", error: source.error };
  if (source.status === "done" && source.post) return { state: "done", postId: source.post.id, title: source.post.title };
  return { state: "pending", kind: source.kind };
}

/** GET /api/sources/mine answers newest first; the thread reads oldest first, like a chat. */
export function toThread(sources: MySource[]): ChatEntry[] {
  return [...sources].reverse().map((source) => ({
    id: source.id,
    url: source.url,
    href: safeHref(source.url, source.url),
    note: source.note,
    reply: replyTo(source),
  }));
}

/** A local reply: it goes to the end of the thread, lives as long as the panel stays open, and is never saved. */
export type ChatNotice =
  | { kind: "no_link" | "more_links" | "invalid_url" | "network" | "signed_out" }
  | { kind: "already_submitted"; postId: number | null };

/** What a route answered: its status and its JSON body (`{}` when the body isn't a JSON object). */
export type Answer = { status: number; body: Record<string, unknown> };

/** The chat's three calls: GET /api/sources/mine, POST /api/sources, POST /api/sources/[id]/retry. */
export type ChatTransport = {
  mine(): Promise<Answer>;
  submit(url: string, note: string | null): Promise<Answer>;
  retry(sourceId: number): Promise<Answer>;
};

async function call(path: string, init?: RequestInit): Promise<Answer> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body: body && typeof body === "object" ? (body as Record<string, unknown>) : {} };
}

export const httpTransport: ChatTransport = {
  mine: () => call("/api/sources/mine"),
  submit: (url, note) => call("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, note }) }),
  retry: (sourceId) => call(`/api/sources/${sourceId}/retry`, { method: "POST" }),
};

/**
 * The offline preview's stand-in (local dev points at the production project): the seed is the
 * thread, a submission joins it as pending, and "Újra" sends a failed one back to pending. Nothing
 * is ever processed. `fail` rejects every write the way an offline fetch does; reads still answer.
 */
export function memoryTransport(seed: MySource[], fail: boolean): ChatTransport {
  let sources = seed;
  let nextId = -1000;
  const write = async (change: () => Answer) => {
    if (fail) throw new TypeError("Failed to fetch");
    return change();
  };
  return {
    mine: async () => ({ status: 200, body: { sources } }),
    submit: (url, note) =>
      write(() => {
        const parsed = parseSubmittedUrl(url);
        if (!parsed) return { status: 400, body: { error: "invalid_url" } };
        const source: MySource = {
          id: nextId--,
          url: parsed.toString(),
          kind: detectSource(parsed),
          status: "pending",
          error: null,
          note,
          createdAt: new Date().toISOString(),
          post: null,
        };
        sources = [source, ...sources];
        return { status: 202, body: { ok: true, id: source.id } };
      }),
    retry: (sourceId) =>
      write(() => {
        sources = sources.map((source) => (source.id === sourceId ? { ...source, status: "pending", error: null } : source));
        return { status: 202, body: { ok: true } };
      }),
  };
}

export const POLL_MS = 4000;
// ponytail: a source stuck in `pending` (a run killed past maxDuration) would poll for as long as the
// panel stays open; 150 × 4 s (10 min) is twice the ingest's maxDuration, like RefreshWhileProcessing.
export const MAX_POLLS = 150;

export type ChatSnapshot = {
  /** Null until the first answer. */
  sources: MySource[] | null;
  notices: ChatNotice[];
  /** The last GET /api/sources/mine failed; the next good one clears it. */
  unreachable: boolean;
  sending: boolean;
  /** Sources whose "Újra" is on its way. */
  retrying: number[];
};

const INITIAL: ChatSnapshot = { sources: null, notices: [], unreachable: false, sending: false, retrying: [] };

/** A refused submission or retry, as the reply the thread shows. */
function noticeFor({ status, body }: Answer): ChatNotice {
  if (status === 401) return { kind: "signed_out" };
  if (status === 400 && body.error === "invalid_url") return { kind: "invalid_url" };
  if (status === 409 && body.error === "already_submitted") {
    return { kind: "already_submitted", postId: typeof body.postId === "number" ? body.postId : null };
  }
  return { kind: "network" };
}

/**
 * The live thread. `open()` loads it, then polls every POLL_MS while the panel stays open, the tab is
 * visible (`isVisible`) and a source is pending, at most MAX_POLLS times; a submission or a retry
 * loads it at once and restarts the count. `close()` stops the polling and drops the local replies.
 */
export function createLinkChat(transport: ChatTransport, isVisible: () => boolean) {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();
  let open = false;
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Only the newest load may land: an older one answering late would put back a status that has moved on.
  let latest = 0;

  const set = (patch: Partial<ChatSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const say = (notice: ChatNotice) => set({ notices: [...snapshot.notices, notice] });

  function schedule() {
    clearTimeout(timer);
    const pending = snapshot.sources?.some((source) => source.status === "pending");
    if (!open || !pending || polls >= MAX_POLLS) return;
    timer = setTimeout(() => {
      polls++;
      if (isVisible()) void load();
      else schedule();
    }, POLL_MS);
  }

  async function load() {
    const request = ++latest;
    let answer: Answer | null = null;
    try {
      answer = await transport.mine();
    } catch {
      // Offline: `answer` stays null, and the thread says it can't reach the list.
    }
    if (request !== latest) return;
    if (answer?.status === 200 && Array.isArray(answer.body.sources)) {
      set({ sources: answer.body.sources as MySource[], unreachable: false });
    } else if (answer?.status === 401) {
      if (!snapshot.notices.some((notice) => notice.kind === "signed_out")) say({ kind: "signed_out" });
    } else {
      set({ unreachable: true });
    }
    schedule();
  }

  async function reload() {
    polls = 0;
    await load();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    open() {
      open = true;
      void reload();
    },
    close() {
      open = false;
      clearTimeout(timer);
      latest++;
      set({ notices: [], unreachable: false });
    },
    /** True when the link went in, so the panel clears the field; on every other answer the text stays. */
    async send(text: string): Promise<boolean> {
      if (snapshot.sending) return false;
      const message = parseLinkMessage(text);
      if ("error" in message) {
        say({ kind: "no_link" });
        return false;
      }
      set({ sending: true });
      try {
        const answer = await transport.submit(message.url, message.note);
        if (answer.status !== 202) {
          say(noticeFor(answer));
          return false;
        }
        if (message.moreLinks) say({ kind: "more_links" });
        await reload();
        return true;
      } catch {
        say({ kind: "network" });
        return false;
      } finally {
        set({ sending: false });
      }
    },
    /** "Újra": one request per source at a time. A 409 means another click already started it. */
    async retry(sourceId: number): Promise<void> {
      if (snapshot.retrying.includes(sourceId)) return;
      set({ retrying: [...snapshot.retrying, sourceId] });
      try {
        const answer = await transport.retry(sourceId);
        if (answer.status === 202 || answer.status === 409) await reload();
        else say(noticeFor(answer));
      } catch {
        say({ kind: "network" });
      } finally {
        set({ retrying: snapshot.retrying.filter((id) => id !== sourceId) });
      }
    },
  };
}

export type LinkChat = ReturnType<typeof createLinkChat>;
```

- [ ] **Step 4: Egy fetcher route-onként** (`app/(app)/library/submit-form.tsx`)

Az importok közé, a `import { Input } from "@/components/ui/input";` sor után:

```ts
import { httpTransport } from "@/lib/link-chat";
```

A `postSource`:

```ts
async function postSource(url: string, note: string): Promise<SubmitResult> {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, note }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: response.ok, error: data.error };
}
```

helyett:

```ts
/** The link chat's own POST /api/sources call: one fetcher per route. */
async function postSource(url: string, note: string): Promise<SubmitResult> {
  const { status, body } = await httpTransport.submit(url, note);
  return { ok: status === 202, error: typeof body.error === "string" ? body.error : undefined };
}
```

(A route sikerre mindig 202-t ad, így az `ok` jelentése nem változik. Az üres megjegyzést a route továbbra is `null`-lá alakítja.)

- [ ] **Step 5: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/link-chat.test.ts`
Elvárt: `ℹ tests 19`, `ℹ pass 19`, kb. 150 ms (a 150 lépéses óra-teszttel együtt).

- [ ] **Step 6: Mutációs próba** (`lib/link-chat.ts`, a `lib/link-chat.test.ts`-szel). Egy teszt sem akadhat el: ha egy futás 60 s fölé nyúlik, az a teszt hibája, jelentsd.

| Mutáció | Elvárt bukás |
| --- | --- |
| a `close()`-ból a `clearTimeout(timer);` törlése | `…never after it closes` |
| `POLL_MS = 4000` → `5000` | ugyanaz |
| `if (!open \|\| !pending \|\| polls >= MAX_POLLS)` → `if (!open \|\| polls >= MAX_POLLS)` | `…polls only while a source is pending…` |
| `if (isVisible()) void load();` → `if (true) void load();` | ugyanaz |
| `if (!open \|\| !pending \|\| polls >= MAX_POLLS)` → `if (!open \|\| !pending)` | `polling stops after MAX_POLLS…` |
| a `reload()`-ból a `polls = 0;` törlése | ugyanaz |
| `if (request !== latest) return;` törlése | `an older load that answers late…` |
| `set({ sources: …, unreachable: false })` → `set({ sources: … })` | `a failed load says the list is out of reach…` |
| a `signed_out` őr törlése (`say({ kind: "signed_out" })` feltétel nélkül) | ugyanaz |
| `postId: typeof body.postId === "number" ? body.postId : null` → `postId: null` | `send: every refusal…` |
| a `send` `catch`-éből a `say({ kind: "network" })` törlése | ugyanaz |
| a `send`-ből az `await reload();` törlése | `send: no link, no request…`, `an older load…` |
| `if (message.moreLinks) say({ kind: "more_links" });` törlése | `send: no link, no request…` |
| `if (snapshot.sending) return false;` törlése | `send: a second send while the first is on its way…` |
| `if (snapshot.retrying.includes(sourceId)) return;` törlése | `retry: a second click…` |
| `answer.status === 202 \|\| answer.status === 409` → `answer.status === 202` | ugyanaz |
| a `retry` `catch`-éből a `say({ kind: "network" })` törlése | `retry: offline or refused…` |
| a `finally`-ból a `retrying` nullázása törlése | `retry: a second click…`, `retry: offline or refused…` |
| a `close()`-ban `set({ notices: [], unreachable: false })` → `set({ unreachable: false })` | `closing the panel drops the local replies` |
| `[...sources].reverse().map` → `[...sources].map` | `toThread lists the oldest first…` |
| `href: safeHref(source.url, source.url)` → `href: source.url` | ugyanaz |
| a `memoryTransport`-ból az `if (fail) throw …` törlése | `memoryTransport: …` |
| a `no_link` válasz törlése (`if ("error" in message) return false;`) | `send: no link, no request…` |

- [ ] **Step 7: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run dup`
Elvárt: mind zöld, `ℹ tests 528`, `Found 0 clones.` (A `wait` és az `opened` segéd nélkül a jscpd az óra-tesztek elejét klónnak látná.)

- [ ] **Step 8: Commit**

```bash
git add lib/link-chat.ts lib/link-chat.test.ts "app/(app)/library/submit-form.tsx"
git commit -m "feat: add the link chat's live thread logic"
```

---

### Task 6: A szál felülete: közös forrástípus-nevek, taiyaki-ikon, `ChatThread`, előnézeti minták

**Files:**
- Create: `lib/source-kinds.ts`
- Modify: `app/(app)/library/[id]/post-article.tsx` (a jelvény a közös listából)
- Create: `app/components/taiyaki-icon.tsx`, `app/components/chat-thread.tsx`, `app/components/chat-thread.test.ts`
- Modify: `lib/fixtures.ts`, `lib/fixtures.test.ts`

**Interfaces:**
- Consumes: `toThread`, `ChatEntry`, `ChatNotice`, `ChatSnapshot` (5. feladat); `MySource` (2. feladat); `LONG_URL`, `LONG_WORD` (`lib/fixtures.ts`).
- Produces:
  - `export const SOURCE_KIND_LABELS: Record<SourceKind, Localized>`
  - `export function TaiyakiIcon({ className }: { className?: string })`: `viewBox="0 0 64 64"`, `aria-hidden`
  - `export function ChatThread(props: { language: Language; loginHref: string; onRetry: (sourceId: number) => void; onOpenPost?: () => void; snapshot: Pick<ChatSnapshot, "sources" | "notices" | "unreachable" | "retrying"> })`
  - `export const previewMySources: MySource[]`: három minta, negatív id-kkel, mindhárom állapotban.

- [ ] **Step 1: A tesztek**

`app/components/chat-thread.test.ts` (új):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { previewMySources } from "../../lib/fixtures.ts";
import type { ChatNotice } from "../../lib/link-chat.ts";
import { render } from "../../lib/test/render.ts";

const { ChatThread } = await import("./chat-thread.tsx");
const { TaiyakiIcon } = await import("./taiyaki-icon.tsx");

type Snapshot = ComponentProps<typeof ChatThread>["snapshot"];

/** The thread on the preview's three submissions, in Hungarian unless `language` says otherwise. */
const thread = (snapshot: Partial<Snapshot> = {}, language: "hu" | "en" = "hu") =>
  render(
    createElement(ChatThread, {
      language,
      loginHref: "/login?next=%2Flibrary",
      onRetry: () => {},
      snapshot: { sources: previewMySources, notices: [], unreachable: false, retrying: [], ...snapshot },
    }),
  );

const items = (doc: Document) => [...doc.querySelectorAll("ol > li")].map((item) => item.textContent ?? "");

// Kills the kind's name read from anywhere but SOURCE_KIND_LABELS (the reply would say "arxiv"), a
// reply that ignores the status, and a post link to anything but /library/<postId>.
test("the thread greets first, then shows each submission oldest first with the reply its state calls for", () => {
  const doc = thread();
  const [greeting, done, failed, pending] = items(doc);
  assert.equal(items(doc).length, 1 + previewMySources.length);
  assert.match(greeting, /Dobj be egy linket!/);
  assert.match(done, /KÉSZ · MEGNYITÁS →/);
  assert.match(failed, /Nem sikerült feldolgozni\.fetch 404: /);
  assert.match(pending, /Megkaptam, arXiv-tanulmány\.FELDOLGOZÁS…/);
  assert.equal(doc.querySelector('a[href="/library/-1"]')?.textContent, "KÉSZ · MEGNYITÁS →");
  assert.match(items(thread({}, "en"))[3], /Got it: arXiv paper\.PROCESSING…/);
});

// Kills `disabled={retrying}`: a second click on "Újra" while the first is on its way.
test("a failed submission's ÚJRA button is disabled while its retry is on its way", () => {
  const retryButton = (retrying: number[]) => thread({ retrying }).querySelector("button")?.hasAttribute("disabled");
  assert.equal(retryButton([]), false);
  assert.equal(retryButton([-12]), true);
});

// Kills the reader's link rendered from the raw URL: a javascript: link would become clickable.
test("the reader's link opens in a new tab only when it is http(s); anything else stays text", () => {
  const doc = thread({ sources: [{ ...previewMySources[0], url: "javascript:alert(1)" }, previewMySources[1]] });
  const links = [...doc.querySelectorAll('a[target="_blank"]')];
  assert.deepEqual(links.map((link) => [link.getAttribute("href"), link.getAttribute("rel")]), [[previewMySources[1].url, "noreferrer"]]);
  assert.match(items(doc)[2], /javascript:alert\(1\)/);
});

// Kills a local reply with no text (a silent failure), the 409's post link shown without a post (or
// missing with one), and a sign-in link that loses the page to come back to.
test("every local reply says what happened, with the post link and the sign-in link where they belong", () => {
  const notices: ChatNotice[] = [
    { kind: "no_link" },
    { kind: "more_links" },
    { kind: "invalid_url" },
    { kind: "already_submitted", postId: 9 },
    { kind: "already_submitted", postId: null },
    { kind: "signed_out" },
    { kind: "network" },
  ];
  const doc = thread({ sources: [], notices, unreachable: true });
  assert.deepEqual(items(doc).slice(1), [
    "Egyelőre csak linket tudok fogadni.",
    "Egyszerre egy linket tudok fogadni, az elsőt küldtem be.",
    "Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.",
    "Ezt már beküldte valaki.MEGNYITÁS →",
    "Ezt már beküldte valaki.",
    "Lejárt a belépésed.BELÉPÉS →",
    "Nem ment át, próbáld újra.",
    "Most nem érem el a beküldéseidet.",
  ]);
  assert.equal(doc.querySelectorAll('a[href^="/library/"]').length, 1);
  assert.equal(doc.querySelector('a[href="/library/9"]')?.textContent, "MEGNYITÁS →");
  assert.equal(doc.querySelector('a[href="/login?next=%2Flibrary"]')?.textContent, "BELÉPÉS →");
});

// Kills the live region dropped: a screen reader would never hear a reply arrive.
test("the thread is a polite live region, and the taiyaki inside it is decorative", () => {
  const doc = thread();
  assert.equal(doc.querySelector("ol")?.getAttribute("aria-live"), "polite");
  const icon = render(createElement(TaiyakiIcon, { className: "size-6" })).querySelector("svg");
  assert.deepEqual([icon?.getAttribute("aria-hidden"), icon?.getAttribute("viewBox")], ["true", "0 0 64 64"]);
});
```

`lib/fixtures.test.ts`: az import sora

```ts
import { previewItems, previewPosts } from "./fixtures.ts";
```

helyett:

```ts
import { previewItems, previewMySources, previewPosts } from "./fixtures.ts";
```

A fájl végére:

```ts

// Kills a positive fixture id (a preview click could then reach a real source), and a state missing
// from the preview's thread.
test("the preview chat's sources have negative ids and show all three states", () => {
  for (const source of previewMySources) assert.equal(parseId(String(source.id)), null, `source ${source.id}`);
  assert.deepEqual(new Set(previewMySources.map(({ status }) => status)), new Set(["pending", "done", "failed"]));
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/chat-thread.test.ts lib/fixtures.test.ts`
Elvárt: mindkét fájl betöltése bukik:
- `SyntaxError: The requested module '../../lib/fixtures.ts' does not provide an export named 'previewMySources'`;
- ugyanez a `./fixtures.ts`-re.

- [ ] **Step 3: A közös forrástípus-nevek**

`lib/source-kinds.ts` (új):

```ts
import type { Localized } from "../data/digest-types.ts";
import type { SourceKind } from "./pipeline/util.ts";

/** Each source kind's name: the post page's badge (upper-cased there) and the link chat's replies. */
export const SOURCE_KIND_LABELS: Record<SourceKind, Localized> = {
  article: { hu: "cikk", en: "article" },
  youtube: { hu: "YouTube-videó", en: "YouTube video" },
  arxiv: { hu: "arXiv-tanulmány", en: "arXiv paper" },
  github: { hu: "GitHub-repó", en: "GitHub repo" },
  x: { hu: "X-poszt", en: "X post" },
  pdf: { hu: "PDF", en: "PDF" },
};
```

`app/(app)/library/[id]/post-article.tsx`: az importok közé, a `import { readMinutes, type Post, type PostQuery } from "@/lib/post-view";` sor után:

```ts
import { SOURCE_KIND_LABELS } from "@/lib/source-kinds";
```

A `copy`:

```ts
// Only the two strings the page used to hard-code; the rest of its text is `notices` (post-notices.tsx).
const copy = {
  hu: {
    keyPoints: "KULCSPONTOK",
    kind: { article: "CIKK", youtube: "VIDEÓ", arxiv: "TANULMÁNY", github: "REPO", x: "POSZT", pdf: "PDF" },
  },
  en: {
    keyPoints: "KEY POINTS",
    kind: { article: "ARTICLE", youtube: "VIDEO", arxiv: "PAPER", github: "REPO", x: "POST", pdf: "PDF" },
  },
};
```

helyett:

```ts
// The page's own string; the rest of its text is `notices` (post-notices.tsx), and the kind badge is
// SOURCE_KIND_LABELS (lib/source-kinds.ts), shared with the link chat.
const copy = {
  hu: { keyPoints: "KULCSPONTOK" },
  en: { keyPoints: "KEY POINTS" },
};
```

A jelvény:

```tsx
            <span className="border border-signal px-2 py-0.5">{labels.kind[post.kind]}</span>
```

helyett:

```tsx
            <span className="border border-signal px-2 py-0.5 uppercase">{SOURCE_KIND_LABELS[post.kind][language]}</span>
```

(A `labels.keyPoints` marad, az M2 terv erre a névre hivatkozik.)

- [ ] **Step 4: Az ikon** (`app/components/taiyaki-icon.tsx`, új)

```tsx
// The taiyaki, variant A "Klasszikus" (.superpowers/brainstorm/4489-1790347439/content/taiyaki-icon.html,
// #ty-a): an original drawing in the house style, not taken from any album art. Signal-orange body, ink
// outline and scales, a hard ink shadow offset 3 3 with no blur. Decorative: the button names it.

const BODY =
  "M6 33 C6 21 18 14 32 15 C38 15.5 42 18 45 21 L56 13 C58 12 60 13 59 16 L55 32 L59 48 C60 51 58 52 56 51 L45 43 C42 46 38 48.5 32 49 C18 50 6 44 6 33 Z";
const FINS = "M20 17 Q27 6 39 12 L37 17 Z M22 47 Q27 56 35 52 L33 48 Z";
const MARKS =
  "M22 22 Q27 32 22 42 M29 25 q3 3 6 0 M36 25 q3 3 6 0 M31 31 q3 3 6 0 M38 31 q3 3 6 0 M29 37 q3 3 6 0 M36 37 q3 3 6 0 M47 25 L53 21 M48 32 L54 32 M47 39 L53 43 M7 36 Q10 38.5 13 36";

export function TaiyakiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <g transform="translate(3 3)" className="fill-ink">
        <path d={FINS} />
        <path d={BODY} />
      </g>
      <g className="fill-signal stroke-ink" strokeWidth={2.5} strokeLinejoin="round">
        <path d={FINS} />
        <path d={BODY} />
      </g>
      <path d={MARKS} className="fill-none stroke-ink" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={15} cy={28} r={3.4} className="fill-ink" />
      <circle cx={16.2} cy={26.9} r={1.1} className="fill-paper" />
    </svg>
  );
}
```

(Ha a brainstorm-fájl hiányzik: a rajz a spec és a `decisions.md` leírása szerint ugyanez. 64×64-es viewBox, signal-narancs test 2.5-ös ink kontúrral, ink pikkely- és kopoltyúvonalak 1.8-assal, ink szem paper csillanással, 3 3-as ink árnyék.)

- [ ] **Step 5: A szál** (`app/components/chat-thread.tsx`, új)

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import { toThread, type ChatEntry, type ChatNotice, type ChatSnapshot } from "@/lib/link-chat";
import { SOURCE_KIND_LABELS } from "@/lib/source-kinds";
import { TaiyakiIcon } from "./taiyaki-icon";

const copy = {
  hu: {
    greeting: "Dobj be egy linket! Ha akarod, írd mellé, mire figyeljek.",
    received: "Megkaptam,",
    processing: "FELDOLGOZÁS…",
    done: "KÉSZ · MEGNYITÁS →",
    failed: "Nem sikerült feldolgozni.",
    retry: "ÚJRA",
    open: "MEGNYITÁS →",
    no_link: "Egyelőre csak linket tudok fogadni.",
    more_links: "Egyszerre egy linket tudok fogadni, az elsőt küldtem be.",
    invalid_url: "Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.",
    already_submitted: "Ezt már beküldte valaki.",
    signed_out: "Lejárt a belépésed.",
    signIn: "BELÉPÉS →",
    network: "Nem ment át, próbáld újra.",
    unreachable: "Most nem érem el a beküldéseidet.",
  },
  en: {
    greeting: "Drop in a link! If you like, add what I should look out for.",
    received: "Got it:",
    processing: "PROCESSING…",
    done: "DONE · OPEN →",
    failed: "I couldn't process it.",
    retry: "RETRY",
    open: "OPEN →",
    no_link: "For now I can only take links.",
    more_links: "I take one link at a time, so I sent in the first one.",
    invalid_url: "I can't open that: I only take public http(s) links.",
    already_submitted: "Someone already sent this in.",
    signed_out: "Your sign-in has expired.",
    signIn: "SIGN IN →",
    network: "That didn't go through, try again.",
    unreachable: "I can't reach your submissions right now.",
  },
};

const bubble = "max-w-[85%] border-2 border-ink px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]";
const action = "focus-ring inline-flex min-h-10 items-center font-mono text-[11px] tracking-[0.14em] text-signal hover:underline";

function Taiyaki({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <TaiyakiIcon className="mt-1 size-7 shrink-0" />
      <div className={`${bubble} bg-paper shadow-[3px_3px_0_var(--ink)]`}>{children}</div>
    </div>
  );
}

function Mine({ entry }: { entry: ChatEntry }) {
  return (
    <div className={`${bubble} ml-auto w-fit bg-ink text-paper shadow-[3px_3px_0_var(--signal)]`}>
      {entry.href ? (
        <a href={entry.href} target="_blank" rel="noreferrer" className="focus-ring underline">
          {entry.url}
        </a>
      ) : (
        entry.url
      )}
      {entry.note && <p className="mt-1 text-paper/70">{entry.note}</p>}
    </div>
  );
}

type ThreadActions = {
  language: Language;
  /** `/login?next=<this page>`, for the "signed out" reply. */
  loginHref: string;
  onRetry: (sourceId: number) => void;
  /** Runs when a post link is followed: the mobile sheet closes itself with it. */
  onOpenPost?: () => void;
};

function Reply({ entry, retrying, language, onRetry, onOpenPost }: ThreadActions & { entry: ChatEntry; retrying: boolean }) {
  const t = copy[language];
  const { reply } = entry;
  if (reply.state === "pending") {
    return (
      <>
        <p>
          {t.received} <em>{SOURCE_KIND_LABELS[reply.kind][language]}</em>.
        </p>
        <p className="mt-1 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-signal">
          <span className="live-pulse shrink-0" />
          {t.processing}
        </p>
      </>
    );
  }
  if (reply.state === "done") {
    return (
      <>
        <p className="font-bold">{reply.title[language]}</p>
        <Link href={`/library/${reply.postId}`} onClick={onOpenPost} className={action}>
          {t.done}
        </Link>
      </>
    );
  }
  return (
    <>
      <p>{t.failed}</p>
      {reply.error && <p className="mt-1 font-mono text-[11px] leading-4 text-ink/70">{reply.error}</p>}
      <Button variant="signal" className="mt-2 min-h-10" disabled={retrying} onClick={() => onRetry(entry.id)}>
        {t.retry}
      </Button>
    </>
  );
}

function NoticeText({ notice, language, loginHref, onOpenPost }: ThreadActions & { notice: ChatNotice }) {
  const t = copy[language];
  if (notice.kind === "already_submitted") {
    return (
      <>
        <p>{t.already_submitted}</p>
        {notice.postId !== null && (
          <Link href={`/library/${notice.postId}`} onClick={onOpenPost} className={action}>
            {t.open}
          </Link>
        )}
      </>
    );
  }
  if (notice.kind === "signed_out") {
    return (
      <>
        <p>{t.signed_out}</p>
        <a href={loginHref} className={action}>
          {t.signIn}
        </a>
      </>
    );
  }
  return <p>{t[notice.kind]}</p>;
}

/** The thread: the greeting, the reader's own submissions (oldest first) with the taiyaki's replies, then the local replies. */
export function ChatThread({ snapshot, ...actions }: ThreadActions & { snapshot: Pick<ChatSnapshot, "sources" | "notices" | "unreachable" | "retrying"> }) {
  const t = copy[actions.language];
  return (
    <ol aria-live="polite" className="space-y-4">
      <li>
        <Taiyaki>
          <p>{t.greeting}</p>
        </Taiyaki>
      </li>
      {toThread(snapshot.sources ?? []).map((entry) => (
        <li key={entry.id} className="space-y-2">
          <Mine entry={entry} />
          <Taiyaki>
            <Reply entry={entry} retrying={snapshot.retrying.includes(entry.id)} {...actions} />
          </Taiyaki>
        </li>
      ))}
      {snapshot.notices.map((notice, index) => (
        // Append-only while the panel is open, so the position is a stable key.
        <li key={index}>
          <Taiyaki>
            <NoticeText notice={notice} {...actions} />
          </Taiyaki>
        </li>
      ))}
      {snapshot.unreachable && (
        <li>
          <Taiyaki>
            <p>{t.unreachable}</p>
          </Taiyaki>
        </li>
      )}
    </ol>
  );
}
```

(A narancs pont a meglévő `.live-pulse`, a ház „élő” pöttye. A szál a saját `max-h`-s görgetőjében fut, ezt a 7. feladat adja.)

- [ ] **Step 6: Az előnézeti minták** (`lib/fixtures.ts`)

Az importok közé, a `import type { SubmittedSource } from "./content.ts";` sor után:

```ts
import type { MySource } from "./my-sources.ts";
```

A fájl végére:

```ts

/** The link chat's thread, newest first as GET /api/sources/mine answers it: one submission in each
 *  state, a long link and a long note. Negative ids, like the posts: the retry route 404s them, and
 *  the done one opens preview post -1's real page, which 404s too. */
export const previewMySources: MySource[] = [
  { id: -11, url: "https://arxiv.org/abs/2609.01234", kind: "arxiv", status: "pending", error: null, note: "A módszertan-részre figyelj.", createdAt: "2026-09-24T09:00:00Z", post: null },
  { id: -12, url: LONG_URL, kind: "article", status: "failed", error: `fetch 404: ${LONG_URL}`, note: null, createdAt: "2026-09-24T08:00:00Z", post: null },
  {
    id: -13,
    url: "https://example.test/posts/-1",
    kind: "article",
    status: "done",
    error: null,
    note: `Hosszú megjegyzés: ${LONG_WORD}`,
    createdAt: "2026-09-23T08:00:00Z",
    post: { id: -1, title: { hu: LONG_WORD, en: LONG_WORD } },
  },
];
```

- [ ] **Step 7: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/chat-thread.test.ts lib/fixtures.test.ts`
Elvárt: `ℹ tests 11`, `ℹ fail 0`.

- [ ] **Step 8: Mutációs próba** (`app/components/chat-thread.tsx`, a `app/components/chat-thread.test.ts`-szel; az utolsó sor a `lib/fixtures.test.ts`-szel)

| Mutáció | Elvárt bukás |
| --- | --- |
| `<em>{SOURCE_KIND_LABELS[reply.kind][language]}</em>` → `<em>{reply.kind}</em>` | `the thread greets first…` |
| `disabled={retrying}` → `disabled={false}` | `a failed submission's ÚJRA button is disabled…` |
| a `Mine`-ban `entry.href ? (<a href={entry.href}` → `entry.url ? (<a href={entry.url}` | `the reader's link opens in a new tab only when it is http(s)…` |
| `<ol aria-live="polite" className="space-y-4">` → `<ol className="space-y-4">` | `the thread is a polite live region…` |
| `{notice.postId !== null && (` → `{(` | `every local reply says what happened…` |
| `<a href={loginHref} className={action}>` → `<a href="/login" className={action}>` | ugyanaz |
| `` `/library/${reply.postId}` `` → `` `/library/${entry.id}` `` | `the thread greets first…` |
| `{snapshot.unreachable && (` → `{false && (` | `every local reply…` |
| `return <p>{t[notice.kind]}</p>;` → `return <p />;` | ugyanaz |
| a `-11` id → `11` (`lib/fixtures.ts`) | `the preview chat's sources have negative ids…` |

- [ ] **Step 9: Ellenőrzés és futásidejű próba**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: mind zöld, `ℹ tests 534`, `Found 0 clones.`

Futásidejű próba: `npm run dev` a háttérben, amikor kiírja a `Ready`-t:

```bash
for view in radar radar-empty library library-empty archive archive-empty; do
  for fail in "" "&fail=1"; do
    url="http://localhost:3000/dev/preview?view=$view$fail"
    echo "$(curl -s -o /dev/null -w '%{http_code}' "$url") $view$fail $(curl -s "$url" | grep -c -E 'Too many re-renders|Unhandled Runtime Error|Application error')"
  done
done
url=http://localhost:3000/dev/preview/post
echo "$(curl -s -o /dev/null -w '%{http_code}' "$url") post $(curl -s "$url" | grep -c -E 'Too many re-renders|Unhandled Runtime Error|Application error')"
```

Elvárt: minden sor `200 <nézet> 0`.

Playwright (MCP, `npm run dev` mellett): `http://localhost:3000/dev/preview/post`, 360×740 és 1280×800.

```js
() => ({
  badges: [...document.querySelectorAll("article header p > span:first-child")].map((span) => span.innerText),
  scroll: [document.documentElement.scrollWidth, window.innerWidth],
})
```

Elvárt: `badges` = `["CIKK", "CIKK", "CIKK", "X-POSZT", "YOUTUBE-VIDEÓ"]` (magyar nyelven; angolul `ARTICLE`, `X POST`, `YOUTUBE VIDEO`), és `scroll[0] <= scroll[1]`.

- [ ] **Step 10: Commit**

```bash
git add lib/source-kinds.ts "app/(app)/library/[id]/post-article.tsx" app/components/taiyaki-icon.tsx app/components/chat-thread.tsx app/components/chat-thread.test.ts lib/fixtures.ts lib/fixtures.test.ts
git commit -m "feat: render the link chat thread with shared source kind names"
```

---

### Task 7: A panel, az asztali taiyaki és a lift, a visszavonás-csík sávja, az előnézet bekötése

**Files:**
- Create: `app/components/link-chat.tsx`
- Modify: `app/globals.css` (`.lift`)
- Modify: `app/components/app-shell.tsx` (nyitott állapot, asztali gomb, `LinkChat`, `chatPreview`)
- Modify: `app/components/undo-toast.tsx` (`md:right-24`)
- Modify: `app/dev/preview/page.tsx`, `app/dev/preview/post/page.tsx`
- Test: `app/components/shell.test.ts`

**Interfaces:**
- Consumes: `createLinkChat`, `httpTransport`, `memoryTransport` (5. feladat); `ChatThread`, `TaiyakiIcon`, `previewMySources` (6. feladat); `Sheet`, `SheetContent` (`closeLabel`), `SheetHeader`, `SheetTitle`; `Textarea`; `Button` (`signal`, `icon-lg`); `useIsMobile`; `isUndoToast`; `useLanguage`.
- Produces:
  - `export const CHAT_PANEL_ID = "taiyaki-panel"`
  - `export type ChatPreview = { sources: MySource[]; failWrites: boolean }`
  - `export function TaiyakiButton({ open, onClick, className }: { open: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; className: string })`: a hívó adja a helyét, a méretét és a nyugalmi árnyékát. A `focus-ring lift` a sajátja.
  - `export function LinkChat({ open, onOpenChange, opener, preview }: { open: boolean; onOpenChange: (open: boolean) => void; opener: RefObject<HTMLButtonElement | null>; preview?: ChatPreview })`
  - `AppShell` új propja: `chatPreview?: ChatPreview`.
  - A `.lift` osztály (`app/globals.css`).

- [ ] **Step 1: A tesztek** (`app/components/shell.test.ts`)

Az importban a `previewItems,` sor után:

```ts
  previewMySources,
```

A `const { ArchiveView } = await import("../(app)/archive/archive-view.tsx");` sor után:

```ts
const { CHAT_PANEL_ID, LinkChat, TaiyakiButton } = await import("./link-chat.tsx");
```

A fájl végére:

```ts

// Kills a taiyaki that doesn't say which panel it opens, whether it is open, or what it does in the
// reader's language.
test("TaiyakiButton names itself in the reader's language, and says which panel it opens and whether it is open", () => {
  const button = (language: "hu" | "en", open: boolean) => {
    const element = render(
      createElement(LanguageProvider, { initial: language } as ComponentProps<typeof LanguageProvider>, createElement(TaiyakiButton, { open, onClick: noop, className: "grid" })),
    ).querySelector("button");
    return [element?.getAttribute("aria-label"), element?.getAttribute("aria-expanded"), element?.getAttribute("aria-controls")];
  };
  assert.deepEqual(button("hu", false), ["Link bedobása", "false", CHAT_PANEL_ID]);
  assert.deepEqual(button("en", true), ["Drop a link", "true", CHAT_PANEL_ID]);
});

// Kills the corner button left out of the shell. The panel itself is portalled (null in this harness),
// so a closed chat leaves no panel in the page and an open one must render without a render loop.
test("AppShell carries the taiyaki, and the link chat renders open or closed", () => {
  const doc = render(
    createElement(AppShell, { language: "hu", email: "reader@example.test", initialNavMode: "full" } as ComponentProps<typeof AppShell>, createElement("p", null, "Child")),
  );
  assert.equal(doc.querySelectorAll(`button[aria-controls="${CHAT_PANEL_ID}"]`).length, 1);
  assert.equal(doc.getElementById(CHAT_PANEL_ID), null);
  for (const open of [false, true]) {
    withLanguage(LinkChat, { open, onOpenChange: noop, opener: { current: null }, preview: { sources: previewMySources, failWrites: false } });
  }
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts`
Elvárt: a fájl betöltése `ERR_MODULE_NOT_FOUND`-dal bukik (`./link-chat.tsx`).

- [ ] **Step 3: A gomb és a panel** (`app/components/link-chat.tsx`, új)

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type RefObject } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLinkChat, httpTransport, memoryTransport } from "@/lib/link-chat";
import type { MySource } from "@/lib/my-sources";
import { ChatThread } from "./chat-thread";
import { useLanguage } from "./language-context";
import { TaiyakiIcon } from "./taiyaki-icon";
import { isUndoToast } from "./undo-toast";

const copy = {
  hu: {
    open: "Link bedobása",
    title: "TAIYAKI · LINK BEDOBÁSA",
    close: "Bezárás",
    input: "Link és megjegyzés",
    placeholder: "https://… és ha kell, egy megjegyzés",
    send: "Küldés",
  },
  en: {
    open: "Drop a link",
    title: "TAIYAKI · DROP A LINK",
    close: "Close",
    input: "Link and note",
    placeholder: "https://… and a note, if you like",
    send: "Send",
  },
};

/** The panel's id, for both buttons' aria-controls. */
export const CHAT_PANEL_ID = "taiyaki-panel";

/** The offline preview (app/dev/preview): the thread's fixtures and the fail=1 switch; nothing is sent. */
export type ChatPreview = { sources: MySource[]; failWrites: boolean };

/** The taiyaki that opens the panel: the desktop corner button and the mobile bar's centre slot. The caller
 *  places it and sets its resting shadow; `lift` (globals.css) brings it forward on hover and keyboard focus. */
export function TaiyakiButton({ open, onClick, className }: { open: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; className: string }) {
  const { language } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copy[language].open}
      aria-expanded={open}
      aria-controls={CHAT_PANEL_ID}
      className={`focus-ring lift place-items-center border-2 border-ink bg-paper ${className}`}
    >
      <TaiyakiIcon className="size-10" />
    </button>
  );
}

/**
 * The link chat. Desktop: a non-modal panel above the corner button; only Esc and its close button
 * close it, so a link can be copied from the page behind. Mobile: a bottom Sheet. Focus goes to the
 * field on open and back to `opener` on close.
 */
export function LinkChat({ open, onOpenChange, opener, preview }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened the panel. */
  opener: RefObject<HTMLButtonElement | null>;
  preview?: ChatPreview;
}) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [chat] = useState(() =>
    createLinkChat(preview ? memoryTransport(preview.sources, preview.failWrites) : httpTransport, () => document.visibilityState === "visible"),
  );
  const snapshot = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const t = copy[language];
  const lines = (snapshot.sources?.length ?? 0) + snapshot.notices.length + Number(snapshot.unreachable);

  useEffect(() => {
    if (!open) return;
    chat.open();
    return () => chat.close();
  }, [open, chat]);

  useEffect(() => {
    // `scroll-smooth` glides to the new message; globals.css makes it a jump under prefers-reduced-motion.
    const thread = scroller.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [lines, open]);

  async function send() {
    if (await chat.send(text)) setText("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={isMobile}>
      <SheetContent
        id={CHAT_PANEL_ID}
        side="bottom"
        closeLabel={t.close}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
        onInteractOutside={(event) => {
          if (!isMobile || isUndoToast(event.target)) event.preventDefault();
        }}
        className="max-h-[75dvh] gap-0 border-t-2 border-ink bg-cream p-0 text-ink shadow-none md:inset-x-auto md:right-6 md:bottom-24 md:max-h-[70dvh] md:w-[360px] md:border-2 md:shadow-[6px_6px_0_var(--ink)]"
      >
        <SheetHeader className="flex-row items-center gap-2 bg-ink py-3 pr-14 pl-4">
          <TaiyakiIcon className="size-6 shrink-0" />
          <SheetTitle className="font-mono text-xs tracking-[0.14em] text-paper">{t.title}</SheetTitle>
        </SheetHeader>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-4">
          <ChatThread
            language={language}
            snapshot={snapshot}
            loginHref={`/login?next=${encodeURIComponent(pathname)}`}
            onRetry={(sourceId) => void chat.retry(sourceId)}
            onOpenPost={isMobile ? () => onOpenChange(false) : undefined}
          />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t-2 border-ink bg-paper p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] md:pb-3"
        >
          <Textarea
            ref={input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a new line; an IME's Enter only confirms the word.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            // Read-only, not disabled, while sending: a disabled field would drop the focus.
            readOnly={snapshot.sending}
            aria-disabled={snapshot.sending}
            rows={1}
            aria-label={t.input}
            placeholder={t.placeholder}
            className="max-h-[30dvh] min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-2 border-ink bg-cream text-base focus-visible:border-signal focus-visible:ring-0"
          />
          <Button type="submit" variant="signal" size="icon-lg" disabled={snapshot.sending} aria-label={t.send}>
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

Megjegyzések a végrehajtónak:
- A `SheetContent` beépített bezáró gombja (`absolute top-2 right-2`, 40 px) az ink fejléc jobb szélén ül, ezért kapott a fejléc `pr-14`-et.
- A `side="bottom"` mobilon teljes szélességű alsó Sheet. Az `md:` osztályok ugyanezt az elemet 360 px-es, a gomb fölé (`md:bottom-24` = 24 + 56 + 16 px) emelt panellé teszik.
- A `modal={isMobile}` csak zárt állapotban vált, a nyitás kattintásra jön.
- A `useEffect` csak a store-t hívja, React-állapotot nem állít, így a `react-hooks/set-state-in-effect` szabály nem sérül.

- [ ] **Step 4: A `.lift`** (`app/globals.css`)

Ez a sor:

```css
.must-card { box-shadow: 5px 5px 0 var(--ink); transition: transform 160ms ease, box-shadow 160ms ease; }
```

helyett:

```css
/* .lift: the Top 3 cards' "come forward" state, shared with the taiyaki button (link-chat.tsx), which
   also lifts on keyboard focus. Each keeps its own resting shadow. */
.must-card, .lift { transition: transform 160ms ease, box-shadow 160ms ease; }
.must-card { box-shadow: 5px 5px 0 var(--ink); }
```

A `@media (hover: hover)` blokkban ez:

```css
  .must-card:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 var(--signal); }
```

helyett:

```css
  .must-card:hover, .lift:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 var(--signal); }
```

A `.story-read { opacity: 0.58; }` sor elé:

```css
.lift:focus-visible { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 var(--signal); }
```

A `@media (prefers-reduced-motion: reduce)` blokkban, a meglévő `*, *::before, *::after { … }` sor után:

```css
  /* The taiyaki's shadow still lifts; it just doesn't move. */
  .lift:hover, .lift:focus-visible { transform: none; }
```

(A `globals.css` szabályai rétegen kívül vannak, így a `.lift:hover` árnyéka a Tailwind `shadow-[…]` nyugalmi osztályát felülírja. A kártyák szabálya nem változik.)

- [ ] **Step 5: A keret** (`app/components/app-shell.tsx`)

Az importok:

```ts
import { useState, type ReactNode } from "react";
```

helyett:

```ts
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
```

és a `import { LanguageToggle } from "./language-toggle";` sor után:

```ts
import { LinkChat, TaiyakiButton, type ChatPreview } from "./link-chat";
```

Az `AppShell` fejléce:

```tsx
/** Every signed-in page: the desktop nav or the mobile bottom bar around the page, plus the shell-wide dialogs. */
export function AppShell({
  language,
  email,
  initialNavMode,
  children,
}: {
  language: Language;
  email: string;
  initialNavMode: NavMode;
  children: ReactNode;
}) {
```

helyett:

```tsx
/** Every signed-in page: the desktop nav or the mobile bottom bar around the page, the link chat, plus the shell-wide dialogs. */
export function AppShell({
  language,
  email,
  initialNavMode,
  chatPreview,
  children,
}: {
  language: Language;
  email: string;
  initialNavMode: NavMode;
  /** The offline preview's link chat: fixtures, no network. */
  chatPreview?: ChatPreview;
  children: ReactNode;
}) {
```

A `const [navMode, setNavMode] = useState<NavMode>(initialNavMode);` sor után:

```tsx
  const [chatOpen, setChatOpen] = useState(false);
  // Whichever taiyaki opened the panel gets the focus back when it closes.
  const chatOpener = useRef<HTMLButtonElement>(null);
  const toggleChat = (event: MouseEvent<HTMLButtonElement>) => {
    chatOpener.current = event.currentTarget;
    setChatOpen(!chatOpen);
  };
```

A `<MobileNav email={email} onSearch={openSearch} />` sor után:

```tsx
      <TaiyakiButton
        open={chatOpen}
        onClick={toggleChat}
        className="fixed right-6 bottom-6 z-40 hidden size-14 shadow-[4px_4px_0_var(--ink)] md:grid"
      />
      {/* Keyed so the preview's fail=1 switch gets a fresh in-memory transport. */}
      <LinkChat key={String(chatPreview?.failWrites)} open={chatOpen} onOpenChange={setChatOpen} opener={chatOpener} preview={chatPreview} />
```

(A `z-40` a visszavonás-csík `z-[60]`-a és a Sheet `z-50`-e alatt marad, a spec szerint.)

- [ ] **Step 6: A csík sávja asztalon** (`app/components/undo-toast.tsx`)

A doc-komment:

```ts
/** Mounted once by the app shell, above the mobile bottom bar and above any open panel. */
```

helyett:

```ts
/** Mounted once by the app shell, above the mobile bottom bar and above any open panel. From md up its
 *  lane stops short of the taiyaki's corner (`md:right-24`: the button is 24 px in and 56 px wide). */
```

A sáv osztálylistájában `md:bottom-6` → `md:right-24 md:bottom-6`:

```tsx
      className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-[60] flex justify-center md:right-24 md:bottom-6"
```

- [ ] **Step 7: Az előnézet**

`app/dev/preview/page.tsx`: a fixture-importban a `previewItems,` sor után `previewMySources,`. Az `AppShell`:

```tsx
    <AppShell language={language} email={previewEmail} initialNavMode={navMode}>
```

helyett:

```tsx
    <AppShell language={language} email={previewEmail} initialNavMode={navMode} chatPreview={{ sources: previewMySources, failWrites }}>
```

`app/dev/preview/post/page.tsx`: az import

```ts
import { previewEmail, previewPosts } from "@/lib/fixtures";
```

helyett:

```ts
import { previewEmail, previewMySources, previewPosts } from "@/lib/fixtures";
```

és az `AppShell` nyitó tagje:

```tsx
    <AppShell language={language} email={previewEmail} initialNavMode={navMode} chatPreview={{ sources: previewMySources, failWrites: false }}>
```

(Mindkét előnézeti oldal kapja: a poszt-előnézet chatje se hívjon valódi API-t egy helyi munkamenettel.)

- [ ] **Step 8: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts`
Elvárt: `ℹ tests 12`, `ℹ fail 0`.

- [ ] **Step 9: Mutációs próba** (a `app/components/shell.test.ts`-szel)

| Mutáció | Elvárt bukás |
| --- | --- |
| a `TaiyakiButton`-ból az `aria-expanded={open}` sor törlése | `TaiyakiButton names itself…` |
| `aria-label={copy[language].open}` → `aria-label="Drop a link"` | ugyanaz |
| az asztali `<TaiyakiButton … />` törlése az `AppShell`-ből | `AppShell carries the taiyaki…` |

A panel viselkedését (fókusz, Esc, kívüli kattintás, lift, csík-sáv) a Step 11 Playwright-köre ellenőrzi. Ott minden pont egy-egy ilyen mutációt fog meg, például az `onInteractOutside` törlését vagy a `md:right-24` elhagyását.

- [ ] **Step 10: Ellenőrzés és futásidejű próba**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: mind zöld, `ℹ tests 536`, `Found 0 clones.`, és a build listájában `ƒ /api/sources/mine` és `ƒ /api/sources/[id]/retry`.

A futásidejű próba a 6. feladat 9. lépésének `curl`-ciklusa. Elvárt: minden sor `200 <nézet> 0`.

- [ ] **Step 11: Playwright-kör** (MCP, `npm run dev` mellett; 1280×800, a 7. pontban 768×1024 is)

1. **Nyitás.** `/dev/preview?view=radar`, a sarokgomb (`button[aria-controls="taiyaki-panel"]`, ami nem a `#mobile-nav`-ban van) `browser_click`, majd:
   ```js
   async () => {
     await new Promise((r) => setTimeout(r, 600));
     const button = [...document.querySelectorAll('button[aria-controls="taiyaki-panel"]')].find((b) => !b.closest("#mobile-nav"));
     const panel = document.getElementById("taiyaki-panel").getBoundingClientRect();
     return {
       expanded: button.getAttribute("aria-expanded"),
       panel: [Math.round(panel.width), Math.round(panel.height), Math.round(innerHeight - panel.bottom)],
       focus: document.activeElement.getAttribute("aria-label"),
       overlay: document.querySelectorAll('[data-slot="sheet-overlay"]').length,
       items: document.querySelectorAll("#taiyaki-panel ol > li").length,
     };
   }
   ```
   Elvárt: `{ expanded: "true", panel: [360, ≤ 0.7·innerHeight (800-nál 560), 96], focus: "Link és megjegyzés", overlay: 0, items: 4 }`.
2. **Kívüli kattintás.** `browser_click` a „A HÉT ÉLŐ ADATFOLYAMA” feliraton. Elvárt: `Boolean(document.getElementById("taiyaki-panel")) === true`.
3. **Küldés.** `browser_type` a mezőbe (`textarea[aria-label="Link és megjegyzés"]`, `submit: true`):
   - `nézd meg ezt` → az utolsó `li` szövege „Egyelőre csak linket tudok fogadni.”, a mező értéke marad;
   - `Ezt olvasd: https://www.youtube.com/watch?v=dQw4w9WgXcQ. és https://b.test/2` → a mező üres; a források közé bekerül egy `https://www.youtube.com/watch?v=dQw4w9WgXcQ` pár a „Megkaptam, YouTube-videó.” válasszal; az utolsó `li` „Egyszerre egy linket tudok fogadni, az elsőt küldtem be.”; a görgető alul van (`scrollHeight - scrollTop - clientHeight ≤ 1`); a fókusz a mezőben.
4. **„Újra”.** `browser_click` a `#taiyaki-panel button:has-text("ÚJRA")`-n. Elvárt: a panelben nincs több „Nem sikerült” szöveg, és nincs „ÚJRA” gomb (a minta `pending` lett).
5. **Esc.** `browser_press_key` `Escape`. Elvárt: nincs `#taiyaki-panel`, a fókusz a sarokgombon (`aria-label` „Link bedobása”, `aria-expanded="false"`).
6. **Lift** (a tulajdonos kiegészítése). Minden méréskor várj 250 ms-ot az átmenet végére.
   ```js
   () => {
     const b = [...document.querySelectorAll('button[aria-controls="taiyaki-panel"]')].find((x) => x.getClientRects().length);
     const s = getComputedStyle(b);
     return { hover: b.matches(":hover"), focus: b.matches(":focus-visible"), transform: s.transform, shadow: s.boxShadow.split("), ").pop(), transition: `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}` };
   }
   ```
   - Nyugalomban (a fókusz máshol, `browser_hover` a „A HÉT ÉLŐ ADATFOLYAMA”-n): `transform: "none"`, `shadow: "rgb(20, 20, 20) 4px 4px 0px 0px"`, `transition: "transform, box-shadow 0.16s, 0.16s ease, ease"`.
   - `browser_hover` a gombon: `hover: true`, `transform: "matrix(1, 0, 0, 1, -2, -2)"`, `shadow: "rgb(241, 95, 34) 8px 8px 0px 0px"`.
   - Tab: az egeret vidd el, és a fókuszt tedd a gomb előtti fókuszálható elemre:
     ```js
     () => {
       const taiyaki = [...document.querySelectorAll('button[aria-controls="taiyaki-panel"]')].find((x) => x.getClientRects().length);
       const tabbable = [...document.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length);
       tabbable[tabbable.indexOf(taiyaki) - 1].focus();
     }
     ```
     Utána `browser_press_key` `Tab`. Elvárt: `hover: false`, `focus: true`, `transform: "matrix(1, 0, 0, 1, -2, -2)"`, `shadow: "rgb(241, 95, 34) 8px 8px 0px 0px"`, és a `focus-ring` körvonala is látszik (`outlineStyle: "solid"`).
   - `browser_emulate_media` `reducedMotion: "reduce"`, majd hover a gombon: `transform: "none"`, `shadow: "rgb(241, 95, 34) 8px 8px 0px 0px"`. Ezután `reducedMotion: null`.
   - Egy Top 3 kártya (`article.must-card`) hovere változatlan: `matrix(1, 0, 0, 1, -2, -2)` és `rgb(241, 95, 34) 8px 8px 0px 0px`, nyugalomban `rgb(20, 20, 20) 5px 5px 0px 0px`.
7. **A csík és a gomb nem fedik egymást** (1280×800 és 768×1024, `radar`). Egy látható „Teendőhöz adás” gomb kattintása után:
   ```js
   async () => {
     await new Promise((r) => setTimeout(r, 300));
     const toast = document.querySelector("[data-undo-toast]").getBoundingClientRect();
     const bubble = [...document.querySelectorAll('button[aria-controls="taiyaki-panel"]')].find((b) => b.getClientRects().length && !b.closest("#mobile-nav")).getBoundingClientRect();
     return { overlap: !(toast.right <= bubble.left || toast.left >= bubble.right || toast.bottom <= bubble.top || toast.top >= bubble.bottom), laneRight: Math.round(document.querySelector("[data-undo-toast]").parentElement.getBoundingClientRect().right), bubbleLeft: Math.round(bubble.left) };
   }
   ```
   Elvárt: `overlap: false` mindkét szélességen, és `laneRight < bubbleLeft` (768-on kb. 657 < 673).
8. **Hálózat nélkül** (`/dev/preview?view=radar&fail=1`). Nyisd a panelt, küldd el: `https://blog.test/offline`. Elvárt:
   - az utolsó válasz „Nem ment át, próbáld újra.”, és a mező értéke `https://blog.test/offline`;
   - az „ÚJRA” után újra ugyanez a válasz, és az „ÚJRA” gomb ismét aktív.
9. **Vízszintes görgetés** nyitott panellel (1280, 768): `document.documentElement.scrollWidth <= innerWidth`.
10. **40 px** a panelben (a UX-A szkriptje, `#taiyaki-panel`-re szűkítve, az inline linkek kivételek). Elvárt: üres tömb.
11. **A Library frissülése nem bántja a panelt** (`library` nézet, ahol 5 s-onként `router.refresh()` fut). Nyisd a panelt, írj be szöveget, várj 11 s-ot. Elvárt: a panel nyitva van, a szöveg megvan, a szál elemszáma változatlan.
12. **Konzol** (`browser_console_messages`, `level: "warning"`). Elvárt: új hiba vagy figyelmeztetés nincs. A mintakép `/media/1/0123456789abcdef-640.avif` kérésének hibája ismert (a fixture tükrözött képe).

Minden talált hibára előbb egy teszt a `lib/`-ben vagy a render-harnessben, ha a hiba logikai, aztán a javítás, és külön commit (`fix: …`).

- [ ] **Step 12: Commit**

```bash
git add app/components/link-chat.tsx app/globals.css app/components/app-shell.tsx app/components/undo-toast.tsx app/dev/preview/page.tsx app/dev/preview/post/page.tsx app/components/shell.test.ts
git commit -m "feat: open the taiyaki link chat from a corner button"
```

---

### Task 8: A mobil alsó sáv: középső taiyaki, Archívum a „Több”-ben

**Files:**
- Modify: `lib/nav.ts`, `lib/nav.test.ts`
- Modify: `app/components/nav-parts.tsx` (`NavEntry` `onClick`)
- Modify: `app/components/app-shell.tsx` (`MobileNav`, a tartalom alsó paddingje)
- Modify: `app/components/undo-toast.tsx` (a mobil sáv magassága)
- Test: `app/components/shell.test.ts`

**Interfaces:**
- Consumes: `TaiyakiButton` (7. feladat); `PRIMARY_NAV`, `activeNavId`, `NavItem`, `NavId` (`lib/nav.ts`).
- Produces:
  - `NavItem.mobileMore?: true`: az `archive` kapja;
  - `export const MOBILE_BAR_NAV`: a sáv három lap-helye (radar, library, search);
  - `export const MOBILE_CHAT_SLOT = 2`;
  - `export const MOBILE_MORE_NAV` (archive);
  - `export const inMobileMore = (id: NavId | null) => boolean`;
  - `NavEntry` új propja: `onClick?: () => void` (a link kattintására fut).

- [ ] **Step 1: A tesztek**

`lib/nav.test.ts`: az import

```ts
import { activeNavId, NAV_ITEMS, switchesLanguageInPlace } from "./nav.ts";
```

helyett:

```ts
import { activeNavId, inMobileMore, MOBILE_BAR_NAV, MOBILE_MORE_NAV, NAV_ITEMS, PRIMARY_NAV, switchesLanguageInPlace } from "./nav.ts";
```

A fájl végére:

```ts

// Kills Archívum left in the bar (four page slots: no room for the taiyaki in grid-cols-5), a primary
// item in neither place (unreachable on a phone), and a "Több" slot that never shows the active page.
test("the mobile bar holds three page slots, Több holds every other primary item, and marks their pages", () => {
  assert.equal(MOBILE_BAR_NAV.length, 3);
  assert.deepEqual([...MOBILE_BAR_NAV, ...MOBILE_MORE_NAV].map(({ id }) => id).sort(), PRIMARY_NAV.map(({ id }) => id).sort());
  assert.equal(inMobileMore(activeNavId("/archive/2026-W38")), true);
  assert.equal(inMobileMore(activeNavId("/library/42")), false);
  assert.equal(inMobileMore(null), false);
});
```

`app/components/shell.test.ts`: a 7. feladat `AppShell carries the taiyaki…` tesztjében ez a sor:

```ts
  assert.equal(doc.querySelectorAll(`button[aria-controls="${CHAT_PANEL_ID}"]`).length, 1);
```

helyett:

```ts
  assert.equal(doc.querySelectorAll(`button[aria-controls="${CHAT_PANEL_ID}"]`).length, 2);
```

és a kommentje (`// Kills the corner button left out of the shell.`) helyett: `// Kills either taiyaki left out of the shell: the corner button and the bar's centre slot.` A fájl végére:

```ts

// Kills the bar's old order: Archívum in the bar, and no taiyaki between Könyvtár and Keresés.
test("the mobile bar reads Radar, Könyvtár, the taiyaki, Keresés, Több", () => {
  const doc = render(
    createElement(AppShell, { language: "hu", email: "reader@example.test", initialNavMode: "full" } as ComponentProps<typeof AppShell>, createElement("p", null, "Child")),
  );
  const slots = [...doc.querySelectorAll("#mobile-nav > *")].map((slot) => slot.getAttribute("aria-label") ?? slot.textContent);
  assert.deepEqual(slots, ["Radar", "Könyvtár", "Link bedobása", "Keresés", "Több"]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts app/components/shell.test.ts`
Elvárt:
- a `lib/nav.test.ts` betöltése `SyntaxError: … does not provide an export named 'inMobileMore'`;
- a `shell.test.ts`-ben 2 FAIL: a darabszám `1 !== 2`, és a sor `["Radar", "Könyvtár", "Keresés", "Archívum", "Több"]`.

- [ ] **Step 3: A menülista** (`lib/nav.ts`)

A `NavItem` típusában a `soon?: true;` után:

```ts
  /** Below md it sits in the "Több" sheet, not in the bottom bar: the bar's centre slot is the taiyaki's. */
  mobileMore?: true;
```

Az `archive` sora:

```ts
  { id: "archive", href: "/archive", mobileMore: true, label: { hu: "Archívum", en: "Archive" } },
```

A `export const SOON_NAV = …` sor után:

```ts
/** The mobile bar's page slots, in order: the taiyaki goes after the first MOBILE_CHAT_SLOT of them, "Több" last. */
export const MOBILE_BAR_NAV = PRIMARY_NAV.filter((item) => !item.mobileMore);
export const MOBILE_CHAT_SLOT = 2;
/** The primary items the mobile "Több" sheet holds, above the language toggle. */
export const MOBILE_MORE_NAV = PRIMARY_NAV.filter((item) => item.mobileMore);
/** On one of their pages the "Több" slot carries the active mark. */
export const inMobileMore = (id: NavId | null) => MOBILE_MORE_NAV.some((item) => item.id === id);
```

(Az asztali oldalsáv a `PRIMARY_NAV`-ot olvassa, ezért nem változik.)

- [ ] **Step 4: `NavEntry`** (`app/components/nav-parts.tsx`)

```tsx
/** A page link (aria-current when it is the active one) or, for the search slot, a button. */
export function NavEntry({ item, active, onSearch, className, children }: {
  item: NavItem;
  active: boolean;
  onSearch: () => void;
  className: string;
  children: ReactNode;
}) {
  return item.href ? (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
```

helyett:

```tsx
/** A page link (aria-current when it is the active one) or, for the search slot, a button. `onClick`
 *  runs when the link is followed: the mobile "Több" sheet closes itself with it. */
export function NavEntry({ item, active, onSearch, onClick, className, children }: {
  item: NavItem;
  active: boolean;
  onSearch: () => void;
  onClick?: () => void;
  className: string;
  children: ReactNode;
}) {
  return item.href ? (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onClick} className={className}>
```

- [ ] **Step 5: A sáv** (`app/components/app-shell.tsx`)

Az import:

```ts
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
```

helyett:

```ts
import { activeNavId, inMobileMore, MOBILE_BAR_NAV, MOBILE_CHAT_SLOT, MOBILE_MORE_NAV, type NavItem } from "@/lib/nav";
```

A tartalom paddingje:

```tsx
        {/* Room for the fixed bottom bar, so it never covers the end of the page. */}
        <div className="pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
```

helyett:

```tsx
        {/* Room for the fixed bottom bar and the taiyaki raised 18px above it, so neither covers the end of the page. */}
        <div className="pb-[calc(5.25rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
```

A `<MobileNav email={email} onSearch={openSearch} />` helyett:

```tsx
      <MobileNav
        email={email}
        onSearch={openSearch}
        chat={
          <TaiyakiButton
            open={chatOpen}
            onClick={toggleChat}
            className="-mt-[18px] grid size-14 self-start justify-self-center shadow-[3px_3px_0_var(--signal)]"
          />
        }
      />
```

A `slotClass` és a `MobileNav` eleje, a `<SheetTrigger className={slotClass}>` sorral bezárólag:

```tsx
const slotClass =
  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 font-mono text-[10px] aria-[current=page]:text-signal data-[state=open]:text-signal";

/** Below md: five slots in thumb reach. "Több" holds the language, sign-out and the coming views. */
function MobileNav({ email, onSearch }: { email: string; onSearch: () => void }) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const t = copy[language];
  return (
    <nav
      id="mobile-nav"
      aria-label={t.nav}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-signal bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = navIcons[item.id];
        return (
          <NavEntry key={item.id} item={item} active={active === item.id} onSearch={onSearch} className={slotClass}>
            <Icon className="size-5" />
            <span>{item.label[language]}</span>
          </NavEntry>
        );
      })}
      <Sheet>
        <SheetTrigger className={slotClass}>
```

helyett:

```tsx
const slotClass =
  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 font-mono text-[10px] aria-[current=page]:text-signal data-[active]:text-signal data-[state=open]:text-signal";

/** Below md: five slots in thumb reach, the taiyaki raised in the middle. "Több" holds Archívum, the
 *  language, the coming views and sign-out; on Archívum's pages its slot carries the active mark. */
function MobileNav({ email, onSearch, chat }: { email: string; onSearch: () => void; chat: ReactNode }) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const [moreOpen, setMoreOpen] = useState(false);
  const t = copy[language];
  const slot = (item: NavItem) => {
    const Icon = navIcons[item.id];
    return (
      <NavEntry key={item.id} item={item} active={active === item.id} onSearch={onSearch} className={slotClass}>
        <Icon className="size-5" />
        <span>{item.label[language]}</span>
      </NavEntry>
    );
  };
  return (
    <nav
      id="mobile-nav"
      aria-label={t.nav}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-signal bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
    >
      {MOBILE_BAR_NAV.slice(0, MOBILE_CHAT_SLOT).map(slot)}
      {chat}
      {MOBILE_BAR_NAV.slice(MOBILE_CHAT_SLOT).map(slot)}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={slotClass} data-active={inMobileMore(active) || undefined}>
```

A „Több” tartalmában, a `</SheetHeader>` után és a nyelvi sor (`<div className="flex items-center justify-between border-b-2 border-ink pb-4">`) előtt:

```tsx
          <ul className="border-b-2 border-ink pb-4">
            {MOBILE_MORE_NAV.map((item) => {
              const Icon = navIcons[item.id];
              return (
                <li key={item.id}>
                  <NavEntry
                    item={item}
                    active={active === item.id}
                    onSearch={onSearch}
                    onClick={() => setMoreOpen(false)}
                    className="focus-ring flex min-h-10 items-center gap-3 font-mono text-sm aria-[current=page]:text-signal"
                  >
                    <Icon className="size-4" />
                    <span>{item.label[language]}</span>
                  </NavEntry>
                </li>
              );
            })}
          </ul>
```

(A „Több” sorrendje így: Archívum, nyelv, a „hamarosan” nézetek, kijelentkezés, a spec 1.2 szerint.)

- [ ] **Step 6: A csík mobilon a kiemelt gomb fölé** (`app/components/undo-toast.tsx`)

A doc-komment (a 7. feladat óta):

```ts
/** Mounted once by the app shell, above the mobile bottom bar and above any open panel. From md up its
 *  lane stops short of the taiyaki's corner (`md:right-24`: the button is 24 px in and 56 px wide). */
```

helyett:

```ts
/** Mounted once by the app shell, above any open panel. Below md it sits above the bottom bar and the
 *  taiyaki raised out of it; from md up its lane stops short of the taiyaki's corner (`md:right-24`). */
```

A sávban `bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))]` → `bottom-[calc(5.75rem_+_env(safe-area-inset-bottom))]`.

- [ ] **Step 7: Futtatás, zöld**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts app/components/shell.test.ts`
Elvárt: `ℹ tests 17`, `ℹ fail 0`.

- [ ] **Step 8: Mutációs próba** (a Step 7 két fájljával)

| Mutáció | Elvárt bukás |
| --- | --- |
| a ` mobileMore: true,` törlése az `archive` sorából | `the mobile bar holds three page slots…` és `the mobile bar reads Radar, Könyvtár…` |
| `inMobileMore` → `(id) => id === null && MOBILE_MORE_NAV.length < 0` | `the mobile bar holds three page slots…` |
| `MOBILE_CHAT_SLOT = 2` → `3` | `the mobile bar reads Radar, Könyvtár…` |
| a `{chat}` sor törlése a `MobileNav`-ból | `AppShell carries the taiyaki…`, `the mobile bar reads…` |

- [ ] **Step 9: Ellenőrzés és futásidejű próba**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: mind zöld, `ℹ tests 538`, `Found 0 clones.`

A futásidejű próba a 6. feladat 9. lépésének `curl`-ciklusa. Elvárt: minden sor `200 <nézet> 0`.

- [ ] **Step 10: Playwright-kör** (MCP, `npm run dev` mellett, 360×740; a 6. pontban 768×1024 is)

1. **A sáv.** `/dev/preview?view=library`:
   ```js
   () => {
     const bar = document.getElementById("mobile-nav");
     const taiyaki = bar.querySelector('button[aria-controls="taiyaki-panel"]');
     return {
       slots: [...bar.children].map((el) => el.getAttribute("aria-label") ?? el.textContent),
       size: [Math.round(taiyaki.getBoundingClientRect().width), Math.round(taiyaki.getBoundingClientRect().height)],
       raise: Math.round(bar.getBoundingClientRect().top - taiyaki.getBoundingClientRect().top),
       shadow: getComputedStyle(taiyaki).boxShadow.split("), ").pop(),
     };
   }
   ```
   Elvárt: `slots: ["Radar", "Könyvtár", "Link bedobása", "Keresés", "Több"]`, `size: [56, 56]`, `raise` 16 (a spec 16–18 px-je), `shadow: "rgb(241, 95, 34) 3px 3px 0px 0px"`.
2. **A Sheet.** A középső gomb kattintása után, 700 ms-mal:
   - `[data-slot="sheet-overlay"]` 1 darab (modális);
   - a `#taiyaki-panel` 360 széles, a magassága legfeljebb 555 (`75dvh`);
   - a fókusz a mezőben;
   - `document.documentElement.scrollWidth <= innerWidth`, és a panel `scrollWidth <= clientWidth`;
   - a 7. feladat 40 px-es szkriptje a panelre: üres tömb.
3. **Esc.** Elvárt: nincs `#taiyaki-panel`, és `document.activeElement.closest("#mobile-nav")` a középső gomb (`aria-label` „Link bedobása”).
4. **„Több”.** A „Több” gomb kattintása után:
   - a Sheet gyerekeinek sorrendje: cím, Archívum, Nyelv, a „hamarosan” lista, a fiók-sor és a bezáró gomb;
   - az Archívum link legalább 40 px magas.

   A kattintása bezárja a Sheetet. Hogy az előnézetben maradj, előbb egy `document.addEventListener("click", (e) => e.preventDefault(), { capture: true, once: true })`, utána `link.click()`. Elvárt: nincs `[data-slot="sheet-content"]`, és az URL változatlan.
5. **„MEGNYITÁS →” mobilon bezárja a panelt.** Nyisd a taiyakit, ugyanazzal a `preventDefault`-trükkel kattints az `a[href="/library/-1"]`-re. Elvárt: nincs `#taiyaki-panel`.
6. **A csík és a kiemelt gomb** (`radar`, 360): egy „Teendőhöz adás” után a `[data-undo-toast]` alja kisebb, mint a középső gomb teteje (kb. 648 < 658), vagyis nincs átfedés. 768 px-en a 7. feladat 7. pontja ugyanígy teljesül.
7. **A lap alja.** A UX-A „A sáv nem takar” szkriptje, a gomb tetejével mérve:
   ```js
   async () => {
     window.scrollTo(0, document.documentElement.scrollHeight);
     await new Promise((r) => setTimeout(r, 300));
     const top = document.querySelector('#mobile-nav button[aria-controls="taiyaki-panel"]').getBoundingClientRect().top;
     const items = [...document.querySelectorAll("main a, main button, main p, main h2")].filter((el) => el.getClientRects().length);
     return { covered: items.at(-1).getBoundingClientRect().bottom > top };
   }
   ```
   Elvárt: `covered: false` a `radar`, a `library` és az `archive` nézetben.
8. **Lift Tab-bal.** A középső gombra Tab-bal lépve: `transform: "matrix(1, 0, 0, 1, -2, -2)"`, `shadow: "rgb(241, 95, 34) 8px 8px 0px 0px"`.
9. **Nincs vízszintes görgetés** egyik nézetben sem, zárt és nyitott panellel.

A „Több” aktív jelölése (`data-active`) az előnézetben nem látszik, mert a `/dev/preview` egyik menüponthoz sem tartozik. Egységteszt fedi, és a TODO élő próbái között van.

- [ ] **Step 11: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts app/components/nav-parts.tsx app/components/app-shell.tsx app/components/undo-toast.tsx app/components/shell.test.ts
git commit -m "feat: put the taiyaki in the mobile bar and move the archive into more"
```

---

### Task 9: Dokumentáció és végső ellenőrzés

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `TODO.md`

**Interfaces:**
- Consumes: az 1–8. feladat nevei.
- Produces: —

- [ ] **Step 1: `CLAUDE.md`** (előbb olvasd újra; ha közben változott, az új szövegbe illeszd)

- **How content gets in, 2. Link submissions:** az első mondat elé: „Two front doors lead to it: the `/library` form and the taiyaki link chat (see App shell).” A felsorolás után új bekezdés: „`POST /api/sources/[id]/retry` sends the submitter's own `failed` source back to `pending` with `attempts` reset to 0 (`retrySource` in `lib/my-sources.ts`), so a retry killed at 300 s is still picked up by the daily cron, and runs `processSource` in `after()`.”
- **App shell and navigation:**
  - A „Mobile, below `md`” pont helyett: „**Mobile, below `md`:** the bottom bar in `app-shell.tsx`, five slots: Radar, Library, the taiyaki (raised 18px out of the bar), Search, Több. `lib/nav.ts` says where each item goes: `MOBILE_BAR_NAV` (the three page slots, the taiyaki after `MOBILE_CHAT_SLOT` of them) and `MOBILE_MORE_NAV` (items with `mobileMore`, today Archívum). "Több" opens a bottom Sheet: Archívum, the language toggle, the coming views, sign-out; on an Archívum page its slot carries the active mark (`inMobileMore`, `data-active`), and following the link closes the Sheet (`NavEntry`'s `onClick`).”
  - Új pont a „Search” után: „**Link chat (taiyaki):** `link-chat.tsx`. `TaiyakiButton` is the desktop corner button (`fixed bottom-6 right-6`, `z-40`) and the mobile centre slot; `.lift` in `globals.css` brings it forward on hover and keyboard focus, like the Top 3 cards. `LinkChat` is one Radix Dialog: non-modal on desktop (360px above the button, `max-h-[70dvh]`; only Esc and its close button close it), a modal bottom Sheet on mobile (`max-h-[75dvh]`). Focus goes to the field on open and back to the button that opened it. Enter sends, Shift+Enter is a new line. The logic is `lib/link-chat.ts`: `parseLinkMessage` (the first http(s) word, sentence punctuation stripped; the rest is the note), `toThread`, and `createLinkChat`, which loads `GET /api/sources/mine` on open and polls it every 4 s while the panel is open, the tab is visible and a source is pending (at most `MAX_POLLS`, 150). The thread is `chat-thread.tsx`: the reader's 10 latest submissions (oldest first) with a reply per status, then local replies that live only while the panel is open.”
  - Az „Undo toast” pont végére: „Its lane sits above the mobile bar and the raised taiyaki (`bottom: 5.75rem`), and from `md` up stops short of the taiyaki's corner (`md:right-24`).”
- **Offline preview:** a „reader state goes through `memorySend` and the Library form through an in-memory stub (`preview` on `LibraryView`)” rész után: „, and the link chat through `memoryTransport` (`chatPreview` on `AppShell`, seeded from `previewMySources`)”. Ugyanitt: „`lib/fixtures.ts`'s preview post ids are negative on purpose” → „`lib/fixtures.ts`'s preview post and chat-source ids are negative on purpose: `parseId` rejects them, so translate, retry or a Library card link can't reach a real row.”
- **UI text (HU/EN):** a végére: „Lists shared by several components keep `Localized` values in `lib/`: `NAV_ITEMS`, `SHORTCUTS`, and `SOURCE_KIND_LABELS` (`lib/source-kinds.ts`, the post page's kind badge and the link chat).”
- **Database:** a „`createAdminClient()` bypasses RLS — the pipeline, plus the translate, reextract and `/media` routes after their own checks” mondatban: „…the translate, reextract, `sources/[id]/retry` and `/media` routes…”. A `sources` sor: „`sources`: readers `select` (every row: code that lists "my" sources filters on `submitted_by` itself, `listMySources`) and `insert` (stamped with `auth.uid()`); no reader updates, so the retry's claim runs with the admin client.”
- **Routes** tábla:
  - a `POST /api/sources` sora: „400 `invalid_url`, 409 `already_submitted` (with `postId` when the link already has a post), 500 `insert_failed`, else 202 `{ ok, id }` and `processSource` in `after()`”;
  - új sor: „| `GET /api/sources/mine` | `getReader()` | the caller's 10 latest sources, newest first, with `post: { id, title }` (the submitter's title override wins, `shownTitle`); 500 `db_error` |”;
  - új sor: „| `POST /api/sources/[id]/retry` | `getReader()`, then admin | `retrySource`: 404 (also for an id that isn't a positive integer), 403 `forbidden` (not the submitter), 409 `not_failed` (not `failed`, or a concurrent retry won the compare-and-swap on `id` + `submitted_by` + `status = 'failed'`, which writes `status = 'pending'`, `error = null`, `attempts = 0`), 500 `db_error`, else 202 and `processSource` in `after()`. No cooldown (a `ponytail:` note) |”.

  A tábla alatti mondat: „The three `posts/[id]` routes are wrapped in `postRoute`” → „The three `posts/[id]` routes and `sources/[id]/retry` are wrapped in `postRoute`”. A `maxDuration = 300` listába a retry route.
- **Security, Rendering:** „in `PostBlocks` and the post page” → „in `PostBlocks`, the post page and the link chat's thread (`toThread`)”.
- **Layout:**
  - az `app/components/` sorába: `taiyaki-icon, chat-thread, link-chat (the taiyaki button and panel)`;
  - az `app/api/` sorába: `sources/mine, sources/[id]/retry`;
  - új sorok: `lib/link-chat.ts  parseLinkMessage, toThread, the chat store (createLinkChat), httpTransport / memoryTransport`, `lib/my-sources.ts  listMySources, retrySource (GET /api/sources/mine, POST /api/sources/[id]/retry)`, `lib/source-kinds.ts  SOURCE_KIND_LABELS`;
  - a `lib/post-view.ts` sora: „Post, toPost (a posts row → the page's Post), shownTitle, media/video helpers, withQuery”;
  - a `lib/api.ts` sora: „…postRoute and POST_ERRORS for the `[id]` routes”.
- **Conventions:**
  - A „No duplication” közös helyei közé: `lib/source-kinds.ts` (`SOURCE_KIND_LABELS`), `lib/post-view.ts` (`shownTitle`), `lib/link-chat.ts` (`httpTransport`, the one fetcher for `/api/sources`); a UI-ban a `.lift` osztály.
  - A Tests → `fakeDb` pontba: „A `sources` listing applies `order(column, { ascending })` before `limit(n)` and, without `pending`, lists `sources`; `maybeSingle()` answers null for none and PGRST116 for several; a `sources` update chains `.eq` filters and writes through, so a second compare-and-swap sees the first; `sourceSelectError` fails every `sources` select.”
  - Ugyanitt: „`t.mock.timers.enable()` once per test: a helper that enables it breaks when a test calls it twice (`ERR_INVALID_STATE`)”.
- **Design language:** a „Responsive rules” pontban a „Below `md` the app shell shows a fixed five-slot bottom bar” után: „with the taiyaki raised in its centre slot; the content column's bottom padding (`5.25rem`) clears both”. A „Shadows are hard offsets…” pont végére: „`.lift` is the shared "come forward" state (the Top 3 cards on hover; the taiyaki on hover and keyboard focus, and without the translate under `prefers-reduced-motion`).”
- **Data contract:** a `toPost` mondatába: „…where a submitter's override wins over the model's title (`shownTitle`, shared with the link chat) and summary…”.

- [ ] **Step 2: `README.md`**

- **What it is**, a Library bekezdés végére: „A taiyaki button on every page (the bottom-right corner on desktop, the middle of the bottom bar on phones) opens a small chat: drop a link with a note, watch it go from processing to done, and retry it if it failed.”
- **How it works**, a mermaid ábrán a `submit` alcsoportba:
  ```text
    chat["taiyaki link chat"] --> sourcesRoute
    chat -->|"polls every 4 s"| mineRoute["GET /api/sources/mine"]
    chat --> retryRoute["POST /api/sources/[id]/retry"]
  ```
  és a `sourcesRoute -.->|"after()"| ingest` sor után: `  retryRoute -.->|"after()"| ingest`.
- **Project tour**, a keret-bekezdés végére: „The taiyaki button opens the link chat.” A táblában:
  - az `app/components/` sora: „…the undo toast, the link chat and its taiyaki)…”;
  - az `app/api/` sora: „JSON routes: reader state, link submission, your own submissions and their retry, post edit, translate, re-extract, and the daily cron”.
- **Recipes → Add a source extractor**, 5. lépés: „Add the kind's name, in both languages, to `SOURCE_KIND_LABELS` in [`lib/source-kinds.ts`](lib/source-kinds.ts) (the post page's badge and the link chat), and its icon to `kindIcons` in the Library page; `tsc` reports a missing entry.”
- **Conventions → Bilingual:** az angol-only felsorolásból kikerül „the post kind labels (`kindLabel`), ”.
- **Troubleshooting → Submissions are stuck after three failed attempts:** a „There is no button to reset them yet (the TODO item "Hibás beküldések kezelése" in [TODO.md](TODO.md)).” mondat helyett: „The submitter can send a failed one through again with ÚJRA in the taiyaki link chat, which also resets its attempts; a stuck source of another member, or many at once, still needs the SQL below.”
- **Roadmap:** új sor: „- [Taiyaki link chat](docs/superpowers/specs/2026-09-25-taiyaki-link-chat-design.md) (spec) and its [plan](docs/superpowers/plans/2026-09-26-taiyaki-link-chat.md)”.

- [ ] **Step 3: `TODO.md`**

- A „Következő lépések” alól a `- [ ] **Taiyaki link-chat** …` pont átkerül a „Kész” alá, pipálva: `- [x] **Taiyaki link-chat** (2026-09-2x): taiyaki-gomb asztalon a sarokban, mobilon az alsó sáv közepén (az Archívum a „Több”-be került), mini chat a saját 10 legutóbbi beküldéssel és élő állapottal, „Újra” a hibás beküldésen. Terv: [docs/superpowers/plans/2026-09-26-taiyaki-link-chat.md](docs/superpowers/plans/2026-09-26-taiyaki-link-chat.md).` (A dátum a beolvasztás napja.)
- A „Hibás beküldések kezelése” alpontja: `  - [x] A saját beküldés „Újra” gombja kész: a taiyaki link-chatben (\`POST /api/sources/[id]/retry\`). A „Törlés” és az admin-rész marad itt.`
- A „Következő lépések” alá új pont: `- [ ] **Élő próbák a taiyaki link-chat deployja után** (a kontroller futtatja, ha a felhasználó engedélyez egy bejelentkezett munkamenetet): egy valódi link beküldése a chatből, és a szál „FELDOLGOZÁS…” → „KÉSZ · MEGNYITÁS →” váltása a poszt címével (a \`posts(...)\` beágyazás objektumként jön-e); egy hibás beküldés „Újra”-ja (a sor `attempts` értéke 0 lesz, aztán 1); egy már bent lévő link 409-e a „MEGNYITÁS →”-sal; az \`/archive\` oldalon a „Több” aktív jelölése mobilon; a lekérdezés leáll a panel bezárása után (\`browser_network_requests\`).`
- Az M2 pont alá: `    - A taiyaki link-chat óta a \`post-article.tsx\` \`copy\`-jában nincs \`kind\`: a forrástípus jelvénye a \`SOURCE_KIND_LABELS\`-ből jön (\`lib/source-kinds.ts\`). A \`labels.keyPoints\` megmaradt.`

- [ ] **Step 4: Végső ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: mind zöld, `ℹ tests 538` (a kiinduló 488 + 50), `Found 0 clones.` Ha a kiindulás más volt, a növekmény 50.

Futtatás: `git diff --stat main..HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml supabase/`
Elvárt: üres kimenet (nincs függőség- és sémaváltozás).

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md TODO.md
git commit -m "docs: document the taiyaki link chat"
```

A push a tulajdonosé: `! git push origin taiyaki-link-chat`. A `main` ruleset a `checks` státuszt kéri, a merge csak a CI zöld futása után jöhet.

---

## Önellenőrzés

**1. Spec-lefedettség:**
- 1.1 a gomb:
  - az ikon, `aria-hidden`: 6. feladat;
  - asztalon `fixed bottom-6 right-6`, `size-14`, paper, ink keret, `4px 4px 0` árnyék, a lift, `z-40`: 7. feladat;
  - mobilon a kiemelt középső hely, a `3px 3px 0 var(--signal)` árnyék és a 40 px: 8. feladat;
  - `aria-label`, `aria-expanded`, `aria-controls`: 7. feladat;
  - a csík `md:right-24`-e: 7. feladat, mobilon a kiemelés fölé: 8. feladat.
- 1.2 a sáv: a `lib/nav.ts` listái, a sorrend, a „Több” tartalma és sorrendje, az aktív jelölés: 8. feladat.
- 1.3 a panel (7. feladat):
  - asztalon nem modális, 360 px, `70dvh`, csak Esc és a bezáró gomb zár;
  - mobilon alsó Sheet, `75dvh`, `closeLabel`;
  - a fókusz a mezőbe, majd vissza a gombra;
  - az ink fejléc a kis taiyakival, a címmel és a 40 px-es bezáró gombbal;
  - a szál (köszönés, 10 beküldés a legrégebbi elöl, helyi válaszok a végén, a panel életéig), az aljára görgetés `prefers-reduced-motion` mellett ugrással, `aria-live="polite"`;
  - a mező: `Textarea`, `30dvh`, Enter és Shift+Enter, 40 px-es signal gomb, küldés közben tiltva;
  - `[overflow-wrap:anywhere]`, 360 px.
- 1.4 egy beküldés:
  - az ink buborék a `safeHref`-es linkkel, új lapon, alatta a megjegyzés;
  - a három állapot válasza a közös forrástípus-nevekkel;
  - a cím a beküldő átírásával;
  - az egy közös lista.

  Ezek a 2., az 5. és a 6. feladatban.
- Spec 2. (üzenet → beküldés):
  - `parseLinkMessage`: 4. feladat;
  - a küldés a `{ url, note }` törzzsel, és minden válasz a táblázatból (202 + `moreLinks`, 400, 409 + „MEGNYITÁS →”, 401 + `/login?next=`, hálózat/5xx a szöveg megtartásával, link nélküli üzenet kérés nélkül): 5. és 6. feladat;
  - a 409 `postId`: 2. feladat.
- 3.1: 2. feladat. 3.2: 3. feladat (a `ponytail:` megjegyzéssel, és az `attempts = 0` a tulajdonos döntése szerint). 3.3: 5. feladat (nyitáskor egy lekérés, 4 s csak nyitott panel, látható fül és függő beküldés mellett, azonnali lekérés küldés és „Újra” után, egyszeri „nem érem el”). Séma nincs: Global Constraints.
- Spec 4. (hibakezelés és biztonság): a Global Constraints-ben és az 5., 3., 2. feladatban.
- Spec 5. (tesztelés):
  - egységtesztek: 4., 5., 2., 3. feladat;
  - render-tesztek: 6. és 7. feladat;
  - előnézet: 6. és 7. feladat;
  - Playwright 360-on és 1280-on: 7. és 8. feladat;
  - futásidejű próba: 6., 7., 8. feladat;
  - az öt ellenőrzés: minden feladat, végül a 9.
- A tulajdonos kiegészítése (lift): 7. feladat Step 4, Playwright 6. pont; 8. feladat Playwright 8. pont.

**2. Helyőrzők:** „TBD”, „TODO” és „similar to” nincs. Minden kódlépésben teljes kód áll. A TODO.md-be írt „2026-09-2x” a beolvasztás napja, szándékosan.

**3. Típus-egyezés:**
- `MySource`: 2. feladat, fogyasztja az 5., 6. és 7. feladat.
- A `ChatSnapshot` mezői (`sources`, `notices`, `unreachable`, `sending`, `retrying`) és a `ChatThread` `Pick`-je egyeznek.
- A `ChatNotice` `kind`-jai és a `ChatThread` `copy` kulcsai egyeznek (`no_link`, `more_links`, `invalid_url`, `network`, `signed_out`, `already_submitted`), ahogy az `Answer` és a `ChatTransport` is.
- `CHAT_PANEL_ID` a 7. feladatban, a teszt és a 8. feladat is ezt használja.
- A 8. feladat a `TaiyakiButton` `className`-es API-ját hívja.
- A `retrySource(db, admin, viewerId, sourceId)` sorrendje a lib-tesztben és a route-ban azonos.
- `RetryResult` ↔ `RETRY_STATUS` (a `tsc` kikényszeríti).

**4. Review Focus:** mind az öt pont egy tesztre mutat a saját feladatában. A csík és a gomb átfedése a 7. és a 8. feladat Playwright-körében mérve (1280, 768, 360).
