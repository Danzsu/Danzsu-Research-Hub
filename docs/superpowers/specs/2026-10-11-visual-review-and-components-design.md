# Vizuális audit, ergonómia és új komponensek (2a) — specifikáció

Dátum: 2026-10-11. A három alprojekt 2. részének első csomagja. Előfeltétele az 1+3 csomag (`2026-10-11-codebase-order-and-config-design.md`). A 2b (keresés), a 2c (dashboard) és a 2d (chat, embedding) külön specet kap, ennek a döntéseire építve.

## Cél

Az oldal ergonómiájának átnézése képernyőnként, a talált hibák javítása, a már jóváhagyott R3 „Elrendezés” spec beépítése, a belépés és kilépés rendbetétele, és néhány új, közös komponens és egy mozgás-könyvtár bevezetése a megadott források alapján. **A márka marad:** cream/ink/signal, 2 px keretek, zéró lekerekítés, mono eyebrow, `//` a címek végén (DESIGN.md → Deliberate brand choices). Ez a spec nem cseréli le a design-rendszert, hanem a meglévőt teszi következetessé és teljessé.

## Az audit módszere

Playwright az offline előnézeten (`/dev/preview`, minden nézet) és a két nyilvános oldalon, 360, 768, 1280 és 1680 px szélességen; képernyőképek és mérés: vízszintes görgetés, az érintési célok mérete, a 11 px alatti szövegek száma, a címek tördelése. A frontend-design és a design-taste-frontend skill szempontjai szerint (hierarchia, a mozgás csak műveletre válaszol, a szerkezet információ, egy helyre költött merészség), a DESIGN.md elveit alapul véve.

## Leletek (a súlyosság sorrendjében)

| # | Hol | Mi a baj | Bizonyíték |
| --- | --- | --- | --- |
| L1 | Hírkártya (Radar, AI cégek, Top 3) | **Nyolc egyenrangú vezérlő egy sorban:** Forrás, Olvasd itt, 👎 👍 ❤, Később, Teendő, Elolvastam. Nincs elsődleges művelet, 768-on és 360-on 2–3 sorba tördel, a Teendő ikon egyedül marad egy új sorban. | `companies@768`, `radar@360` képek; 130 interaktív elem egy Radar-oldalon |
| L2 | Library, Gyűjtemény hero | **A cím szó közben törik:** `LIBRA / RY//`, `GYŰJTEMÉN / Y//` 1280-on, mert a cím a képernyőhöz (`11vw`) méreteződik, nem a saját oszlopához, és az `overflow-wrap:anywhere` bárhol enged törést. | `library@1280`, `collection@1280` |
| L3 | Minden másodlagos oldal | **A hero túl magas:** 350–430 px a tartalom előtt (GitHub, Archívum, Gyűjtemény), egy sor leaddel. A lista csak a második képernyőn kezdődik. | `github@1280`, `archive@1280` |
| L4 | Radar, kártyák, panel | **10 px-es mono szövegek:** 80 előfordulás egy Radar-oldalon (dátum, SCORE, perc, tagek, a panel lábléce). A ház 11–12 px-es minimumot enged, a 10 px alatta van. | mérés: `textUnder11px: 80` |
| L5 | Hírkártya állapotai | **Három halványítás, egy jelentés nélkül:** az olvasott kártya halvány, a 👎-os halvány és szaggatott, a „Később” jelölt kártyán nincs látható nyom a gombon kívül. Az olvasó nem tudja ránézésre, melyik melyik. | `radar@1280`, a Top 3 harmadik kártyája |
| L6 | Oldalsáv alja | **Zsúfolt fiók-sor:** e-mail csonkolva („preview@example.…”), mellette „Sign out →”, alatta a nyelv, a súgó és az összecsukás négy külön elem. A „Statistics soon” és „Chat soon” inaktív sorok helyet foglalnak. | `library@1280` bal oszlop |
| L7 | `/login` | **Magányos kártya ink háttéren,** a landingtől eltérő keretben, a landing „Belépés” gombja ide vezet, és innen nincs út vissza a landingre. | `login@1280` |
| L8 | Kilépés | A kilépés a `/login`-ra visz, nem a landingre; nincs visszajelzés. | `app/auth/signout` |
| L9 | Mozgás | A hover-emelés, a lenyomás és a sheet-ek CSS-átmenetei jók, de az **értékelés-nyomásnak, a toastnak és a chat nyitásának nincs mozgása,** így a visszajelzés egy része csak színváltás. | DESIGN.md → Motion |
| L10 | Library rács 1280+ | Két oszlop, a harmadik hely üres 1280-tól; az R3 1–4 oszlopot ír elő. | `library@1280` |
| L11 | A Radar panel lábléce | „INVITE-ONLY PROFILES / DAILY RUN 05:00 UTC / WEEKLY FREEZE” 10 px-es mono, dekoráció, nem információ. | a tulajdonos képernyőképe |
| L12 | Üres állapotok | Háromféle üres állapot (Radar szaggatott doboz, Library mono sor linkkel, GitHub/Gyűjtemény mono sor), nincs közös komponens. | DESIGN.md → Empty states |

