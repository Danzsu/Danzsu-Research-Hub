# R2 „Visszajelzés” — terv

**Állapot:** jóváhagyva (2026-10-01), a beszélgetésben
**Sorrend:** a reszponzív munka második része (R1 Gyors → R2 Visszajelzés → R3 Elrendezés)
**Kapcsolódó:** [.superpowers/ux-audit/2026-09-27-responsive-audit.md](../../../.superpowers/ux-audit/2026-09-27-responsive-audit.md) (git-ignorált) → 3. és 4. téma; [R1 spec](2026-09-27-r1-speed-design.md) → „Nem része az R1-nek”; DESIGN.md → Principles, Elevation, Motion

## Cél

Minden kattintás után azonnal és őszintén látszódjon, mi történik: a várakozás, a siker és a hiba is. Ami a tag beírt, az egy hiba miatt ne vesszen el. A tulajdonos szavaival: „sokkal responzívabb legyen a UI/UX”, „jobb visszajelző effektek”.

**Siker:**
- A chatben a saját buborék `slow=1` mellett is 100 ms-on belül megjelenik.
- `fail=1` mellett a chat és a teendő szövege visszakerül a mezőbe.
- Minden hibaüzenet legalább 4,5:1 kontrasztú, és nem néz ki úgy, mint egy siker.
- Egy elbukott olvasás hibaoldalt mutat, nem üres listát vagy 404-et.
- Minden kattintható elemnek van lenyomott állapota, érintőképernyőn is. Csökkentett mozgásnál semmi nem mozdul.
- Érintőképernyőn minden kattintható elem legalább 40 px.

## 1. Optimizmus

- **A chat küldése** (`lib/link-chat.ts` → `send`, `app/components/link-chat.tsx`, `chat-thread.tsx`):
  - Küldéskor a mező azonnal kiürül, és a szálban rögtön megjelenik a saját buborék a linkkel, alatta a taiyaki „KÜLDÉS…” / „SENDING…” sorával és az élő ponttal.
  - Ha a válasz 202, a buborékot az újratöltött lista valódi bejegyzése váltja.
  - Ha nem 202, vagy a hálózat bukik el, a buborék eltűnik, a szöveg visszakerül a mezőbe, és a mai válasz jön (például „Nem ment át, próbáld újra.”). A mező a küldés alatt ma is `readOnly`, így a visszaírt szöveg nem írhat felül semmit, amit a tag közben gépelt.
  - Ami ma marad: a 409-es válaszok, a `no_link` és a `more_links`.
- **Nincs halmozódás:** ha egy válasz ugyanaz, mint a szál utolsó helyi válasza, az új a régi helyére lép, nem kerül alá. Új kulcsot kap, így a képernyőolvasó újra felolvassa. Ma csak a `signed_out` van összevonva.
- **Teendő** (`lib/reader-store.ts` → `addTodo`, `app/components/reader-panel.tsx`): ha a hozzáadás elbukik, a szöveg visszakerül a mezőbe, ha az közben üres maradt. Ha a tag már mást írt bele, az övé marad, és a hibás toast jelzi a kudarcot.
- **Felső sáv** (`app/components/refresh-bar.tsx` → `useRefresh`): a Mentés, a Fordítás és a Library-beküldés a kérésüket is a sáv átmenetén belül futtatják, így a sáv a kattintástól a frissítés végéig fut. Ma csak a végső `router.push`/`refresh` alatt fut. A chat küldése nem lép be ide, mert saját buborékot kap.
- **Újrakinyerés** (`post-editor.tsx` → `reextract`): a 202 után a poszt oldala 5 másodpercenként frissül, ahogy a Library a feldolgozás alatt (`RefreshWhileProcessing`). Akkor áll le, amikor a forrás már nincs lefoglalva (`sources.claimed_at` üres vagy lejárt). Ha a lefoglalás az első frissítésig nem látszik, mert a futás még el sem indult, vagy már véget is ért, a frissítés legfeljebb 30 másodpercig fut.

## 2. Őszinte hibák

- **Egy közös hibasor**, egy komponens, minden írási hibához:
  - világos felületen (paper, cream) narancs sáv ink szöveggel, 2 px ink kerettel (5,6:1, mint a hibás toast);
  - ink felületen narancs szöveg (5,6:1);
  - `role="alert"`, és mono `text-xs`, mint ma.
  - **Ezt kapja:** a Library-űrlap (`submit-form.tsx`), a Fordítás (`post-toolbar.tsx`), a Mentés és az Újrakinyerés (`post-editor.tsx`) hibája. A semleges állapotsorok (beküldve, elindult, várakozási idő) maradnak `role="status"`.
- **A Library-űrlap:**
  - A sikersor eltűnik, amint a tag újra gépel. Ma soha nem tűnik el.
  - Az URL-t az űrlap a beküldés saját szabályával ellenőrzi (`parseSubmittedUrl`, `noValidate`). A hiba a közös hibasorban jelenik meg, az oldal nyelvén. Ma a böngésző buborékja szól, a böngésző nyelvén.
