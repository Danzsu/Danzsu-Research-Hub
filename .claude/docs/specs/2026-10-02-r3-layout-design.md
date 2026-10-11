# R3 „Elrendezés” — terv

**Állapot:** jóváhagyva (2026-10-02), a beszélgetésben
**Sorrend:** a reszponzív munka harmadik része (R1 Gyors → R2 Visszajelzés → R3 Elrendezés). A Google-belépés után készül.
**Kapcsolódó:**
- `.superpowers/ux-audit/2026-09-27-responsive-audit.md` (git-ignorált) → 2. fejezet és az 5–8. téma;
- TODO.md → Responzívabb UI/UX;
- DESIGN.md → Layout.

## Cél

Minden képernyőn jó legyen az elrendezés, a 360 px-es telefontól a széles monitorig: a tartalom kerüljön előre, semmi ne takarjon semmit, és semmi ne nyúljon szét.

**Siker** (Playwright az előnézeten, előtte–utána számokkal):
- **740×360:** görgetés közben a rögzített keret legfeljebb a képernyő 20%-a (ma 52%).
- **360×740:** a Radar első kártyája legfeljebb 420 px-nél kezdődik (ma 580). A Library első kártyája legalább 100 px-szel feljebb kerül.
- **A Top 3:** egyik szélességen sem keskenyebb, mint 1440-en, és 1536-on sem szűkül.
- **A `LIBRARY//` és az `ARCHIVE//`** sehol nem törik szó közben.
- **1920 px-en:**
  - a hírkártya legfeljebb 900 px széles;
  - a poszt figyelmeztetései és a © sor legfeljebb 75 karakter;
  - az Archívum és a Library rácsa kitölti a sort.
- **A rétegek:**
  - a teendő-panel és a chat soha nincs egyszerre nyitva;
  - a taiyaki ink oldalon is látszik;
  - a sarok-taiyaki nem takarja a teendő-oszlop utolsó sorát.
- **Vízszintes görgetés** egyik méreten sincs.

## 1. Telefon

- **Alacsony képernyő:** kb. 500 px magasság alatt (`max-height: 31.25rem`) a Radar és az AI cégek fejléce és chip-sávja (`digest-dashboard.tsx`, ma `sticky`) elgördül az oldallal. Csak az alsó sáv marad. Álló módban és asztalon minden marad, ahogy van.
- **A Radar heroja telefonon** (`sm` alatt):
  - az állapotsor (AUTO, frissítve) és a cím marad, alattuk egy egysoros sor a lezárás dátumával és az állapottal;
  - a bevezető szöveg és az archívum-doboz `sm`-től látszik;
  - a hero függőleges térköze kisebb.
- **A Library és az Archívum heroja telefonon** (`PageHero`, `HeroBand`): a bevezető szöveg `sm`-től látszik, és a térköz kisebb. A Library-űrlap marad.

## 2. Középső szélesség

- **A teendő-oszlop** a Radar saját szélessége szerint jelenik meg, nem a képernyő `2xl` töréspontja szerint.
  - **Mikor:** a Radar gyökere container lesz, és az oszlop csak akkor kerül a hírek mellé, ha a Top 3 így is legalább olyan széles, mint ma 1440-en (kb. 1520 px-es Radar-szélességtől).
  - **Alatta:** a mai pill-gomb és a lenyíló panel marad.
  - **Feltétel:** a container nem kerülhet olyan elemre, amelyben `position: fixed` gyerek van, mert a layout containment azt a containerhez kötné. A Sheet-ek portálon renderelődnek, így nem érintettek.
- **A `PageHero` címe** a saját oszlopához méreteződik (`cqi`), ahogy a Radar címe (`15cqi`), nem a képernyőhöz (ma `11vw`). A cím oszlopa lesz a container, nem az egész sáv, mert a Library-n mellette ül az űrlap.

## 3. Széles képernyő

- **A hírkártya** (`story-card.tsx`) legfeljebb kb. 900 px széles, a gombsora a kártyán belül marad. A Top 3 rácsa nem változik.
- **75 karakteres sorok:** a poszt figyelmeztetései (`post-notices.tsx`) és a © sor (`post-article.tsx`) legfeljebb 75ch, ahogy a blokkok. A Library nyitott forrásainak sorai és az üres állapotok mono szövegei is.
- **Az Archívum és a Library rácsa** a saját szélességéhez igazodik: 1, 2, 3, majd 4 oszlop. A mai középre zárt `max-w-6xl` (1152 px) helyett egy szélesebb közös korlát jön, amely a hero tartalmára és a rácsra is vonatkozik, hogy a kettő egy vonalban maradjon.

## 4. Rétegek

- **Egyszerre csak egy:**
  - A teendő-panel és a link-chat közül mindig legfeljebb az egyik van nyitva: ha az egyik megnyílik, a másik bezárul.
  - A panel nyitott állapota az app shellbe kerül a chat mellé, mert ma a `DigestDashboard` saját, vezéreletlen `Sheet`-je.
  - A chat fókusz-visszaadása (`shownOpener`) nem változik.
- **A sarok-taiyaki** nyugalmi árnyéka narancs lesz (`4px 4px 0 var(--signal)`, mint a mobil sávon). Így az ink oldalakon (Library, Archívum) is látszik. A hover és a lenyomás nem változik.
- **A teendő-oszlop alja** annyi helyet kap, hogy a sarok-taiyaki ne takarja az utolsó teendőt.

## Nem része az R3-nak

- **Az iPhone safe area** (`viewport-fit=cover`): eszköz nélkül nem tesztelhető, és a bal és jobb oldali kivágás kezelését is kívánná. Parkolva marad (TODO.md).
- **A panelek Tab-hurkai** és a „Tab a gomb után körbejár” eset. Parkolva maradnak.
- **Görgetésre elbújó fejléc:** a tulajdonos a CSS-es, alacsony képernyős megoldást választotta.
- **Két oszlopos hírfolyam:** a tulajdonos az olvasható szélességet választotta.
- **Az R2 halasztott apróságai** (a gyerekelemek színe lenyomás közben, a chat ritka versenye, a toast tartalék-időzítője).

## Ellenőrzés

- **Playwright az előnézeten:** 360×740, 740×360, 768×1024, 1280×800, 1536×864 és 1920×1080 px-en, a `radar`, `companies`, `library`, `archive` nézeten és a `/dev/preview/post`-on.
  - **Előtte–utána számok:**
    - az első kártya teteje;
    - a rögzített keret aránya görgetés közben;
    - a Top 3 kártyaszélessége;
    - a hírkártya szélessége;
    - a `h1` sorainak száma;
    - a rács oszlopszáma;
    - a figyelmeztetések szélessége karakterben.
  - **Mindig:** `scrollWidth ≤ innerWidth`.
- **Egységteszt** csak ott, ahol logika van: a panelek kizárólagossága (melyik nyílik, melyik zárul). Osztálynév-tesztet nem írunk.
- **Doksi:** DESIGN.md → Layout (a container-töréspontok, a teendő-oszlop, a kártya szélessége, a taiyaki árnyéka), CLAUDE.md → App shell (a panelek kizárólagossága), TODO.md.