Ami **jó, és marad:** a Radar heroja a jelrács-háttérrel; a Top 3 és az archívum sorszámai (valódi sorrend); a poszt oldal tipográfiája; az `/about` landing; a pending dot és a frissítő sáv; a 40 px-es érintési célok érintőképernyőn (a 32 px csak finom mutatóval, ahogy a DESIGN.md engedi).

## Döntések

### D1. A hírkártya vezérlői: egy elsődleges, egy eszközsor, egy lezárás

```
+------------------------------------------------------------------+
| 09 / 21 · example.test ↗                               SCORE 95  |
| Sample story: companies-2026-W39-yesterday                        |
| A two-sentence summary…                                           |
| ▌ WHY IT MATTERS  Why it is worth reading.                        |
| #inference #open-weights                                          |
|                                                                   |
| [ Olvasd itt ]   [👎][👍][❤]  [🔖][☑]            [ ✓ Elolvastam ] |
+------------------------------------------------------------------+
```

- **Elsődleges:** „Olvasd itt” (`brutal` gomb; ha már van poszt, link rá, különben a taiyaki). A **forrás** a kártya tetejére megy, a meta sorba, `example.test ↗` alakban (link új lapon, `min-h-10`): így egy gomb kevesebb a sorban.
- **Eszközsor:** a 👎 👍 ❤ csoport, mellette a Később (🔖) és a Teendő (☑) ugyanabban a méretben és stílusban (`brutal icon`, `size-10 sm:pointer-fine:size-8`), egy közös `CardToolbar` komponensben, `gap-1`, hogy egy egységnek látsszon.
- **Lezárás:** „✓ Elolvastam” a sor jobb végén marad (`ml-auto`), a kártya egyetlen `ink`-stílusú kapcsolója.
- **Tördelés:** a sor `flex-wrap`, 360-on két sorba: fent az Olvasd itt + az eszközsor, alatta jobbra az Elolvastam. A Teendő ikon soha nem marad egyedül: az eszközsor egy `flex` egység, együtt tördel.
- A billentyűparancsok (`o`, `r`, `l`) nem változnak.

### D2. Címek: a saját oszlophoz méretezve, szó közben soha

- A `PageHero` címe a saját oszlopához méreteződik (`cqi`, az R3 2. pontja), `overflow-wrap: normal` és `hyphens: manual`, a méret felső korlátja úgy, hogy a `GYŰJTEMÉNY` és a `LIBRARY` 1280-on egy sorban elférjen a Library-űrlap mellett is. Ha egy cím mégsem fér el (a hosszú magyar összetett szavak), a `[overflow-wrap:anywhere]` csak `sm` alatt marad, ahol a kijelző keskenyebb a szónál.
- **A másodlagos heroja alacsonyabb:** a `HeroBand` `py-10 sm:py-16` helyett `py-8 sm:py-10`, a lead `mt-4`; a Radar saját heroja nem változik. A Library űrlapja a hero jobb oszlopában marad.