- **Olvasási hiba** (`lib/content.ts`):
  - A tartalom olvasásai dobnak, ahogy az R1 óta a `getRadar`: a `getPosts`, a `getOpenSources` és a `getPost`. Így a lekérdezés hibája az `app/error.tsx`-et hozza „Újra” gombbal. Ma a `/library` üres listát mutat, a poszt oldala 404-et.
  - Ami nem dob: az olvasó saját jelölései (`getReadPostIds`). Hibánál üres halmazt ad és naplóz, így a kártyák nem halványulnak el, de az oldal megmarad.
  - A `getPost` csak hiba nélküli, üres válaszra ad `null`-t, és csak akkor jön a 404.
- **Ami marad:** a teendő törlésének hibája 5 másodperc múlva jelenik meg, mert a törlés csak a visszavonás lejártakor íródik be (DESIGN.md → Undo toast).

## 3. Nyomás és érintés

- **Benyomódás:**
  - A gomb, a chip és a menüpont lenyomva 2 px-et csúszik jobbra le.
  - A színe:
    - világos felületen ink háttér, paper szöveg;
    - ink felületen narancs háttér, ink szöveg. Ink az inken nem látszana, és az ink felületen a narancs a jelölés színe (DESIGN.md → Colors).
  - Az árnyékos kattintható elem (a taiyaki, `.lift`) az árnyéka eltolásával csúszik, és az árnyéka eltűnik: „beleül”.
  - A Library- és az archívum-kártyák (`library-view.tsx`, `archive-view.tsx`) ink felületen a narancs színt és a 2 px-et kapják.
  - A Top 3 és a hírkártyák nem linkek. A gombjaik kapják a benyomódást, maguk a kártyák nem.
  - **Hol:** a házi gombváltozatok (`components/ui/button.tsx`: `ink`, `signal`, `brutal`), a kategória-chipek (`digest-dashboard.tsx`), a menüpontok (`nav-parts.tsx`) és a `globals.css` kártyaszabályai. Az `:active` nem függ a hovertől, így érintésen is látszik.
- **A chipek hovere:** a ház hover-nyelvén 3 px-es narancs eltolt árnyék, csak egérrel (`hover: hover`). Ma nincs hover.
- **Mozgás:**
  - A toast 160 ms alatt csúszik be 8 px-ről és jelenik meg, és 160 ms alatt halványul el. A kilépéshez 160 ms-ig felcsatolva marad.
  - A gyári Sheet (`components/ui/sheet.tsx`) ma 500/300 ms, a Dialog (`components/ui/dialog.tsx`) 200 ms: mindkettő 160 ms-ra vált, a ház idejére.
- **Csökkentett mozgás:** se a hover, se a lift, se a fókusz, se a nyomás nem mozdít el semmit (`transform`). A színek és az árnyékok ugyanúgy változnak.
  - **Ma még mozdul:** a `.must-card` és a `.story-card` hovere, a repó-sor `hover:-translate-y-0.5`-je, és az új `active:` eltolás.
  - A Tailwind-osztályok `motion-safe:` előtagot kapnak, a `globals.css` szabályai pedig egy `prefers-reduced-motion: reduce` blokkot.
- **Érintési méret:** a zsugorítás csak finom mutatóval jön (`pointer-fine:`).
  - Ma minden `sm:` szélességen 32 px-re zsugorodik a gomb, érintőképernyős tableten is: `story-card.tsx` (Később, teendő, Olvastam), `reader-panel.tsx` (törlés), `digest-dashboard.tsx` (a haladás-pill).

## Nem része az R2-nek

- **Az elrendezés (R3):** a fekvő mobil kerete, a széles képernyő, a panel és a chat takarása `md` és `2xl` között, a taiyaki kerete az ink oldalakon.
- **A retry 403-a és 404-e:** ma egyik sem fordulhat elő (TODO.md).
- **A `loginHref` query stringje** és az **iOS safe area:** TODO.md → Responzívabb UI/UX.

## Ellenőrzés

- **Egységtesztek, mutációs próbával:**
  - a chat optimista bejegyzése és a hiba utáni visszaírás;
  - az összevont válasz;
  - a teendő visszaírása;
  - a dobó olvasások, és hogy a `getReadPostIds` nem dob;
  - az újrakinyerés frissítésének leállása;
  - a hibasor `role`-ja.
- **Playwright az előnézeten** (`/dev/preview`, `&slow=1`, `&fail=1`), 360, 768 és 1280 px-en:
  - a saját buborék 100 ms-on belül megjelenik;
  - a szöveg visszakerül a mezőbe;
  - a hibasor kontrasztja legalább 4,5:1;
  - a lenyomott állapot `transform`-ja `reduce` emulációval nincs;
  - érintés-emulációval (`hasTouch`, `pointer: coarse`) minden kattintható elem legalább 40 px.
- **Dokumentáció:** DESIGN.md (a lenyomott állapot, a hibasor, a Motion), CLAUDE.md (az újrakinyerés frissítése, az olvasási hibák), TODO.md.