### D3. Egy tipográfiai padló: 11 px

- A `text-[10px]` minden előfordulása `text-[11px]` lesz (tagek, a kártya meta oszlopa, a panel pill-je), a `tracking` arányosan csökken. A DESIGN.md Typography szakasza rögzíti: mono meta 11–12 px, soha kisebb.
- A Radar panel lábléce (L11) megszűnik; a „DAILY RUN 05:00 UTC · WEEKLY FREEZE SUN 24:00” egy sorban a hero állapotsorába kerül, ahol már ott az „AUTO / Daily refresh”.

### D4. A kártya három állapota, három jel

| Állapot | Jel | Miért |
| --- | --- | --- |
| Olvasott | `opacity-60`, a cím `text-ink/70`, a sor végére kerül | ahogy ma |
| 👎 | szaggatott keret (`dislikedClass`), **nem** halványabb | a szaggatott „ez nem kell” |
| Később | a kártya bal felső sarkában egy signal könyvjelző-fül (`absolute`, 3 px széles signal sáv a bal szélen + a 🔖 ikon telt) | látható a gomb nélkül is |

A DESIGN.md „must-card and story-card” szakasza ezt a táblázatot kapja, a `dislikedClass` opacitása kikerül.

### D5. Oldalsáv: fiók-menü, a halott sorok ki

- **Fiók-menü** az oldalsáv alján: egy sor az avatárral (a név első betűje signal körben) és a teljes e-mail-címmel (csonkolás helyett `[overflow-wrap:anywhere]`, 11 px mono), kattintásra egy `Popover` (a házi `components/ui/popover.tsx`): a cím, **Nyelv** (HU/EN kapcsoló), **Súgó** (a billentyűparancsok), **Kilépés →**. Ugyanez a rail módban az avatár gombon. Mobilon a „Több” sheet alján ugyanez a három sor.
- A **„Statistics soon”** és **„Chat soon”** sorok kikerülnek a menüből: a Statisztika a 2c dashboardjával tér vissza élőként, a Chat a taiyaki. A `soon` jelölő a `NavItem`-ben marad a jövőre.
- Az összecsukás gombja marad az oldalsáv alján, a fiók-sor alatt.
- Minta: Untitled UI „account menu / user dropdown” és FlexyUI navbar-mintái, házi stílusban újraírva (nem függőség).

### D6. Belépés a landing keretében, kilépés a landingre

- A `/login` a `PublicPage` keretét kapja (fejléc a logóval és a nyelvváltóval, lábléc), közepén a mai kártya; az `ErrorLine` és a „link úton van” állapot marad. A `StatusCard` megmarad a hiba- és 404-oldalnak.
- A landing „Belépés” gombja és fejléc-linkje a `/login`-ra visz, ahogy ma; a landing saját belépő szakasza marad.
- **Kilépés:** `app/auth/signout` a `/about`-ra irányít, `?signed_out=1`-gyel, és az `/about` fejléce egy sort mutat: „Kijelentkeztél.” / „You're signed out.” (`role="status"`), ami a következő kattintásra eltűnik. A fiók-menü Kilépés sora ugyanide vezet.

### D7. Mozgás: a `motion` könyvtár, csak műveletre válaszul

- **Függőség:** `motion` (MIT, React 19, a `framer-motion` utódja), pontos verzióra rögzítve, **legalább 7 napos kiadás** (a 14.1.0 2026-10-09-i, a megvalósítás napján kell ellenőrizni; ha túl friss, a 14.0.x). Az `anime.js` elvetve: DOM-imperatív, React alatt kézi életciklust kíván; a HyperFrames CSS-skill videókhoz való.
- **Hol:** négy helyen, mindegyik egy műveletre válaszol (DESIGN.md 5. elv):
  1. a **sheet-ek és a dialógusok** be- és kilépése (`AnimatePresence`, 160 ms, a mai időzítés);
  2. a **toast** be- és kiúszása;
  3. az **értékelés-nyomás:** a megnyomott gomb 1 → 0.92 → 1 rugó (`spring`, ~150 ms), a ❤ ikon telítődése;
  4. a **taiyaki** nyitásakor a panel skálázása a gombból (`layoutId`).
- **Reduced motion:** `useReducedMotion()` → minden időtartam 0, csak a színváltás marad (a mai szabály).
- **Nem:** belépő animáció a tartalomra, parallax, görgetésre induló effektek, végtelen hurkok.
- A CSS `.press` szabályok maradnak; a Motion csak oda jön, ahol a CSS-átmenet nem tud (kilépés, rugó, layout).

### D8. Új közös komponensek (`app/components/`)

| Komponens | Mire | Minta |
| --- | --- | --- |
| `CardToolbar` | a hírkártya eszközsora (D1), a poszt-oldal eszközsora is ezt használja | — |
| `AccountMenu` | D5 | Untitled UI user dropdown |
| `EmptyState` | egy közös üres állapot: ikon, egy mondat, egy opcionális link; ink és cream változat | Untitled UI empty states |
| `StatTile` | egy szám, egy címke, egy opcionális trend; a Radar panel „Weekly progress”-e ezt használja már most, a 2c dashboard később | Untitled UI metrics |
| `Kbd` | billentyű-jelvény a súgóban és a Keresés sorban (`⌘K`) | — |

Mind a ház stílusában, Tailwind-osztályokkal, `data-slot`-tal, teszttel. Az Untitled UI React (React Aria) és a FlexyUI kódja **nem** kerül be: más alapokra épülnek (React Aria, saját token-rendszer), és egy 2 px-es ink keretet egyszerűbb megírni, mint átfesteni.

### D9. Az R3 „Elrendezés” spec beépül

A `2026-10-02-r3-layout-design.md` minden pontja ennek a csomagnak a része, változatlanul: telefon (alacsony képernyő, a hero telefonon), középső szélesség (a teendő-oszlop a Radar szélessége szerint, `cqi` címek), széles képernyő (a hírkártya ≤ 900 px, 75ch sorok, 1–4 oszlopos rácsok), rétegek (egyszerre egy panel, a sarok-taiyaki árnyéka). A D2 és az L10 ezekre épül.

### D10. Ami nem része a 2a-nak

- Keresés (2b), dashboard (2c), chat-bővítés és embedding (2d).
- A `bklit` chart-könyvtár: a 2c dönt róla (licenc és méret ellenőrzése után; tartalék a már bent lévő `recharts`).
- Új betűtípus, sötét téma, lekerekítés: a DESIGN.md tiltja, marad.

## Tesztelés

- Az öt ellenőrzés; a DESIGN.md kivonat-tesztjei az új kivonatokkal.
- Új tesztek: `CardToolbar` (a gombok sorrendje és neve, az Elolvastam a sor végén), `AccountMenu` (a három sor, a kilépés hrefje), `EmptyState`, `StatTile`, `Kbd`; a `signout` route (`/about?signed_out=1`); a `/login` a `PublicPage` keretében (a két űrlap és a hibasor marad).
- `lib/client-bundle.test.ts`: a `motion` csomag a kliens-gráfban van, de a zod-szabály változatlan.
- **Playwright az előnézeten,** ugyanazzal a mérő-szkripttel, mint az audit: nincs 10 px alatti szöveg; nincs szó közbeni törés a címekben 360/768/1280/1680-on; a hírkártya sora 360-on két sorba tördel és a Teendő nem áll egyedül; a hero magassága a másodlagos oldalakon ≤ 300 px 1280-on; nincs vízszintes görgetés; `prefers-reduced-motion` alatt az értékelés-nyomásnak nincs transzformációja.
- **Élő próba a deploy után:** kilépés → landing a „Kijelentkeztél” sorral; a fiók-menü telefonon és asztalon; a kártya eszközsora egy valódi telefonon.

## Kiadás

Egy branch (`visual-review`), egy PR. Migráció nincs. Egy új függőség (`motion`), a lockfile-lal. A DESIGN.md frissül minden döntéssel (a Typography padló, a kártya állapotai, a Motion szakasz, az új komponensek).
