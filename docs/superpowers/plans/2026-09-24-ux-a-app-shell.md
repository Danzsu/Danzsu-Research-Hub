# UI/UX A mérföldkő: app-keret, ergonómia, offline előnézet — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minden bejelentkezett oldal közös keretet kap (asztalon oldalsáv, mobilon ötgombos alsó sáv). A Radar és a Library kevesebb kattintással és hüvelykujjal is kezelhető, a nyelvváltás a listaoldalakon frissítés nélkül működik, és az egész felület élő adat nélkül, egy fejlesztői előnézeten is ellenőrizhető.

**Architecture:**
- **Keret:** az `app/(app)/layout.tsx` minden bejelentkezett oldalt az `AppShell`-be csomagol. Ebben van a nyelvi kontextus, a `DesktopNav` (az A változat, egyetlen cserélhető fájl, ~56 px-es ikonsávvá csukható), a mobilos alsó sáv a „Több” panellel, a keresés helyfoglalója, a billentyűsúgó és a visszavonás-csík. Minden menüpont a `lib/nav.ts`-ből jön. Az oldalsáv állapotát (`full` | `rail`) a `nav` cookie őrzi meg, egy tiszta függvény (`lib/nav-mode.ts`) olvassa, a szerver ez alapján rendereli a keretet, villanás nélkül.
- **Olvasói állapot:** egy keretrendszer-független tár (`lib/reader-store.ts`) intézi az optimista írást. Egy kulcson a kérések sorban mennek ki, hibánál a felület a szerver által utoljára megerősített értékre áll vissza. A React-kötés (`use-reader-state.ts`) vékony.
- **Tiszta logika a `lib/`-ben:** menü, billentyűk, rendezés, visszavonás-sor, útvonal-szabályok és mintaadatok. Mindet `node --test` teszteli, a TSX vékony marad.
- **Előnézet:** az `app/dev/preview` a valódi nézet-komponenseket rendereli mintaadatokkal, hálózat és bejelentkezés nélkül, csak fejlesztői módban.

**Tech Stack:** Next.js 16.3.4 App Router (route group, `usePathname`, `notFound`), React 19.2.6 (`useSyncExternalStore`, `useEffectEvent`), Tailwind 4, a meglévő `radix-ui` Dialog és Sheet, `lucide-react`, Supabase (`item_states`, `todos`, séma-változás nélkül), `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-24-ux-signals-search-design.md`. Ez a terv az 1. fejezetet (A mérföldkő) valósítja meg, a 4. és 5. fejezet A-ra vonatkozó részével együtt. A B (értékelés, GitHub-fül) és a C (keresés, lapozás) külön tervet kap. Ez a terv csak a helyüket hagyja meg: a kártya láblécében az értékelő skála helyét, és a ⌘K-palettát egy „hamarosan” párbeszédablakként.

**Háttér:** `.superpowers/brainstorm/ux-audit.md` (16 ergonómiai pont, fájl- és sorhivatkozással) és `.superpowers/brainstorm/codebase-audit.md`, amelynek 11–13. javaslata ide tartozik.

**Előfeltétel és sorrend:**
- A végrehajtás csak azután indul, hogy az M1 (a `unified-post-template` ág 1–15. feladata) bekerült a `main`-be. Új ág a `main`-ről: `git switch -c ux-a-app-shell main`.
- **Minden fájlt olvass újra szerkesztés előtt.** A terv a 2026-09-24-i kódhoz készült, de az M1 utolsó feladatai még változtatnak rajta:
  - a 13. feladat átírta az `app/library/[id]/page.tsx`-et, és létrehozta a `post-editor.tsx`-et és az `app/api/posts/[id]/route.ts`-t;
  - a 15. feladat az oldalakat `getReader()`-re állítja, létrehozza a `lib/state.ts`-t (`parseStateAction`), a `fakeDb`-t a `lib/pipeline/fake-db.ts`-be költözteti, a `toPost`-ot a `lib/post-view.ts`-be viszi, átírja a README-t, és a `CLAUDE.md`-be felveszi a copy-objektum szabályt.
- Ha a terv „előtte” részlete eltér a fájltól, a fájl az irányadó: az M1 újabb sorait tartsd meg, és csak ennek a tervnek a változtatását vidd át.

## Global Constraints

- **Node és tesztek:** Node `>=22.13.0`. A tesztek `node --experimental-strip-types --test`-tel futnak (`npm test` = `lib/**/*.test.ts`). A `lib/` új fájljai **relatív `.ts` importot** használnak, `@/` nélkül, és nem importálnak Reactot vagy `server-only`-t (típus `import type`-pal jöhet).
- **Új függőség nincs.** A `package.json` és a `pnpm-lock.yaml` nem változik. Csak a meglévők használhatók: `radix-ui` (Dialog, Sheet), `lucide-react`, React 19.2 (`useSyncExternalStore`, `useEffectEvent`). A `components/ui/command.tsx` a C mérföldköré, A-ban nem kell. A `sonner` és a `vaul` sem kell: a visszavonás-csík saját komponens.
- **`npx shadcn add` tilos.** A `components/ui` fájljain csak kézi, a `CLAUDE.md`-ben dokumentált javítás lehet.
- **Design, `CLAUDE.md` „Design language”:**
  - `--radius` és `--radius-sm/md/lg/xl` = 0;
  - csak rendszerbetű (`.font-display` Arial Black/Impact 900, `.font-mono` Courier New);
  - kemény, elmosás nélküli árnyék (`5px 5px 0 var(--ink)` → hoverre `8px 8px 0 var(--signal)`);
  - átmenet 160ms ease;
  - egyetlen, fix téma (nincs `.dark`, nincs `prefers-color-scheme`);
  - tokenek: `--ink #141414`, `--paper #fbefca`, `--cream #f8e8b4`, `--signal #f15f22`, `--cyan #59e1e8`. Osztálylistában `#141414` helyett `var(--ink)`.
- **Reszponzív szabályok:**
  - 360 px-en nincs vízszintes görgetés;
  - az érintési felület legalább 40 px (`min-h-10`, `size-10 sm:size-8`);
  - a fő oszlopban konténer-lekérdezés (`@container`, `cqi`, `@3xl:`), nem `vw`;
  - `dvh`, nem `vh`;
  - a `globals.css` saját `:hover` szabályai csak `@media (hover: hover)` alatt;
  - `rounded-full` csak szándékosan (avatar, nyelvi pirula, élő pont).
- **Alsó sáv:** csak `md` alatt. A sáv figyelembe veszi az `env(safe-area-inset-bottom)`-ot, a tartalom alján `calc(4rem + env(safe-area-inset-bottom))` a hely. Tailwind-ben aláhúzással írd: `pb-[calc(4rem_+_env(safe-area-inset-bottom))]`. A `viewport-fit` marad az alapértelmezett: így az iOS a biztonságos területen belül rendez, az `env()` 0, de egy későbbi `cover` mellett is jó lesz.
- **Visszavonás-csík:** egyszerre egy, 5 másodperc, `aria-live="polite"`. Új csík érkezésekor a régi művelet végleges.
- **Billentyűparancsok:** nem futnak `input`, `textarea`, `select` és `contenteditable` elemen. A görgetés figyelembe veszi a `prefers-reduced-motion` beállítást.
- **Előnézet:** csak fejlesztői módban létezik. Mindkét oldala (`app/dev/preview/page.tsx`, `app/dev/preview/post/page.tsx`) `notFound()`-ot hív, ha `process.env.NODE_ENV !== "development"`. A `proxy.ts`-kivétel is csak fejlesztői módban él.
- **Posztok olvasottsága:** az `item_states` táblában, `post:<id>` kulccsal, séma-változás nélkül (`char_length(item_id) <= 120`).
- **Az `item.id` örökre stabil** (`CLAUDE.md`, Data contract). Ez a terv id-t nem képez és nem ír át.
- **Modellnév nem kerül a kódba.**
- **Felületi szövegek:** HU/EN, a kódazonosítók angolok. Komponensenként egy `copy` objektum; inline `language === "hu" ? … : …` és csak angol címke nem maradhat.
- **Duplikáció:** minden feladat végén `npm run dup` (jscpd, 6 sor / 60 token), 0 klón. Segédfüggvény írása előtt keress rá (`grep -rn`), és a meglévőt használd. Közös helyek:
  - `lib/api.ts` (`jsonError`)
  - `lib/supabase/server.ts` (`getReader`)
  - `lib/pipeline/util.ts` (`parseId`, `hostOf`, `publishedLabel`)
  - `lib/blocks.ts` (`assignIds`, `blockSchema`, `parseBlocks`)
  - a `Button` `ink` / `signal` / `brutal` variánsa, a `focus-ring` utility, a `PageHero`
- **Next.js 16** (ellenőrizve a `node_modules/next/dist/docs/01-app/` alatt):
  - `03-api-reference/03-file-conventions/route-groups.md`: a `(folder)` nem része az URL-nek; két csoport nem adhatja ugyanazt az útvonalat; teljes újratöltés csak több gyökér-layout között van, itt egy van.
  - `03-api-reference/03-file-conventions/layout.md`: a layout navigáláskor nem renderelődik újra, és nem olvashatja az útvonalat („Pathname” szakasz). Az aktív menüpontot kliens-komponens dönti el `usePathname`-mel (a doksi „active nav links” példája). Ezért az oldalak maguk ellenőrzik a belépést, a saját `?next=` paraméterükkel.
  - `03-api-reference/04-functions/not-found.md`: a `notFound()` dob. A render-úton, minden `await` előtt kell hívni.
  - `03-api-reference/03-file-conventions/loading.md`, „Status Codes”: ha a válasz már streamel (például egy `loading.tsx` miatt), a státusz 200 marad. Ezért a `loading.tsx` az `(app)` csoportba költözik, és a `/dev/preview` fölött nincs töltő-határ, így élesben valódi 404-et ad.
  - `03-api-reference/04-functions/use-pathname.md`.
  - `03-api-reference/03-file-conventions/proxy.md`: a kísérleti `unstable_doesProxyMatch` helyett tiszta segédfüggvényt tesztelünk (`lib/public-paths.ts`).
  - Az oldalak megtartják az `export const dynamic = "force-dynamic"` sort.
- **Az M1 `lib/state.ts`-e:** ha a POST `/api/state` akcióit típusként exportálja, és az elfogadja a 6. feladat `StateWrite` négy alakját, akkor a `StateWrite` helyett azt importáld (`import type`).
- **Commitok:** Conventional Commits, kisbetűs tárgy, attribúció nélkül.

## Review Focus

1. **Gépelés közben leütött billentyű.** Ilyen például a `j`, `r`, `o`, `?` vagy `/` a teendő-mezőben, a beküldő űrlapon vagy egy `contenteditable` elemen, valamint a Ctrl+R és az AltGr-es karakterek. Elvárás: a parancs nem fut, a karakter a mezőbe kerül, a böngésző saját parancsai működnek. Tesztje: 9. feladat, `nothing fires while typing, whatever the key` és `browser combos stay the browser's…`, plusz a 11. feladat Playwright-lépése.
2. **Dupla kattintás egy műveleten:** Megnyitás kétszer, „+ teendő” kétszer, Később gyorsan kétszer. Elvárás: egy olvasott-jelölés és egy csík, egy teendő, és a szerver a kattintások sorrendjében kapja az írásokat. Tesztje: 6. feladat, `setting a flag to its current value sends nothing`, `a second to-do for the same item is refused` és `a quick double toggle reaches the server in click order`; 5. feladat, `undo runs once and never commits…`.
3. **Írás hálózat nélkül:** a `fetch` `TypeError`-t dob, nem `!ok` választ ad. Elvárás: a változás visszaáll a szerver által utoljára megerősített értékre, megjelenik a hibacsík, és a törölt teendő visszakerül. Tesztje: 6. feladat, `an offline write rolls back…`, `when the newest of several writes fails…`, `a committed delete that fails offline…` és `an added to-do shows at once… a failed one disappears`, plusz a 11. feladatban a `?fail=1` Playwright-lépés.
4. **360 px és az alsó sáv:** semmi nem lóg ki vízszintesen, és a lap alja (az utolsó kártya, a teendő-panel, a visszavonás-csík) nem kerül a sáv alá. A keret a 2. feladaté, de először a 4. feladat előnézete teszi mérhetővé. Ellenőrzőlistája: 4. feladat, 8. lépés, és a 11. feladat.
5. **Olvasottnak jelölés után ugráló lista.** Az „olvasatlan elöl” rendezés élő állapottal futva a most megjelölt kártyát a lista végére dobná, a kurzor és a `j`/`k` fókusza alól. Elvárás: a kártya a helyén marad, csak halványodik, és a rendezés a betöltéskori állapotot használja. Tesztje: 7. feladat, `feedItems sorts by the loaded states…`; 6. feladat, `marking read after the load leaves loadedStates alone`.
6. **Hiányzó vagy sérült `nav` cookie.** Nincs cookie, vagy az értéke nem `rail` (törölt, régi vagy kézzel elrontott érték). Elvárás: az oldalsáv kinyitva jelenik meg (`readNavMode` alapértelmezése `full`), a szerver nem dob kivételt, és a felület nem ragad rail módban, ha a cookie eltűnik. Tesztje: 2. feladat, `lib/nav-mode.test.ts`, `anything else means full: missing, garbled, or another value`.

---

## Fájlszerkezet

| Fájl | Felelősség |
| --- | --- |
| `lib/nav.ts` (+ teszt) | a menüpontok egy listában, `activeNavId`, `switchesLanguageInPlace` |
| `lib/nav-mode.ts` (+ teszt) | a `nav` cookie értéke: teljes oldalsáv vagy ikonsáv (`readNavMode`) |
| `lib/public-paths.ts` (+ teszt) | melyik útvonal kerüli el a belépési átirányítást (a `/dev/` csak fejlesztői módban) |
| `lib/fixtures.ts` (+ teszt) | az előnézet mintaadatai |
| `lib/undo-queue.ts` (+ teszt) | az egyszerre-egy visszavonás-sor |
| `lib/reader-store.ts` (+ teszt) | olvasott, Később és teendők: optimista írás, sorrend, visszaállás, `post:<id>` kulcs |
| `lib/feed.ts` (+ teszt) | szűrés, Top 3 kizárása, olvasatlanok elöl |
| `lib/keymap.ts` (+ teszt) | billentyű → művelet, szerkeszthető cél felismerése, kártya-léptetés |
| `app/(app)/layout.tsx` | a bejelentkezett oldalak közös layoutja |
| `app/(app)/**` | a mostani `app/page.tsx`, `app/archive`, `app/library`, `app/loading.tsx`, ugyanazokkal az URL-ekkel |
| `app/(app)/archive/archive-view.tsx`, `app/(app)/library/library-view.tsx`, `app/(app)/library/[id]/post-article.tsx` | az oldalak törzse; az előnézet is ezeket rendereli |
| `app/components/post-image.tsx` | a poszt-kép: a homályos helykitöltő eltűnik betöltés után, `object-contain`, legfeljebb `80dvh` |
| `app/(app)/library/refresh-while-processing.tsx`, `app/(app)/library/[id]/mark-post-read.tsx` | élő frissítés beküldés közben; a megnyitott poszt olvasott |
| `app/dev/preview/page.tsx`, `post/page.tsx`, `preview-nav.tsx` | az offline előnézet: a listanézetek `?view=`-vel, a poszt-nézet külön útvonalon, mert az szerveren renderelt nyelvvel megy |
| `app/components/app-shell.tsx` | a keret: nyelvi kontextus, alsó sáv, „Több” panel, párbeszédablakok, csík |
| `app/components/desktop-nav.tsx` | az asztali navigáció, A változat, ~56 px-es ikonsávvá csukható; a B vagy C erre az egy fájlra cserélődik |
| `app/components/nav-parts.tsx` | amit minden navigáció használ: ikonok, `NavEntry`, „hamarosan” lista, fiók-sor, a rail hover/fókusz-buborékja (`NavTooltip`) |
| `app/components/language-context.tsx` | `LanguageProvider`, `useLanguage`, `LocalizedText` |
| `app/components/shell-dialogs.tsx` | `SearchSoon` (⌘K helye), `ShortcutHelp` |
| `app/components/undo-toast.tsx` | `toasts`, `UndoToast`, `isUndoToast` |
| `app/components/use-reader-state.ts`, `use-model-context-tools.ts`, `use-shortcuts.ts` | vékony hookok |
| `app/components/story-card.tsx`, `reader-panel.tsx`, `tag.tsx` | a dashboard darabjai |
| `app/components/page-header.tsx` | `PageHero` és `StatusCard` (a `PageHeader` megszűnik) |
| `components/ui/sheet.tsx`, `components/ui/dialog.tsx` | a bezáró gomb legalább 40 px |

**Nem része ennek a tervnek:**
- a B és a C mérföldkő;
- a sötét index-kártyák közös utility-je (a kódbázis-átnézés U4 pontja), mert nem kérték;
- a nem használt `components/ui` fájlok és a `sidebar.tsx` törlése: ez külön takarító PR lesz;
- a `html-to-blocks.ts` szétbontása.

---

### Task 1: A menülista (`lib/nav.ts`)

**Files:**
- Create: `lib/nav.ts`, `lib/nav.test.ts`

**Interfaces:**
- Consumes: `Localized` (`data/digest-types.ts`)
- Produces:
  - `type NavId = "radar" | "library" | "search" | "archive" | "collection" | "stats" | "chat"`
  - `type NavItem = { id: NavId; href: string | null; label: Localized; soon?: true }`
  - `NAV_ITEMS: readonly NavItem[]`, `PRIMARY_NAV: NavItem[]` (Radar, Library, Keresés, Archívum), `SOON_NAV: NavItem[]`
  - `activeNavId(pathname: string): NavId | null`

- [ ] **Step 1: A teszt megírása** (`lib/nav.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavId, NAV_ITEMS, PRIMARY_NAV, SOON_NAV } from "./nav.ts";

test("the bar's four primary slots in order, then the soon items", () => {
  assert.deepEqual(PRIMARY_NAV.map((item) => item.id), ["radar", "library", "search", "archive"]);
  assert.deepEqual(SOON_NAV.map((item) => item.id), ["collection", "stats", "chat"]);
  assert.equal(PRIMARY_NAV.length + SOON_NAV.length, NAV_ITEMS.length);
});

test("only real pages are links in milestone A", () => {
  // Search opens the palette slot until milestone C adds /search; the soon items are inert.
  assert.deepEqual(NAV_ITEMS.filter((item) => item.href).map((item) => item.href), ["/", "/library", "/archive"]);
});

test("activeNavId goes by path prefix at segment boundaries", () => {
  assert.equal(activeNavId("/"), "radar");
  assert.equal(activeNavId("/archive"), "archive");
  assert.equal(activeNavId("/archive/2026-W38"), "archive");
  assert.equal(activeNavId("/library/42"), "library");
  assert.equal(activeNavId("/library/"), "library");
  assert.equal(activeNavId("/libraryx"), null);
  assert.equal(activeNavId("/login"), null);
  assert.equal(activeNavId("/dev/preview"), null);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts`
Elvárt: FAIL, `Cannot find module '…/lib/nav.ts'`.

- [ ] **Step 3: A megvalósítás** (`lib/nav.ts`)

```ts
import type { Localized } from "../data/digest-types.ts";

// The one list both navigations are built from: the mobile bottom bar and the desktop nav.

export type NavId = "radar" | "library" | "search" | "archive" | "collection" | "stats" | "chat";

export type NavItem = {
  id: NavId;
  /** Null when it is not a page: search opens the palette slot (milestone C adds /search), soon items are inert. */
  href: string | null;
  label: Localized;
  /** Dimmed with a "soon" badge, not clickable. */
  soon?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "radar", href: "/", label: { hu: "Radar", en: "Radar" } },
  { id: "library", href: "/library", label: { hu: "Könyvtár", en: "Library" } },
  { id: "search", href: null, label: { hu: "Keresés", en: "Search" } },
  { id: "archive", href: "/archive", label: { hu: "Archívum", en: "Archive" } },
  { id: "collection", href: null, soon: true, label: { hu: "Gyűjtemény", en: "Collection" } },
  { id: "stats", href: null, soon: true, label: { hu: "Statisztika", en: "Statistics" } },
  { id: "chat", href: null, soon: true, label: { hu: "Chat", en: "Chat" } },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => !item.soon);
export const SOON_NAV = NAV_ITEMS.filter((item) => item.soon);

/** The item a path belongs to, by prefix at a segment boundary: /archive/2026-W38 → archive. "/" matches only itself. */
export function activeNavId(pathname: string): NavId | null {
  const match = NAV_ITEMS.find(({ href }) =>
    href === "/" ? pathname === "/" : href !== null && (pathname === href || pathname.startsWith(`${href}/`)),
  );
  return match?.id ?? null;
}
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts && npx tsc --noEmit && npm run dup`
Elvárt: 3 teszt PASS, a tsc hiba nélkül fut, 0 klón.

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts
git commit -m "feat: add the shared navigation list"
```

---

### Task 2: Az app-keret: route group, asztali navigáció (összecsukható oldalsáv), alsó sáv, „Több” panel

**Files:**
- Move (`git mv`): `app/page.tsx` → `app/(app)/page.tsx`; `app/loading.tsx` → `app/(app)/loading.tsx`; `app/archive` → `app/(app)/archive`; `app/library` → `app/(app)/library`
- Create: `lib/nav-mode.ts`, `lib/nav-mode.test.ts`, `app/(app)/layout.tsx`, `app/components/app-shell.tsx`, `app/components/desktop-nav.tsx`, `app/components/nav-parts.tsx`, `app/components/language-context.tsx`, `app/components/shell-dialogs.tsx`
- Modify:
  - `app/components/language-toggle.tsx`
  - `app/components/page-header.tsx` (a `PageHeader` törlése, `StatusCard`)
  - `app/components/digest-dashboard.tsx`
  - `app/(app)/page.tsx`, `app/(app)/archive/page.tsx`, `app/(app)/archive/[week]/page.tsx`, `app/(app)/library/page.tsx`, `app/(app)/library/[id]/page.tsx`
  - `app/login/page.tsx`, `app/error.tsx`, `app/not-found.tsx`
  - `lib/language.ts` (doc-komment)
  - `components/ui/sheet.tsx`, `components/ui/dialog.tsx` (bezáró gomb)

**Interfaces:**
- Consumes: `NAV_ITEMS`, `PRIMARY_NAV`, `SOON_NAV`, `activeNavId`, `NavId`, `NavItem` (1. feladat)
- Produces:
  - `type NavMode = "full" | "rail"`, `readNavMode(value: string | undefined): NavMode` (`lib/nav-mode.ts`)
  - `AppShell(props: { language: Language; email: string; initialNavMode: NavMode; children: ReactNode })`
  - `DesktopNav(props: DesktopNavProps)`, ahol `DesktopNavProps = { email: string; onSearch: () => void; mode: NavMode; onToggle: () => void; children: ReactNode }`. A 9. feladat hozzáad egy `onHelp: () => void` mezőt.
  - `navIcons: Record<NavId, LucideIcon>`, `NavEntry(props: { item: NavItem; active: boolean; onSearch: () => void; className: string; children: ReactNode })`, `SoonList(props: { className?: string })`, `NavTooltip(props: { label: string; children: ReactNode })`, `AccountActions(props: { email: string; iconOnly?: boolean })`
  - `LanguageProvider(props: { initial: Language; children: ReactNode })`, `useLanguage(): { language: Language; setLanguage: (language: Language) => void }`
  - `LanguageToggle(props?: { iconOnly?: boolean })`
  - `SearchSoon(props: { open: boolean; onOpenChange: (open: boolean) => void })`
  - `StatusCard(props: { eyebrow: string; title: string; brand?: boolean; children: ReactNode })`
  - `DigestDashboard(props: { issue: CurrentIssue; items: DigestItem[]; githubTop10: GithubTopEntry[]; archived?: boolean })`: az `email` és az `initialLanguage` megszűnik

- [ ] **Step 1: Az oldalak átköltöztetése a route groupba**

```bash
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/loading.tsx "app/(app)/loading.tsx"
git mv app/archive "app/(app)/archive"
git mv app/library "app/(app)/library"
sed -i 's#"\.\./\.\./\.\./lib/#"../../../../lib/#' "app/(app)/library/[id]/post-editor.test.ts" "app/(app)/library/[id]/post-toolbar.test.ts" "app/(app)/library/[id]/post-notices.test.ts"
```

A `/login`, az `/auth/*`, az `/api/*`, a `/media`, az `error.tsx`, a `not-found.tsx` és a `manifest.ts` a helyén marad. Az oldalak importjai `@/`-osak, a testvérfájlokra mutatók (`./submit-form`, `./post-toolbar`, `./post-editor`) a fájlokkal együtt költöznek. A három `[id]`-beli teszt viszont relatívan tölti a `lib/`-et (`lib/` alatt nincs `@/`, lásd CLAUDE.md), és egy szinttel mélyebbre kerül, ezért a `sed` a `../../../lib/`-et `../../../../lib/`-re írja. Ellenőrzés: `npm test` ugyanannyi tesztet futtat, mint a költözés előtt.

A `loading.tsx` azért költözik, hogy navigáláskor a keret látszódjon, és csak a tartalom helyén legyen váz. Emellett a `/dev/preview` fölött így nincs töltő-határ, és élesben valódi 404-et ad (lásd Global Constraints, `loading.md`).

- [ ] **Step 2: A `nav` cookie olvasásának tesztje** (`lib/nav-mode.test.ts`)

Az oldalsáv állapotát (2026-09-25-i döntés, spec 1.2) egy `nav` cookie őrzi (`full` | `rail`), ugyanúgy, mint a `lang` cookie-t a nyelv. Ezt a tiszta függvényt a 12. lépésben az `app/(app)/layout.tsx` hívja szerveren, a 4. feladat előnézeti oldalai pedig ugyanígy.

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readNavMode } from "./nav-mode.ts";

test("rail only for the exact cookie value", () => {
  assert.equal(readNavMode("rail"), "rail");
});

test("anything else means full: missing, garbled, or another value", () => {
  for (const value of [undefined, "", "full", "RAIL", "rail ", "expanded"]) {
    assert.equal(readNavMode(value), "full", String(value));
  }
});
```

- [ ] **Step 3: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav-mode.test.ts`
Elvárt: FAIL, `Cannot find module '…/lib/nav-mode.ts'`.

- [ ] **Step 4: A megvalósítás** (`lib/nav-mode.ts`)

```ts
// The desktop sidebar's two widths: a full sidebar or a ~56px icon rail (spec 1.2). Read from the
// `nav` cookie by app/(app)/layout.tsx, so the server renders the right width with no flash.

export type NavMode = "full" | "rail";

/** The `nav` cookie's value. Anything but the exact "rail" — missing, stale, or garbled — means full. */
export function readNavMode(value: string | undefined): NavMode {
  return value === "rail" ? "rail" : "full";
}
```

- [ ] **Step 5: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav-mode.test.ts && npx tsc --noEmit && npm run dup`
Elvárt: 2 teszt PASS, a tsc hiba nélkül fut, 0 klón.

- [ ] **Step 6: A nyelvi kontextus** (`app/components/language-context.tsx`)

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Language } from "@/data/digest-types";

/** Stores the choice for the server (`getLanguage()` in lib/language.ts) and relabels <html lang> for the page already shown. */
function persistLanguage(language: Language) {
  document.cookie = `lang=${language}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = language;
}

type LanguageState = { language: Language; setLanguage: (language: Language) => void };

const LanguageContext = createContext<LanguageState | null>(null);

/** The reader's language for every client component in the app shell, seeded from the `lang` cookie. */
export function LanguageProvider({ initial, children }: { initial: Language; children: ReactNode }) {
  const [language, setState] = useState(initial);
  const setLanguage = (next: Language) => {
    persistLanguage(next);
    setState(next);
  };
  return <LanguageContext value={{ language, setLanguage }}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageState {
  const state = useContext(LanguageContext);
  if (!state) throw new Error("useLanguage must be used inside LanguageProvider (app/components/app-shell.tsx)");
  return state;
}
```

A `lib/language.ts` doc-kommentje legyen ez: `/** The reader's language, written by persistLanguage in app/components/language-context.tsx. */`

- [ ] **Step 7: A nyelvváltó a kontextusra, ikon-változattal a railhez** (`app/components/language-toggle.tsx`, a teljes fájl)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLanguage } from "./language-context";

// Each label names the switch in the language it switches to.
const copy = { hu: { label: "Switch to English" }, en: { label: "Váltás magyarra" } };

/** Switches the whole shell at once; the server-rendered page follows with one refresh. `iconOnly` is the rail's ~40px version (desktop-nav.tsx). */
export function LanguageToggle({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        setLanguage(language === "hu" ? "en" : "hu");
        router.refresh();
      }}
      aria-label={copy[language].label}
      className={
        iconOnly
          ? "focus-ring grid size-10 place-items-center rounded-full border border-current/40 hover:border-signal hover:text-signal"
          : "focus-ring min-h-10 rounded-full border border-current/40 px-4 font-mono text-xs hover:border-signal hover:text-signal"
      }
    >
      {iconOnly ? <Languages className="size-4" /> : language.toUpperCase()}
    </button>
  );
}
```

A `router.refresh()` itt még mindig lefut. A 3. feladat hagyja el ott, ahol a lista már mindkét nyelvet tartalmazza. Addig a szerveren renderelt szöveg így sem marad régi nyelven.

- [ ] **Step 8: A közös navigációs darabok, a rail buborék-tippjével** (`app/components/nav-parts.tsx`)

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BookOpen, ChartColumn, FolderOpen, LogOut, MessageSquare, Radar, Search, UserRound, type LucideIcon } from "lucide-react";
import { SOON_NAV, type NavId, type NavItem } from "@/lib/nav";
import { useLanguage } from "./language-context";

// What every navigation variant shares: the icon per lib/nav.ts item, one nav entry, the "soon"
// list, the account row, and the rail's hover/focus tooltip. A new desktop variant reuses these
// instead of copying them.

const copy = {
  hu: { soonGroup: "Hamarosan", soon: "hamarosan", signOut: "Kijelentkezés" },
  en: { soonGroup: "Coming soon", soon: "soon", signOut: "Sign out" },
};

export const navIcons: Record<NavId, LucideIcon> = {
  radar: Radar,
  library: BookOpen,
  search: Search,
  archive: Archive,
  collection: FolderOpen,
  stats: ChartColumn,
  chat: MessageSquare,
};

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
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onSearch} className={className}>
      {children}
    </button>
  );
}

/** The future views: dimmed, labelled "soon", not clickable. */
export function SoonList({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ul aria-label={t.soonGroup} className={`space-y-1 ${className}`}>
      {SOON_NAV.map((item) => {
        const Icon = navIcons[item.id];
        return (
          <li key={item.id} className="flex min-h-10 items-center gap-3 font-mono text-sm opacity-40">
            <Icon className="size-4" />
            <span className="flex-1">{item.label[language]}</span>
            <span className="text-[10px] tracking-[0.12em]">{t.soon}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Wraps an icon-only control with its name as a small popup, shown on hover and on keyboard focus
 * (house style: paper background, 2px ink border, hard shadow). Used by the rail (desktop-nav.tsx);
 * the accessible name itself comes from the child's own aria-label or sr-only text, not from this.
 */
export function NavTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative flex">
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap border-2 border-ink bg-paper px-2 py-1 font-mono text-xs text-ink opacity-0 shadow-[3px_3px_0_var(--ink)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

/** The signed-in address and the sign-out button. `iconOnly` is the rail's ~40px sign-out-only version. */
export function AccountActions({ email, iconOnly = false }: { email: string; iconOnly?: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  if (iconOnly) {
    return (
      <form action="/auth/signout" method="post" className="flex justify-center">
        <button type="submit" aria-label={t.signOut} className="focus-ring grid size-10 place-items-center text-paper/70 hover:text-signal">
          <LogOut className="size-4" />
        </button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <UserRound className="size-4 shrink-0 opacity-60" />
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] opacity-70">{email}</p>
      <form action="/auth/signout" method="post">
        <button type="submit" className="focus-ring min-h-10 font-mono text-[11px] opacity-70 hover:text-signal hover:opacity-100">
          {t.signOut} →
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Az asztali navigáció, A változat, ikonsávvá csukható** (`app/components/desktop-nav.tsx`)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, Radar } from "lucide-react";
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { AccountActions, NavEntry, NavTooltip, navIcons, SoonList } from "./nav-parts";

// Desktop navigation, variant A: a sidebar, collapsible to a ~56px icon rail (spec 1.2). Variants B
// (top bar) and C (icon rail as the default) replace this one file: same props, the same items from
// lib/nav.ts, and each lays out `children` (the page) itself.

const copy = {
  hu: { nav: "Fő navigáció", collapse: "Oldalsáv összecsukása", expand: "Oldalsáv kinyitása" },
  en: { nav: "Main navigation", collapse: "Collapse sidebar", expand: "Expand sidebar" },
};

const itemClassFull =
  "focus-ring flex min-h-10 w-full items-center gap-3 border-l-2 border-transparent px-3 font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

const itemClassRail =
  "focus-ring flex min-h-10 w-full items-center justify-center border-l-2 border-transparent text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

export type DesktopNavProps = {
  email: string;
  onSearch: () => void;
  mode: NavMode;
  onToggle: () => void;
  children: ReactNode;
};

export function DesktopNav({ email, onSearch, mode, onToggle, children }: DesktopNavProps) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const t = copy[language];
  const rail = mode === "rail";
  return (
    <div className="md:flex">
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-paper/15 bg-ink text-paper md:flex ${rail ? "w-14" : "w-64"}`}
      >
        <Link href="/" className={`focus-ring flex items-center gap-3 border-b border-paper/15 ${rail ? "justify-center p-3" : "p-5"}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-signal bg-signal text-ink">
            <Radar className="size-5" />
          </span>
          {!rail && (
            <span className="font-display text-2xl leading-none tracking-tight">
              NEON
              <br />
              NEWS
              <br />
              <span className="text-signal">RADAR</span>
            </span>
          )}
        </Link>
        <nav aria-label={t.nav} className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const Icon = navIcons[item.id];
              const entry = (
                <NavEntry item={item} active={active === item.id} onSearch={onSearch} className={rail ? itemClassRail : itemClassFull}>
                  <Icon className="size-4 shrink-0" />
                  <span className={rail ? "sr-only" : "flex-1 text-left"}>{item.label[language]}</span>
                </NavEntry>
              );
              return <li key={item.id}>{rail ? <NavTooltip label={item.label[language]}>{entry}</NavTooltip> : entry}</li>;
            })}
          </ul>
          {!rail && <SoonList className="mt-6 px-3" />}
        </nav>
        <div className={`space-y-3 border-t border-paper/15 ${rail ? "px-2 py-3" : "p-4"}`}>
          {rail ? <LanguageToggle iconOnly /> : <LanguageToggle />}
          {rail ? <AccountActions email={email} iconOnly /> : <AccountActions email={email} />}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!rail}
            aria-label={rail ? t.expand : t.collapse}
            className="focus-ring flex min-h-10 w-full items-center justify-center gap-2 border-t border-paper/15 pt-3 font-mono text-[11px] text-paper/55 hover:text-signal"
          >
            {rail ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!rail && t.collapse}
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

A tartalom oszlopa (`<div className="min-w-0 flex-1">`) magától kiszélesedik, amikor az `aside` 256-ról 56 px-re csukódik: nincs hozzá külön kód. A `NavTooltip` csak rail módban veszi körbe a bejegyzést; teljes módban a névnek nincs szüksége buborékra, mert ki van írva.

- [ ] **Step 10: A keresés helye** (`app/components/shell-dialogs.tsx`)

```tsx
"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    search: "Keresés",
    soon: "Hamarosan. A Radar-hírek és a Library-posztok címében keres majd, elgépelés-tűrően és jelentés szerint is.",
  },
  en: {
    search: "Search",
    soon: "Coming soon. It will search the titles of Radar stories and Library posts, typo-tolerant and by meaning.",
  },
};

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

function ShellDialog({ open, onOpenChange, title, children }: DialogProps & { title: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-ink bg-cream text-ink shadow-[8px_8px_0_var(--signal)]">
        <DialogHeader className="pr-10">
          <DialogTitle className="font-display text-3xl leading-none">
            {title}
            <span className="text-signal">{"//"}</span>
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Milestone A keeps the ⌘K palette's place; milestone C puts the search in it. */
export function SearchSoon({ open, onOpenChange }: DialogProps) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} title={t.search}>
      <DialogDescription className="text-sm leading-6 text-ink/70">{t.soon}</DialogDescription>
    </ShellDialog>
  );
}
```

- [ ] **Step 11: A keret és az alsó sáv, az oldalsáv-mód átadásával** (`app/components/app-shell.tsx`)

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Language } from "@/data/digest-types";
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { DesktopNav } from "./desktop-nav";
import { LanguageProvider, useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { AccountActions, NavEntry, navIcons, SoonList } from "./nav-parts";
import { SearchSoon } from "./shell-dialogs";

const copy = {
  hu: { nav: "Menü", more: "Több", language: "Nyelv" },
  en: { nav: "Menu", more: "More", language: "Language" },
};

/** Mirrors persistLanguage (language-context.tsx): same cookie shape, read back by app/(app)/layout.tsx via readNavMode. */
function persistNavMode(mode: NavMode) {
  document.cookie = `nav=${mode}; path=/; max-age=31536000; samesite=lax`;
}

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(initialNavMode);
  const openSearch = () => setSearchOpen(true);
  const toggleNav = () => {
    const next: NavMode = navMode === "rail" ? "full" : "rail";
    persistNavMode(next);
    setNavMode(next);
  };
  return (
    <LanguageProvider initial={language}>
      <DesktopNav email={email} onSearch={openSearch} mode={navMode} onToggle={toggleNav}>
        {/* Room for the fixed bottom bar, so it never covers the end of the page. */}
        <div className="pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </DesktopNav>
      <MobileNav email={email} onSearch={openSearch} />
      <SearchSoon open={searchOpen} onOpenChange={setSearchOpen} />
    </LanguageProvider>
  );
}

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
          <Menu className="size-5" />
          <span>{t.more}</span>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-5 overflow-y-auto border-t-2 border-ink bg-cream p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] text-ink"
        >
          <SheetHeader className="p-0 pr-12">
            <SheetTitle className="font-display text-2xl">
              {t.more}
              <span className="text-signal">{"//"}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-between border-b-2 border-ink pb-4">
            <span className="font-mono text-xs tracking-[0.14em]">{t.language}</span>
            <LanguageToggle />
          </div>
          <SoonList />
          <div className="border-t-2 border-ink pt-4">
            <AccountActions email={email} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
```

Mobilon nincs rail: a `MobileNav` a `LanguageToggle`-t és az `AccountActions`-t is a teljes (nem `iconOnly`) formájukban használja, mert a „Több” panelben elég a hely.

- [ ] **Step 12: A layout, a `nav` cookie olvasásával** (`app/(app)/layout.tsx`)

```tsx
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/app/components/app-shell";
import { getLanguage } from "@/lib/language";
import { readNavMode } from "@/lib/nav-mode";
import { getViewer } from "@/lib/supabase/server";

// Pages still check the session themselves, with their own ?next=: a layout cannot read the path.
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const [language, viewer, cookieStore] = await Promise.all([getLanguage(), getViewer(), cookies()]);
  return (
    <AppShell language={language} email={viewer?.email ?? ""} initialNavMode={readNavMode(cookieStore.get("nav")?.value)}>
      {children}
    </AppShell>
  );
}
```

Így a szerver már a helyes szélességgel rendereli az oldalsávot, mielőtt bármi kliens-JS lefutna (spec 1.2, „villanás nélkül”).

- [ ] **Step 13: A dashboard a kereten belül** (`app/components/digest-dashboard.tsx`, pontos cserék)

Előbb olvasd újra a fájlt, mert a sorszámok a 2026-09-24-i állapotra vonatkoznak.

1. **Importok.** Az 1. sor (`"use client";`) utáni blokk a `import { persistLanguage } from "./language-toggle";` sorig bezárólag (3–52. sor) erre cserélődik. A `Link`, az `Archive`, a `BookOpen`, a `Languages`, a `UserRound`, az összes `Sidebar*`, a `Language` típus és a `persistLanguage` kimarad.

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FlaskConical,
  GitFork,
  ListTodo,
  Newspaper,
  Plus,
  Radar,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentIssue, DigestCategory, DigestItem, GithubTopEntry } from "@/data/digest-types";
import { useLanguage } from "./language-context";
```

2. **A `ui` objektum.** Mindkét nyelvből töröld ezt a három kulcsot, mert a keretbe költöznek: `archiveNav`, `library`, `signOut`.

3. **A függvény feje.** Ez a rész:

```tsx
export function DigestDashboard({
  email,
  issue: currentIssue,
  items: digestItems,
  githubTop10,
  initialLanguage,
  archived = false,
}: {
  email: string;
  issue: CurrentIssue;
  items: DigestItem[];
  githubTop10: GithubTopEntry[];
  initialLanguage: Language;
  /** A closed week opened from /archive: same reading UI, no "live" framing. */
  archived?: boolean;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
```

erre cserélődik:

```tsx
export function DigestDashboard({
  issue: currentIssue,
  items: digestItems,
  githubTop10,
  archived = false,
}: {
  issue: CurrentIssue;
  items: DigestItem[];
  githubTop10: GithubTopEntry[];
  /** A closed week opened from /archive: same reading UI, no "live" framing. */
  archived?: boolean;
}) {
  const { language } = useLanguage();
```

4. **A `toggleLanguage` függvény** törlődik (5 sor).

5. **A keret.** A `return (` sortól a `<main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">` sorig bezárólag (346–484. sor) minden erre cserélődik:

```tsx
  return (
    <div className="min-w-0 bg-cream text-ink">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-2 border-ink bg-cream px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {!archived && <span className="live-pulse shrink-0" />}
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] tracking-[0.2em] text-signal">{archived ? t.archived : t.live}</p>
            <p className="font-display text-lg leading-none">{currentIssue.label}</p>
          </div>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={t.panel}
              className="h-10 shrink-0 rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper sm:h-9 2xl:hidden"
            >
              <ListTodo /> {progress}%{openTodos > 0 && <span className="text-signal">· {openTodos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            // Focusing the to-do input on open would pop the phone keyboard over the panel.
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="w-[88vw] max-w-sm overflow-y-auto border-l-2 border-ink bg-cream p-5 pt-12 text-ink"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.panel}</SheetTitle>
            </SheetHeader>
            {readerPanel}
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* The chip bar belongs to this column, so the 2xl panel beside it is not covered. */}
        <div className="min-w-0">
          <nav
            aria-label={t.categories}
            className="sticky top-16 z-10 flex gap-2 overflow-x-auto border-b-2 border-ink bg-cream px-4 py-2 scrollbar-none sm:px-7"
          >
            {filters.map(({ id, icon: Icon, key }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className="focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs aria-pressed:bg-signal"
              >
                <Icon className="size-3.5" /> {t[key]}
              </button>
            ))}
          </nav>
          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
```

6. **A vége.** A `</main>` sortól a függvény végéig (626–635. sor) minden erre cserélődik:

```tsx
          </main>
        </div>

        <aside className="hidden border-l-2 border-ink bg-cream px-5 py-7 2xl:sticky 2xl:top-16 2xl:block 2xl:h-[calc(100dvh-4rem)] 2xl:overflow-y-auto">
          {readerPanel}
        </aside>
      </div>
    </div>
  );
}
```

Az eredmény:
- a kategóriák minden szélességen chip-sávban vannak, az oldalsávos kategórialista megszűnt;
- a fejléc gombja legalább 40 px mobilon;
- a nyelvváltás és a kijelentkezés a keretben van.

- [ ] **Step 14: Az oldalak** (`app/(app)/…`)

`app/(app)/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reader = await getReader();
  if (!reader) redirect("/login");
  const radar = await getRadar(reader.db);
  if (!radar) notFound(); // unreachable: without an issue id getRadar always returns data
  return <DigestDashboard {...radar} />;
}
```

`app/(app)/archive/[week]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { getRadar } from "@/lib/content";
import { isoWeekMonday } from "@/lib/pipeline/util";
import { getReader } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArchivedIssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/archive/${encodeURIComponent(week)}`);
  if (!isoWeekMonday(week)) notFound();
  const radar = await getRadar(reader.db, week);
  if (!radar) notFound();
  return <DigestDashboard archived {...radar} />;
}
```

Az `app/(app)/archive/page.tsx`, az `app/(app)/library/page.tsx` és az `app/(app)/library/[id]/page.tsx` fájlban ez az elem törlődik:

```tsx
<PageHeader …>
  <LanguageToggle language={…} />
</PageHeader>
```

Vele együtt törlődik a `LanguageToggle` import, és a `PageHeader` import is (az archívumnál és a Library-nél a `PageHero` import marad). A 3. és a 4. feladat ezeket az oldalakat még átírja.

- [ ] **Step 15: `StatusCard`, a `PageHeader` törlése** (`app/components/page-header.tsx`)

A `PageHeader` függvény és a `Link` / `ArrowLeft` import törlődik: a keret átveszi a helyét. A fájl eleje és a `PageHero` utáni új komponens:

```tsx
import type { ReactNode } from "react";
import { Radar } from "lucide-react";

// Hook-free, so server pages and the client error boundary can both use these.
```

```tsx
/** A lone card on ink: sign-in, error and not-found, the pages outside the app shell. */
export function StatusCard({ eyebrow, title, brand = false, children }: {
  eyebrow: string;
  title: string;
  /** The NEON NEWS RADAR wordmark above the eyebrow (sign-in). */
  brand?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-paper">
      <section className="w-full max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">
        {brand && (
          <div className="mb-6 flex items-center gap-2 font-display text-xl sm:text-2xl">
            <Radar className="shrink-0 text-signal" /> NEON NEWS RADAR
          </div>
        )}
        <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl leading-[0.9] tracking-[-0.04em] sm:text-5xl">
          {title}
          <span className="text-signal">{"//"}</span>
        </h1>
        {children}
      </section>
    </main>
  );
}
```

A három kártya címe így egységes: 360 px-en `text-4xl`, `sm`-től `text-5xl`. Ez szándékos, apró eltérés a mostanitól.

`app/error.tsx`:

```tsx
"use client";

import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <StatusCard eyebrow="ERROR / HIBA" title="SIGNAL LOST">
      <p className="mt-5 text-sm leading-6">
        Valami elromlott betöltés közben.
        <br />
        <span className="text-ink/60">Something broke while loading.</span>
      </p>
      <Button type="button" variant="ink" className="mt-6 min-h-10 w-full" onClick={reset}>
        Újra / Retry
      </Button>
    </StatusCard>
  );
}
```

`app/not-found.tsx`:

```tsx
import Link from "next/link";
import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusCard eyebrow="404" title="NO SIGNAL">
      <p className="mt-5 text-sm leading-6">
        Ez az oldal nem létezik.
        <br />
        <span className="text-ink/60">This page does not exist.</span>
      </p>
      <Button asChild variant="ink" className="mt-6 min-h-10 w-full">
        <Link href="/">← LIVE RADAR</Link>
      </Button>
    </StatusCard>
  );
}
```

`app/login/page.tsx` (a teljes fájl; a `safeNext` importja maradjon onnan, ahonnan az M1 után jön):

```tsx
import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const { next, sent, error } = await searchParams;

  return (
    <StatusCard brand eyebrow="INVITE-ONLY / CSAK MEGHÍVÓVAL" title="SIGN IN">
      {sent ? (
        <p className="mt-7 border-l-4 border-signal pl-4 text-sm leading-6">
          Ha ez a cím meghívott, a belépő link úton van — nézd meg a leveleidet.
          <br />
          <span className="text-ink/60">If this address is invited, a sign-in link is on its way.</span>
        </p>
      ) : (
        <form action="/auth/login" method="post" className="mt-7 space-y-4">
          <input type="hidden" name="next" value={safeNext(next)} />
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs">EMAIL</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="min-h-10 border-2 border-ink bg-paper focus-visible:border-signal"
            />
          </div>
          <Button type="submit" variant="ink" className="min-h-10 w-full">
            Belépő link küldése / Send link
          </Button>
          {error && (
            <p className="font-mono text-xs text-signal">A link lejárt vagy érvénytelen. / The link expired or is invalid.</p>
          )}
        </form>
      )}
    </StatusCard>
  );
}
```

- [ ] **Step 16: A bezáró gomb legalább 40 px** (`components/ui/sheet.tsx`, `components/ui/dialog.tsx`)

A gyári bezáró gomb nagyjából 16 px-es érintési felület, ez sérti a 40 px-es szabályt a panelekben és a párbeszédablakokban.

A `sheet.tsx`-ben a `<SheetPrimitive.Close className="…">` `className`-je legyen ez:

```tsx
"focus-ring absolute top-2 right-2 grid size-10 place-items-center border-2 border-ink bg-paper transition-colors hover:bg-signal disabled:pointer-events-none"
```

A `dialog.tsx`-ben a `<DialogPrimitive.Close data-slot="dialog-close" className="…">` `className`-je:

```tsx
"focus-ring absolute top-2 right-2 grid size-10 place-items-center border-2 border-ink bg-paper transition-colors hover:bg-signal disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
```

A `CLAUDE.md` „Hand-authored components” szakaszát a 11. feladat frissíti.

- [ ] **Step 17: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt:
- minden zöld, 0 klón;
- a build route-listájában ugyanazok az URL-ek szerepelnek (`/`, `/archive`, `/archive/[week]`, `/library`, `/library/[id]`, `/login`), `(app)` nélkül.

Ezeknek nem szabad találatot adniuk:

```bash
grep -rn "PageHeader\|SidebarProvider\|persistLanguage(" app --include=*.tsx | grep -v language-context.tsx
grep -rn "initialLanguage\|email=" "app/(app)" --include=page.tsx
```

A kontroller Playwrighttal a `/login` oldalt (bejelentkezés nélkül is elérhető) 360 és 1280 px-en nézi meg: látszik a `StatusCard`, és nincs vízszintes görgetés. A keret első teljes ellenőrzése a 4. feladat előnézetén lesz.

- [ ] **Step 18: Commit**

```bash
git add -A app components/ui/sheet.tsx components/ui/dialog.tsx lib/language.ts lib/nav-mode.ts lib/nav-mode.test.ts
git commit -m "feat: add the app shell with a collapsible desktop nav and mobile bottom bar"
```

---

### Task 3: Nyelvváltás frissítés nélkül a listaoldalakon

**Files:**
- Create: `app/(app)/archive/archive-view.tsx`, `app/(app)/library/library-view.tsx`
- Modify: `lib/nav.ts`, `lib/nav.test.ts`, `app/components/language-context.tsx` (`LocalizedText`), `app/components/language-toggle.tsx`, `data/digest-types.ts` (`ArchiveIssue.top`), `lib/content.ts` (`getArchive`), `app/(app)/archive/page.tsx`, `app/(app)/library/page.tsx`, `app/(app)/library/submit-form.tsx`

**Interfaces:**
- Consumes: `useLanguage`, `LanguageToggle` (2. feladat); `PageHero`
- Produces:
  - `switchesLanguageInPlace(pathname: string): boolean` (`lib/nav.ts`)
  - `LocalizedText(props: { value: Localized })` (`language-context.tsx`)
  - `ArchiveIssue.top: Localized`, `getArchive(db: SupabaseClient): Promise<ArchiveIssue[]>` (nincs `language` paraméter)
  - `ArchiveView(props: { issues: ArchiveIssue[] })`
  - `LibraryView(props: { posts: Post[]; open: SubmittedSource[] })`. A 8. feladat egy `readIds` mezőt ad hozzá.
  - `SubmitForm()`: nincs props, a nyelvet a kontextusból veszi

- [ ] **Step 1: A teszt bővítése** (`lib/nav.test.ts`; az importba vedd fel a `switchesLanguageInPlace`-t)

```ts
test("the toggle switches in place only where both languages are on the page", () => {
  for (const path of ["/", "/library", "/library/", "/archive", "/archive/2026-W38", "/dev/preview"]) {
    assert.equal(switchesLanguageInPlace(path), true, path);
  }
  for (const path of ["/library/42", "/archive/2026-W38/x", "/dev/preview/post", "/login"]) {
    assert.equal(switchesLanguageInPlace(path), false, path);
  }
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/nav.test.ts`
Elvárt: FAIL, `switchesLanguageInPlace` nem létezik.

- [ ] **Step 3: A szabály** (`lib/nav.ts`, a fájl végére)

```ts
/**
 * Pages that hold every text in both languages (client components, or LocalizedText): the toggle
 * switches them without a server round trip. Any other page is refreshed, so nothing stays in the old language.
 * /dev/preview renders the same list views on fixtures (development only); its post view, /dev/preview/post, is refreshed.
 */
const IN_PLACE_LANGUAGE = [/^\/$/, /^\/library\/?$/, /^\/archive(\/[^/]+)?\/?$/, /^\/dev\/preview\/?$/];

export const switchesLanguageInPlace = (pathname: string) => IN_PLACE_LANGUAGE.some((pattern) => pattern.test(pathname));
```

- [ ] **Step 4: `LocalizedText`** (`app/components/language-context.tsx`, a fájl végére; a típusimport legyen `import type { Language, Localized } from "@/data/digest-types";`)

```tsx
/**
 * One `{ hu, en }` text in the reader's language. Server components hand both languages to it, so
 * the language toggle switches the page without a round trip.
 */
export function LocalizedText({ value }: { value: Localized }) {
  const { language } = useLanguage();
  return value[language];
}
```

- [ ] **Step 5: A váltó csak ott frissít, ahol kell** (`app/components/language-toggle.tsx`)

Az importok legyenek ezek: `import { usePathname, useRouter } from "next/navigation";` és `import { switchesLanguageInPlace } from "@/lib/nav";`. A `Languages` (lucide) és a `useLanguage` importja a 2. feladatból marad. A komponens (a 2. feladat `iconOnly`-ja megmarad, csak a frissítés lesz feltételes):

```tsx
/** Switches the whole shell at once; only a page whose text the server rendered in one language is refreshed. `iconOnly` is the rail's ~40px version (desktop-nav.tsx). */
export function LanguageToggle({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={() => {
        setLanguage(language === "hu" ? "en" : "hu");
        if (!switchesLanguageInPlace(pathname)) router.refresh();
      }}
      aria-label={copy[language].label}
      className={
        iconOnly
          ? "focus-ring grid size-10 place-items-center rounded-full border border-current/40 hover:border-signal hover:text-signal"
          : "focus-ring min-h-10 rounded-full border border-current/40 px-4 font-mono text-xs hover:border-signal hover:text-signal"
      }
    >
      {iconOnly ? <Languages className="size-4" /> : language.toUpperCase()}
    </button>
  );
}
```

- [ ] **Step 6: Az archívum mindkét nyelvvel**

`data/digest-types.ts`, az `ArchiveIssue`-ban: `top: string;` helyett `top: Localized;`.

`lib/content.ts`:

```ts
export async function getArchive(db: SupabaseClient): Promise<ArchiveIssue[]> {
  const current = isoWeek(new Date()).id;
  const { data } = await db
    .from("archive_issues")
    .select("id, period, item_count, read_minutes, top_title")
    .neq("id", current)
    .order("id", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    period: row.period,
    week: row.id.slice(5), // '2026-W38' → 'W38'
    top: (row.top_title as Localized | null) ?? { hu: "—", en: "—" },
    itemCount: row.item_count,
    readMinutes: row.read_minutes,
  }));
}
```

Ha a `Language` import így feleslegessé válik a `content.ts`-ben, töröld.

`app/(app)/archive/archive-view.tsx`:

```tsx
import Link from "next/link";
import { Archive, CalendarDays, Clock3 } from "lucide-react";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import type { ArchiveIssue } from "@/data/digest-types";

// Server-rendered with both languages; LocalizedText picks one on the client, so the toggle needs no refresh here.
const copy = {
  lead: {
    hu: "Vasárnaponként lezárt, konszolidált AI-kiadások. A források és a sorrend a zárás után változatlan maradnak.",
    en: "Consolidated AI issues, closed every Sunday. Sources and order stay fixed after the freeze.",
  },
  empty: {
    hu: "Még nincs lezárt hét. Az első vasárnap éjfélkor zárul le, addig a Radaron olvashatod.",
    en: "No closed week yet. The first one closes on Sunday at midnight; until then, read it on the Radar.",
  },
  toRadar: { hu: "Irány a Radar →", en: "Go to the Radar →" },
  items: { hu: "HÍR", en: "ITEMS" },
  minutes: { hu: "PERC", en: "MIN" },
};

/** The archive page body; the offline preview renders it with fixtures. */
export function ArchiveView({ issues }: { issues: ArchiveIssue[] }) {
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="WEEKLY FREEZE / HETI ZÁRÁS" title="ARCHIVE" lead={<LocalizedText value={copy.lead} />} />
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-10 lg:grid-cols-2">
        {!issues.length && (
          <p className="font-mono text-sm text-paper/55 lg:col-span-2">
            <LocalizedText value={copy.empty} />{" "}
            <Link href="/" className="focus-ring inline-flex min-h-10 items-center text-signal underline">
              <LocalizedText value={copy.toRadar} />
            </Link>
          </p>
        )}
        {issues.map((issue, index) => (
          <Link
            key={issue.id}
            href={`/archive/${issue.id}`}
            className="focus-ring group border-2 border-paper/30 bg-[#1c1c1c] p-6 transition hover:border-signal hover:bg-signal hover:text-ink"
          >
            <div className="flex items-start justify-between">
              <Archive className="size-7 text-signal group-hover:text-ink" />
              <span className="font-display text-5xl text-paper/15 group-hover:text-ink/20">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-8 font-mono text-xs tracking-[0.15em] opacity-60">{issue.period}</p>
            <h2 className="mt-2 font-display text-5xl leading-none">{issue.week}</h2>
            <p className="mt-4 text-base leading-6 opacity-65 [overflow-wrap:anywhere]">
              <LocalizedText value={issue.top} />
            </p>
            <div className="mt-7 flex flex-wrap gap-5 border-t border-current/20 pt-4 font-mono text-xs">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4" /> {issue.itemCount} <LocalizedText value={copy.items} />
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="size-4" /> {issue.readMinutes} <LocalizedText value={copy.minutes} />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
```

`app/(app)/archive/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getArchive } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { ArchiveView } from "./archive-view";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/archive");
  return <ArchiveView issues={await getArchive(reader.db)} />;
}
```

- [ ] **Step 7: A Library-lista mindkét nyelvvel**

`app/(app)/library/library-view.tsx`: a mostani `page.tsx` törzse ide költözik, a `kindIcons` térképpel együtt. A `lang`-függő szöveg `LocalizedText`-re vált, és a csak angol címkék is bekerülnek a `copy`-ba.

```tsx
import Link from "next/link";
import { BookOpen, FileText, FlaskConical, GitFork, MessageSquareQuote, PlayCircle } from "lucide-react";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import type { Post, SubmittedSource } from "@/lib/content";
import { hostOf } from "@/lib/pipeline/util";
import { SubmitForm } from "./submit-form";

const kindIcons = { article: FileText, youtube: PlayCircle, arxiv: FlaskConical, github: GitFork, x: MessageSquareQuote, pdf: FileText } as const;

// Server-rendered with both languages; LocalizedText picks one on the client, so the toggle needs no refresh here.
const copy = {
  lead: {
    hu: "Dobj be egy YouTube-videót vagy cikket: az AI összefoglalja, a cikk szövegét pedig elmenti ide, hogy a link halála után is megmaradjon.",
    en: "Drop in a YouTube video or an article: the AI summarizes it and keeps a copy of the article text, so it outlives the original link.",
  },
  failed: { hu: "HIBA", en: "FAILED" },
  processing: { hu: "FELDOLGOZÁS…", en: "PROCESSING…" },
  empty: { hu: "Még üres a könyvtár.", en: "The library is empty." },
  mirrored: { hu: "TÜKRÖZVE", en: "MIRRORED" },
};

/** The Library page body; the offline preview renders it with fixtures. */
export function LibraryView({ posts, open }: { posts: Post[]; open: SubmittedSource[] }) {
  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHero eyebrow="MIRRORED SOURCES / KÖNYVTÁR" title="LIBRARY" lead={<LocalizedText value={copy.lead} />} aside={<SubmitForm />} />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-10">
        {open.length > 0 && (
          <div className="mb-8 space-y-2 font-mono text-xs">
            {open.map((source) => (
              <p key={source.id} className="flex flex-wrap gap-3 border border-paper/20 px-4 py-3">
                <span className={source.status === "failed" ? "text-signal" : "text-cyan"}>
                  <LocalizedText value={source.status === "failed" ? copy.failed : copy.processing} />
                </span>
                <span className="min-w-0 flex-1 truncate text-paper/70">{source.url}</span>
                {source.error && <span className="w-full break-words text-paper/45">{source.error}</span>}
              </p>
            ))}
          </div>
        )}

        {!posts.length && (
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {posts.map((post) => {
            const Icon = kindIcons[post.kind];
            return (
              <Link
                key={post.id}
                href={`/library/${post.id}`}
                className="focus-ring group border-2 border-paper/30 bg-[#1c1c1c] p-5 transition hover:border-signal hover:bg-signal hover:text-ink sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <Icon className="size-7 text-signal group-hover:text-ink" />
                  <span className="font-mono text-[10px] opacity-60">{post.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-6 font-mono text-xs tracking-[0.15em] opacity-60">{post.author ?? hostOf(post.url)}</p>
                <h2 className="mt-2 font-display text-2xl leading-[1.02] [overflow-wrap:anywhere] sm:text-3xl">
                  <LocalizedText value={post.title} />
                </h2>
                <p className="mt-4 line-clamp-3 text-base leading-6 opacity-65">
                  <LocalizedText value={post.summary} />
                </p>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-current/20 pt-4">
                  {post.tags.map((tag) => (
                    <span key={tag} className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>
                  ))}
                  {post.meta.mirrored && (
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] opacity-60">
                      <BookOpen className="size-3" /> <LocalizedText value={copy.mirrored} />
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
```

Ha az M1 15. feladata a `Post` / `SubmittedSource` típust máshová tette, onnan importáld (`grep -rn "export type Post "`).

`app/(app)/library/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOpenSources, getPosts } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/library");
  const [posts, open] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db)]);
  return <LibraryView posts={posts} open={open} />;
}
```

`app/(app)/library/submit-form.tsx`:
- `export function SubmitForm({ language }: { language: Language })` helyett `export function SubmitForm()`, az első sorában `const { language } = useLanguage();`;
- import: `import { useLanguage } from "@/app/components/language-context";`;
- a `Language` típusimport törlődik.

- [ ] **Step 8: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón. Ezeknek nem szabad találatot adniuk:

```bash
grep -rn 'language === "hu" ?' "app/(app)/archive" "app/(app)/library/page.tsx" "app/(app)/library/library-view.tsx"
grep -rn "getLanguage" "app/(app)/page.tsx" "app/(app)/archive" "app/(app)/library/page.tsx"
```

A nyelvváltás Playwright-próbája a 11. feladatban van, az előnézeten.

- [ ] **Step 9: Commit**

```bash
git add -A lib/nav.ts lib/nav.test.ts lib/content.ts data/digest-types.ts app
git commit -m "feat: switch language without a refresh on list pages"
```

---

### Task 4: Offline előnézet: mintaadatok, proxy-kivétel, előnézeti oldal

**Files:**
- Create: `lib/public-paths.ts`, `lib/public-paths.test.ts`, `lib/fixtures.ts`, `lib/fixtures.test.ts`, `app/dev/preview/page.tsx`, `app/dev/preview/post/page.tsx`, `app/dev/preview/preview-nav.tsx`, `app/(app)/library/[id]/post-article.tsx`
- Modify: `proxy.ts`, `app/(app)/library/[id]/page.tsx`

**Interfaces:**
- Consumes: `AppShell`, `readNavMode` (`lib/nav-mode.ts`) (2. feladat); `ArchiveView`, `LibraryView` (3. feladat); `DigestDashboard`; `assignIds`, `blockSchema`, `parseBlocks`, `BlockDraft` (`lib/blocks.ts`); `publishedLabel` (`lib/pipeline/util.ts`)
- Produces:
  - `isPublicPath(pathname: string): boolean`, `isDevPreviewPath(pathname: string, nodeEnv: string | undefined): boolean`
  - `lib/fixtures.ts`: `LONG_WORD`, `LONG_URL`, `previewEmail`, `digestItem(id: string, overrides?: Partial<DigestItem>): DigestItem`, `previewIssue`, `previewItems`, `previewGithub`, `previewArchive`, `previewSources`, `previewPosts`. A 6. feladat hozzáadja a `previewReader`-t, a 8. a `previewReadPostIds`-t.
  - `PostArticle(props: { post: Post; language: Language; query: PostQuery; canEdit: boolean })`
  - `PREVIEW_VIEWS`, `type PreviewView`, `PreviewNav(props: { current: PreviewView | "post" })`. A 6. feladat egy `failWrites: boolean` mezőt ad hozzá.
  - `/dev/preview?view=radar|radar-empty|library|library-empty|archive|archive-empty` és `/dev/preview/post`

- [ ] **Step 1: A tesztek megírása**

`lib/public-paths.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isDevPreviewPath, isPublicPath } from "./public-paths.ts";

test("the offline preview skips sign-in in development only", () => {
  assert.equal(isDevPreviewPath("/dev/preview", "development"), true);
  for (const nodeEnv of ["production", "test", undefined]) assert.equal(isDevPreviewPath("/dev/preview", nodeEnv), false);
});

test("only the /dev/ folder counts, not look-alike paths", () => {
  for (const path of ["/dev", "/devices", "/developer/x", "/library/dev/preview"]) {
    assert.equal(isDevPreviewPath(path, "development"), false, path);
  }
});

test("public paths are sign-in, auth callbacks and the API", () => {
  for (const path of ["/login", "/auth/callback", "/api/state"]) assert.equal(isPublicPath(path), true, path);
  for (const path of ["/", "/library", "/archive/2026-W38", "/dev/preview", "/media/1/x.avif"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
```

`lib/fixtures.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { blockSchema, parseBlocks } from "./blocks.ts";
import { previewItems, previewPosts } from "./fixtures.ts";

test("the preview posts cover every block type", () => {
  const shown = new Set(previewPosts.flatMap((post) => post.blocks.map((block) => block.type)));
  for (const option of blockSchema.options) {
    const type = option.shape.type.value;
    assert.ok(shown.has(type), `no preview block of type ${type}: add one to lib/fixtures.ts`);
  }
});

test("every fixture block survives parseBlocks unchanged", () => {
  for (const post of previewPosts) assert.deepEqual(parseBlocks(post.blocks), post.blocks);
});

test("the preview posts show all four banners", () => {
  for (const flag of ["noarchive", "extractionFailed", "truncated", "clipped"] as const) {
    assert.ok(previewPosts.some((post) => post.meta[flag]), flag);
  }
});

test("the preview radar has exactly three must-read items and unique ids", () => {
  assert.equal(previewItems.filter((item) => item.mustRead).length, 3);
  assert.equal(new Set(previewItems.map((item) => item.id)).size, previewItems.length);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/public-paths.test.ts lib/fixtures.test.ts`
Elvárt: FAIL, a két modul nem létezik.

- [ ] **Step 3: `lib/public-paths.ts`, és a `proxy.ts` átállítása**

```ts
// Which paths proxy.ts lets through without a session. Pure, so the dev-only rule is tested.

// API routes answer 401 themselves; redirecting a fetch to /login helps no one.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/"];

export const isPublicPath = (pathname: string) => PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/** The offline preview (app/dev/preview) skips sign-in in development only; in production the page itself is a 404. */
export const isDevPreviewPath = (pathname: string, nodeEnv: string | undefined) =>
  nodeEnv === "development" && pathname.startsWith("/dev/");
```

`proxy.ts`:
- a `PUBLIC_PREFIXES` konstans és a kommentje törlődik;
- import: `import { isDevPreviewPath, isPublicPath } from "@/lib/public-paths";`;
- a függvény eleje ez lesz, a Supabase-kliens létrehozása elé:

```ts
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Before any Supabase call: the preview has to work with no keys and no network.
  if (isDevPreviewPath(pathname, process.env.NODE_ENV)) return NextResponse.next();

  let response = NextResponse.next({ request });
```

- a feltétel `!PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))` helyett `!isPublicPath(pathname)`;
- a lenti, második `const { pathname, search } = request.nextUrl;` sor törlődik.

- [ ] **Step 4: A poszt-oldal törzse külön komponensbe** (`app/(app)/library/[id]/post-article.tsx`)

Előbb olvasd újra a `page.tsx`-et. A `const t = notices[language]` sortól a `</article>` záróig minden változatlanul ide költözik, a copy-szabály miatt három eltéréssel:
1. a `notices` neve `copy` lesz, két új kulccsal: `keyPoints` és `kind`;
2. `kindLabel[post.kind]` helyett `t.kind[post.kind]`;
3. a `KULCSPONTOK` / `KEY POINTS` ternáris helyett `t.keyPoints`.

Ha az M1 újabb sort tett a törzsbe, az is jöjjön át.

```tsx
import { ExternalLink } from "lucide-react";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import { safeHref } from "@/lib/blocks";
import type { Post } from "@/lib/content";
import { hostOf } from "@/lib/pipeline/util";
import { readMinutes, type PostQuery } from "@/lib/post-view";
import { translatable } from "@/lib/translate";
import { PostEditor } from "./post-editor";
import { PostToolbar } from "./post-toolbar";

const copy = {
  hu: {
    noarchive: "Saját összefoglaló — az eredeti:",
    failed: "A tartalmat nem sikerült átmenteni — az eredeti:",
    // X oEmbed is embed-shaped, not article-shaped: it also cuts long single posts, not just threads.
    truncated: "A poszt beágyazott formájában került be: szál, képek és a hosszú poszt vége nélkül.",
    clipped: "A forrás túl hosszú volt, az eleje került be.",
    original: "Eredeti forrás",
    min: "perc",
    keyPoints: "KULCSPONTOK",
    kind: { article: "CIKK", youtube: "VIDEÓ", arxiv: "TANULMÁNY", github: "REPO", x: "POSZT", pdf: "PDF" },
  },
  en: {
    noarchive: "Our own notes — the original:",
    failed: "The content could not be mirrored — the original:",
    truncated: "Captured in its embed form: no thread, images or the end of a long post.",
    clipped: "The source was too long; the beginning was kept.",
    original: "Original source",
    min: "min",
    keyPoints: "KEY POINTS",
    kind: { article: "ARTICLE", youtube: "VIDEO", arxiv: "PAPER", github: "REPO", x: "POST", pdf: "PDF" },
  },
};

/** The post page body. The offline preview (app/dev/preview) renders it with fixture posts. */
export function PostArticle({ post, language, query, canEdit }: { post: Post; language: Language; query: PostQuery; canEdit: boolean }) {
  const t = copy[language];
  const showingTranslation = query.text === "hu" && Boolean(post.blocksHu);
  const blocks = showingTranslation ? post.blocksHu! : post.blocks;
  const minutes = readMinutes(post.blocks, post.kind);
  const start = Number.parseInt(query.t ?? "", 10);
  // post.url is already validated at ingest (parseSubmittedUrl), but every href the page emits
  // goes through safeHref anyway — this is the same choke point PostBlocks uses.
  const originalHref = safeHref(post.url, post.url);

  return (
    <article className="bg-cream text-ink">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-16">
        <header className="border-b-2 border-ink pb-6">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[0.15em] text-signal">
            <span className="border border-signal px-2 py-0.5">{t.kind[post.kind]}</span>
            <span>{post.siteName ?? hostOf(post.url)}</span>
            {post.author && <span className="text-ink/60">{post.author}</span>}
            {post.publishedAt && <span className="text-ink/60">{post.publishedAt}</span>}
            {minutes !== null && <span className="text-ink/60">{minutes} {t.min}</span>}
          </p>
          <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] [overflow-wrap:anywhere]">{post.title[language]}</h1>
          {(post.meta.noarchive || post.meta.extractionFailed) && (
            <p className="mt-4 border-l-4 border-signal pl-4 text-sm">
              {post.meta.noarchive ? t.noarchive : t.failed}{" "}
              {originalHref ? (
                <a href={originalHref} target="_blank" rel="noreferrer" className="focus-ring text-signal underline [overflow-wrap:anywhere]">{post.url}</a>
              ) : (
                <span className="[overflow-wrap:anywhere]">{post.url}</span>
              )}
            </p>
          )}
          {post.meta.truncated && <p className="mt-2 font-mono text-xs text-ink/60">{t.truncated}</p>}
          {post.meta.clipped && <p className="mt-2 font-mono text-xs text-ink/60">{t.clipped}</p>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <PostToolbar
              postId={post.id}
              language={language}
              hasTranslation={Boolean(post.blocksHu)}
              showingTranslation={showingTranslation}
              canEdit={canEdit}
              hasTranslatable={translatable(post.blocks).length > 0}
            />
            {originalHref && (
              <Button asChild variant="ink" className="min-h-10">
                <a href={originalHref} target="_blank" rel="noreferrer">{t.original} <ExternalLink /></a>
              </Button>
            )}
          </div>
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => <span key={tag} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>)}
            </div>
          )}
        </header>

        <p className="mt-8 text-lg leading-8">{post.summary[language]}</p>
        {post.keyPoints[language].length > 0 && (
          <div className="mt-8 border-l-4 border-signal pl-5">
            <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
              {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        )}

        {query.edit === "1" && canEdit ? (
          <section className="mt-12">
            <PostEditor post={post} language={language} />
          </section>
        ) : (
          blocks.length > 0 && (
            <section className="mt-12" lang={showingTranslation ? "hu" : undefined}>
              <PostBlocks
                blocks={blocks}
                language={language}
                baseUrl={post.url}
                hidden={post.hiddenBlocks}
                showHidden={query.hidden === "show"}
                videoStart={Number.isFinite(start) && start > 0 ? start : undefined}
                linkQuery={query}
              />
            </section>
          )
        )}

        <p className="mt-12 border-t-2 border-ink pt-4 font-mono text-[10px] tracking-[0.15em] text-ink/55 [overflow-wrap:anywhere]">
          © {post.author ?? post.siteName ?? hostOf(post.url)} · {post.url}
        </p>
      </div>
    </article>
  );
}
```

`app/(app)/library/[id]/page.tsx` (a teljes fájl):

```tsx
import { notFound, redirect } from "next/navigation";
import { getPost } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { parseId } from "@/lib/pipeline/util";
import type { PostQuery } from "@/lib/post-view";
import { getReader } from "@/lib/supabase/server";
import { PostArticle } from "./post-article";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PostQuery>;
}) {
  const { id } = await params;
  const reader = await getReader();
  if (!reader) redirect(`/login?next=/library/${id}`);
  const postId = parseId(id);
  const [post, query, language] = await Promise.all([postId ? getPost(reader.db, postId) : null, searchParams, getLanguage()]);
  if (!post) notFound();

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PostArticle post={post} language={language} query={query} canEdit={post.submittedBy === reader.viewer.id} />
    </main>
  );
}
```

- [ ] **Step 5: A mintaadatok** (`lib/fixtures.ts`)

```ts
import { assignIds, type BlockDraft } from "./blocks.ts";
import type { ArchiveIssue, CurrentIssue, DigestItem, GithubTopEntry } from "../data/digest-types.ts";
import type { Post, SubmittedSource } from "./content.ts";
import { publishedLabel } from "./pipeline/util.ts";

// Sample data for the offline preview (app/dev/preview): every block type, all four post banners,
// long titles and URLs, empty states. Nothing here reaches production: the preview is a 404 there.

/** No break opportunity: the 360px layout has to wrap it, not scroll sideways. */
export const LONG_WORD = "Transzformer-architektúra-optimalizálási-lehetőségvizsgálati-jegyzőkönyv";
export const LONG_URL =
  "https://example.test/research/2026/09/a-very-long-path-segment-without-any-natural-break-points-at-all?utm_source=preview&utm_medium=fixture&ref=long-url-check";
export const previewEmail = "preview@example.test";

export function digestItem(id: string, overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    id,
    category: "local",
    score: 70,
    readMinutes: 4,
    publishedAt: "2026-09-21",
    publishedLabel: publishedLabel("2026-09-21"),
    source: "example.test",
    url: `https://example.test/${id}`,
    tags: ["inference", "open-weights"],
    title: { hu: `Minta hír: ${id}`, en: `Sample story: ${id}` },
    summary: {
      hu: "Két mondatos összefoglaló. A második mondat hosszabb, hogy a sortörés is látsszon keskeny kijelzőn.",
      en: "A two-sentence summary. The second sentence runs longer so the line wrap shows on a narrow screen.",
    },
    why: { hu: "Ezért érdemes elolvasni.", en: "Why it is worth reading." },
    ...overrides,
  };
}

export const previewIssue: CurrentIssue = { label: "2026 / W39", updated: "09. 24. 07:00", archiveAt: "09. 27." };

export const previewItems: DigestItem[] = [
  digestItem("research-2026-W39-long-title", {
    mustRead: true,
    category: "research",
    score: 96,
    title: { hu: `${LONG_WORD} a kötelező olvasmányok élén`, en: `${LONG_WORD} tops the must-reads` },
  }),
  digestItem("companies-2026-W39-must-2", { mustRead: true, category: "companies", score: 91 }),
  digestItem("local-2026-W39-must-3", { mustRead: true, score: 88 }),
  digestItem("local-2026-W39-read", { score: 82 }),
  digestItem("local-2026-W39-long-url", {
    score: 77,
    source: LONG_URL,
    url: LONG_URL,
    tags: ["inference", "quantization", "runtime", "serving", "fine-tuning", "training", "agents", "evals"],
  }),
  digestItem("research-2026-W39-plain", { category: "research", score: 64 }),
  digestItem("companies-2026-W39-plain", { category: "companies", score: 58 }),
  digestItem("github-2026-W39-plain", { category: "github", score: 52 }),
];

export const previewGithub: GithubTopEntry[] = [
  ["ggml-org/llama.cpp", "LLM inference in C/C++", "https://github.com/ggml-org/llama.cpp"],
  [`example/${LONG_WORD}`, "Egy nagyon hosszú nevű repó / a repository with a very long name", "https://github.com/example/long"],
];

export const previewArchive: ArchiveIssue[] = [
  { id: "2026-W38", period: "2026 / 09", week: "W38", top: { hu: `${LONG_WORD} a hét élén`, en: `${LONG_WORD} leads the week` }, itemCount: 24, readMinutes: 96 },
  { id: "2026-W37", period: "2026 / 09", week: "W37", top: { hu: "A nyílt súlyú modellek hete", en: "A week of open weights" }, itemCount: 19, readMinutes: 71 },
];

export const previewSources: SubmittedSource[] = [
  { id: 101, url: LONG_URL, kind: "article", status: "pending", error: null, createdAt: "2026-09-24T08:00:00Z" },
  { id: 102, url: "https://example.test/gone", kind: "article", status: "failed", error: "fetch 404", createdAt: "2026-09-23T08:00:00Z" },
];

/** A 1×1 PNG: the only kind of placeholder isValidPlaceholder lets through. */
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Every block type once: inline marks, a long link, a code line that must scroll inside its box, both image states. */
const everyBlock: BlockDraft[] = [
  { type: "heading", level: 2, text: "Minden blokktípus" },
  {
    type: "paragraph",
    content: [
      { text: "Normál, " },
      { text: "félkövér", bold: true },
      { text: ", " },
      { text: "dőlt", italic: true },
      { text: ", " },
      { text: "kód", code: true },
      { text: " és " },
      { text: "link", href: "https://example.test/" },
      { text: "." },
    ],
  },
  { type: "paragraph", content: [{ text: "Ez a bekezdés el van rejtve, a „rejtett blokk” sáv mutatja." }] },
  { type: "heading", level: 3, text: "Listák" },
  { type: "list", ordered: false, items: [[{ text: "egy" }], [{ text: "kettő" }]] },
  { type: "list", ordered: true, items: [[{ text: "első" }], [{ text: LONG_URL, href: LONG_URL }]] },
  { type: "heading", level: 4, text: "Idézet és kód" },
  { type: "quote", content: [{ text: "Az idézet szövege, forrásmegjelöléssel." }], cite: "Minta Szerző" },
  { type: "code", language: "ts", code: "const answer = 42; // a long line that has to scroll inside its own box instead of widening the page" },
  { type: "image", originalUrl: "https://example.test/missing.png", alt: "Nem tükrözött kép", path: null },
  {
    type: "image",
    originalUrl: "https://example.test/mirrored.png",
    alt: "Tükrözött kép",
    caption: "Képaláírás",
    path: "1/0123456789abcdef",
    format: "avif",
    widths: [640, 1280],
    width: 1280,
    height: 720,
    placeholder: PLACEHOLDER,
  },
  { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
  { type: "chapters", items: [{ seconds: 0, title: "Bevezető" }, { seconds: 95, title: "A lényeg" }] },
  { type: "repo", fullName: "ggml-org/llama.cpp", url: "https://github.com/ggml-org/llama.cpp", stars: 81234, language: "C++", topics: ["llm", "inference"], license: "MIT" },
  { type: "divider" },
];

function post(id: number, overrides: Partial<Post>): Post {
  return {
    id,
    sourceId: id,
    kind: "article",
    url: `https://example.test/posts/${id}`,
    author: "Minta Szerző",
    siteName: "example.test",
    publishedAt: "2026-09-20",
    title: { hu: `Minta poszt ${id}`, en: `Sample post ${id}` },
    summary: { hu: "A poszt magyar összefoglalója.", en: "The post's English summary." },
    keyPoints: { hu: ["Első kulcspont", "Második kulcspont"], en: ["First key point", "Second key point"] },
    tags: ["agents", "evals"],
    blocks: assignIds([{ type: "paragraph", content: [{ text: "Rövid törzsszöveg." }] }]),
    blocksHu: null,
    meta: { mirrored: true },
    hiddenBlocks: [],
    submittedBy: null,
    extractedAt: "2026-09-20T10:00:00Z",
    createdAt: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

const fullBlocks = assignIds(everyBlock);

export const previewPosts: Post[] = [
  post(1, { title: { hu: LONG_WORD, en: LONG_WORD }, url: LONG_URL, blocks: fullBlocks, hiddenBlocks: [fullBlocks[2].id] }),
  post(2, { meta: { noarchive: true } }),
  post(3, { meta: { extractionFailed: true }, blocks: [] }),
  post(4, { kind: "x", meta: { truncated: true } }),
  post(5, { kind: "youtube", meta: { mirrored: true, clipped: true } }),
];
```

Ha a `Post` típusnak az M1 után új kötelező mezője van, a `post()` alapértékei közé kerül (a `tsc` jelzi). Értékelt tételek a B mérföldkővel kerülnek ide (spec 1.6). Az olvasott és halványított tételeket a 6. és a 8. feladat adja hozzá.

- [ ] **Step 6: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/public-paths.test.ts lib/fixtures.test.ts`
Elvárt: 7 teszt PASS. Ha a `blockSchema.options[…].shape.type.value` típushibát ad a zod verziójában, a `value` helyett `[...option.shape.type.values][0]` kell.

- [ ] **Step 7: Az előnézet oldalai**

Két oldal van. A listanézetek a `/dev/preview?view=…` alatt a kliensen váltanak nyelvet. A poszt-nézet külön útvonalon van (`/dev/preview/post`), mert a szerveren renderelt nyelvvel megy, és a váltó ott frissít (lásd a 3. feladat `switchesLanguageInPlace` szabályát).

`app/dev/preview/preview-nav.tsx`:

```tsx
import Link from "next/link";

// The preview's own view switcher (development only, English on purpose: it is a tool, not app UI).

export const PREVIEW_VIEWS = ["radar", "radar-empty", "library", "library-empty", "archive", "archive-empty"] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

const linkClass = "focus-ring flex min-h-10 items-center aria-[current=page]:text-signal";

export function PreviewNav({ current }: { current: PreviewView | "post" }) {
  return (
    <nav aria-label="Preview views" className="flex flex-wrap gap-x-3 border-b-2 border-signal bg-ink px-4 font-mono text-xs text-paper">
      {PREVIEW_VIEWS.map((view) => (
        <Link key={view} href={`/dev/preview?view=${view}`} aria-current={view === current ? "page" : undefined} className={linkClass}>
          {view}
        </Link>
      ))}
      <Link href="/dev/preview/post" aria-current={current === "post" ? "page" : undefined} className={linkClass}>
        post
      </Link>
    </nav>
  );
}
```

`app/dev/preview/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArchiveView } from "@/app/(app)/archive/archive-view";
import { LibraryView } from "@/app/(app)/library/library-view";
import { AppShell } from "@/app/components/app-shell";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { previewArchive, previewEmail, previewGithub, previewIssue, previewItems, previewPosts, previewSources } from "@/lib/fixtures";
import { getLanguage } from "@/lib/language";
import { readNavMode } from "@/lib/nav-mode";
import { PREVIEW_VIEWS, PreviewNav, type PreviewView } from "./preview-nav";

// The real view components on fixtures: no Supabase keys, no network, no sign-in. Development only.

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [{ view: requested }, language, cookieStore] = await Promise.all([searchParams, getLanguage(), cookies()]);
  const view: PreviewView = PREVIEW_VIEWS.find((candidate) => candidate === requested) ?? "radar";

  return (
    <AppShell language={language} email={previewEmail} initialNavMode={readNavMode(cookieStore.get("nav")?.value)}>
      <PreviewNav current={view} />
      {view === "radar" && <DigestDashboard issue={previewIssue} items={previewItems} githubTop10={previewGithub} />}
      {view === "radar-empty" && <DigestDashboard issue={previewIssue} items={[]} githubTop10={[]} />}
      {view === "library" && <LibraryView posts={previewPosts} open={previewSources} />}
      {view === "library-empty" && <LibraryView posts={[]} open={[]} />}
      {view === "archive" && <ArchiveView issues={previewArchive} />}
      {view === "archive-empty" && <ArchiveView issues={[]} />}
    </AppShell>
  );
}
```

A `/dev/preview` így ugyanazt a `nav` sütit olvassa, mint az éles `app/(app)/layout.tsx`: az oldalsáv állapota Playwrighttal is ellenőrizhető újratöltés után (11. feladat).

`app/dev/preview/post/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PostArticle } from "@/app/(app)/library/[id]/post-article";
import { AppShell } from "@/app/components/app-shell";
import { previewEmail, previewPosts } from "@/lib/fixtures";
import { getLanguage } from "@/lib/language";
import { readNavMode } from "@/lib/nav-mode";
import { PreviewNav } from "../preview-nav";

/** Every block type and all four banners, one fixture post after the other. */
export default async function PreviewPostPage() {
  // Before any await: production answers a real 404 and never renders the fixtures.
  if (process.env.NODE_ENV !== "development") notFound();
  const [language, cookieStore] = await Promise.all([getLanguage(), cookies()]);
  return (
    <AppShell language={language} email={previewEmail} initialNavMode={readNavMode(cookieStore.get("nav")?.value)}>
      <PreviewNav current="post" />
      <main className="min-h-dvh bg-ink">
        {previewPosts.map((post) => (
          <PostArticle key={post.id} post={post} language={language} query={{}} canEdit={false} />
        ))}
      </main>
    </AppShell>
  );
}
```

A dashboard itt még a valódi `/api/state`-et hívja. Offline ez 500-at ad, a lista ettől olvasatlan marad. Mintaadatos állapotot és hálózat nélküli írást a 6. feladat ad hozzá.

- [ ] **Step 8: Ellenőrzés és az első Playwright-kör** (a Review Focus 4. pontja)

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`. Elvárt: minden zöld, 0 klón.

A kontroller `npm run dev` mellett, Playwright MCP-eszközökkel (`browser_resize`, `browser_navigate`, `browser_evaluate`) nézi végig. Minden nézet 360×740, 768×1024 és 1280×800 px-en megy: `http://localhost:3000/dev/preview?view=<nézet>` és `http://localhost:3000/dev/preview/post`.

1. **Nincs vízszintes görgetés.** Elvárt: `scrollWidth <= innerWidth`, minden nézetben és szélességen.
   ```js
   () => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
   ```
2. **Az alsó sáv.**
   - 360 px-en a `#mobile-nav` látszik;
   - 768 és 1280 px-en nem látszik, helyette az asztali oldalsáv van;
   - 360 px-en a tartalom `padding-bottom`-ja 64px.
   ```js
   () => {
     const bar = document.getElementById("mobile-nav");
     const visible = !!bar && getComputedStyle(bar).display !== "none";
     // The DesktopNav wrapper sits right before the bar: its content column holds the padded div.
     const content = bar?.previousElementSibling?.querySelector(":scope > div > div");
     return { visible, padding: content ? getComputedStyle(content).paddingBottom : null };
   }
   ```
   Elvárt 360 px-en: `{ visible: true, padding: "64px" }`. 768 és 1280 px-en: `visible: false`, és `padding: "0px"`.
3. **A sáv nem takar.** 360 px-en, a lap aljára görgetve az utolsó elem alja nem lóg a sáv teteje alá. Elvárt: `covered === false`.
   ```js
   async () => {
     window.scrollTo(0, document.documentElement.scrollHeight);
     await new Promise((resolve) => setTimeout(resolve, 300));
     const barTop = document.getElementById("mobile-nav").getBoundingClientRect().top;
     const items = [...document.querySelectorAll("main a, main button, main p, main h2")].filter((el) => el.getClientRects().length);
     const lastBottom = items.at(-1).getBoundingClientRect().bottom;
     return { barTop, lastBottom, covered: lastBottom > barTop };
   }
   ```
4. **Az éles 404.** `npm run build && npm run start` (a proxynak kell a `.env.local`), majd `curl -sI http://localhost:3000/dev/preview` és `curl -sI http://localhost:3000/dev/preview/post`. Elvárt: mindkettő átirányít a `/login`-ra, mert a proxy élesben nem engedi át. Bejelentkezve a lap `notFound()`-ot ad, ezt a kód és a `public-paths` teszt biztosítja.

- [ ] **Step 9: Commit**

```bash
git add lib/public-paths.ts lib/public-paths.test.ts lib/fixtures.ts lib/fixtures.test.ts proxy.ts app/dev "app/(app)/library/[id]"
git commit -m "feat: add an offline preview page with fixtures"
```

---

### Task 5: A visszavonás-csík

**Files:**
- Create: `lib/undo-queue.ts`, `lib/undo-queue.test.ts`, `app/components/undo-toast.tsx`
- Modify: `app/components/app-shell.tsx`

**Interfaces:**
- Consumes: `useLanguage` (2. feladat); a `Button` `signal` variánsa
- Produces:
  - `createToastQueue<Kind extends string>()`: `{ subscribe, getSnapshot(): ToastEntry<Kind> | null, show(entry: Omit<ToastEntry<Kind>, "id">): number, undo(id: number): void, dismiss(id: number): void, flush(): void }`
  - `type ToastEntry<Kind> = { id: number; kind: Kind; undo?: () => void; commit?: () => void }`
  - `undo-toast.tsx`: `type ToastKind = "markedRead" | "todoAdded" | "todoDeleted" | "failed"`, `toasts` (az alkalmazás egyetlen sora), `UndoToast()`, `isUndoToast(target: EventTarget | null): boolean`

- [ ] **Step 1: A teszt megírása** (`lib/undo-queue.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createToastQueue } from "./undo-queue.ts";

function logged(log: string[], name: string) {
  return { kind: name, undo: () => log.push(`undo ${name}`), commit: () => log.push(`commit ${name}`) };
}

test("a new toast makes the one it replaces final, exactly once", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  const first = queue.show(logged(log, "a"));
  queue.show(logged(log, "b"));
  assert.deepEqual(log, ["commit a"]);
  queue.dismiss(first); // the first toast's timer fires late
  queue.undo(first);
  assert.deepEqual(log, ["commit a"]);
  assert.equal(queue.getSnapshot()?.kind, "b");
});

test("undo runs once and never commits; a double click on Undo does nothing more", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  const id = queue.show(logged(log, "a"));
  queue.undo(id);
  queue.undo(id);
  queue.dismiss(id);
  assert.deepEqual(log, ["undo a"]);
  assert.equal(queue.getSnapshot(), null);
});

test("flush makes the pending action final when the page is closing", () => {
  const log: string[] = [];
  const queue = createToastQueue<string>();
  queue.show(logged(log, "a"));
  queue.flush();
  queue.flush();
  assert.deepEqual(log, ["commit a"]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/undo-queue.test.ts`
Elvárt: FAIL, a modul nem létezik.

- [ ] **Step 3: A sor** (`lib/undo-queue.ts`)

```ts
// One undo toast at a time (spec 1.3). Framework-free, so the "every action settles exactly once"
// rule runs under node --test; app/components/undo-toast.tsx renders it.

export type ToastEntry<Kind extends string> = {
  id: number;
  kind: Kind;
  /** Offered as the Undo button. */
  undo?: () => void;
  /** Makes the action final: runs when the toast times out, is replaced, or the page is closing. */
  commit?: () => void;
};

export function createToastQueue<Kind extends string>() {
  let current: ToastEntry<Kind> | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();

  function set(next: ToastEntry<Kind> | null) {
    current = next;
    for (const listener of listeners) listener();
  }

  /** Clears the toast if `id` is still the one showing, so a late timer or a second click finds nothing. */
  function take(id: number): ToastEntry<Kind> | null {
    if (current?.id !== id) return null;
    const entry = current;
    set(null);
    return entry;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    /** Shows a toast; the one it replaces becomes final. */
    show(entry: Omit<ToastEntry<Kind>, "id">): number {
      const replaced = current;
      const id = nextId++;
      set({ ...entry, id });
      replaced?.commit?.();
      return id;
    },
    undo: (id: number) => take(id)?.undo?.(),
    /** Timed out: the action stands. */
    dismiss: (id: number) => take(id)?.commit?.(),
    /** The page is going away: make the pending action final now. */
    flush: () => {
      if (current) take(current.id)?.commit?.();
    },
  };
}
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/undo-queue.test.ts`
Elvárt: 3 teszt PASS.

- [ ] **Step 5: A komponens** (`app/components/undo-toast.tsx`)

```tsx
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { createToastQueue } from "@/lib/undo-queue";
import { useLanguage } from "./language-context";

const copy = {
  hu: {
    markedRead: "Olvasottnak jelölve",
    todoAdded: "Hozzáadva a teendőkhöz",
    todoDeleted: "Teendő törölve",
    failed: "Nem sikerült menteni, a változást visszaállítottuk.",
    undo: "Visszavonás",
  },
  en: {
    markedRead: "Marked read",
    todoAdded: "Added to your to-dos",
    todoDeleted: "To-do deleted",
    failed: "Couldn't save; the change was undone.",
    undo: "Undo",
  },
};

export type ToastKind = "markedRead" | "todoAdded" | "todoDeleted" | "failed";

/** The app's one toast queue: `toasts.show({ kind, undo?, commit? })` from any event handler. */
export const toasts = createToastQueue<ToastKind>();

const VISIBLE_MS = 5000;
const noToast = () => null;

/** True for a click on the toast: a panel open underneath must not treat it as a click outside. */
export const isUndoToast = (target: EventTarget | null) => target instanceof Element && target.closest("[data-undo-toast]") !== null;

/** Mounted once by the app shell, above the mobile bottom bar and above any open panel. */
export function UndoToast() {
  const { language } = useLanguage();
  const toast = useSyncExternalStore(toasts.subscribe, toasts.getSnapshot, noToast);
  // Paused while the pointer or focus is on it, so the Undo button can be reached in time.
  const [pausedId, setPausedId] = useState<number | null>(null);
  const toastId = toast?.id;

  useEffect(() => {
    if (toastId === undefined || pausedId === toastId) return;
    const timer = setTimeout(() => toasts.dismiss(toastId), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toastId, pausedId]);

  useEffect(() => {
    // A delete that waits for its toast to run out must still happen if the tab closes first.
    window.addEventListener("pagehide", toasts.flush);
    return () => window.removeEventListener("pagehide", toasts.flush);
  }, []);

  const t = copy[language];
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-[60] flex justify-center md:bottom-6"
    >
      {toast && (
        <div
          data-undo-toast
          onPointerEnter={() => setPausedId(toast.id)}
          onPointerLeave={() => setPausedId(null)}
          onFocus={() => setPausedId(toast.id)}
          onBlur={() => setPausedId(null)}
          className={`pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 border-2 border-ink px-4 py-1 font-mono text-xs ${
            toast.kind === "failed" ? "bg-signal text-ink shadow-[5px_5px_0_var(--ink)]" : "bg-ink text-paper shadow-[5px_5px_0_var(--signal)]"
          }`}
        >
          <span className="min-w-0 flex-1">{t[toast.kind]}</span>
          {toast.undo && (
            <Button variant="signal" className="min-h-10" onClick={() => toasts.undo(toast.id)}>
              {t.undo}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

Az élő régió (`role="status"`) mindig a DOM-ban van, csak a tartalma változik. A `z-[60]` a Sheet (`z-50`) és az alsó sáv (`z-40`) fölé teszi.

- [ ] **Step 6: A keretbe** (`app/components/app-shell.tsx`)

Import: `import { UndoToast } from "./undo-toast";`. A `<SearchSoon … />` után a `LanguageProvider`-en belülre ez kerül: `<UndoToast />`.

- [ ] **Step 7: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run dup`
Elvárt: minden zöld, 0 klón. A csíknak még nincs hívója, a 6. feladat köti be.

- [ ] **Step 8: Commit**

```bash
git add lib/undo-queue.ts lib/undo-queue.test.ts app/components/undo-toast.tsx app/components/app-shell.tsx
git commit -m "feat: add a one-at-a-time undo toast"
```

---

### Task 6: Olvasói állapot: optimista tár, visszaállás, teendő-panel

**Files:**
- Create: `lib/reader-store.ts`, `lib/reader-store.test.ts`, `app/components/use-reader-state.ts`, `app/components/use-model-context-tools.ts`, `app/components/reader-panel.tsx`
- Modify: `app/components/digest-dashboard.tsx`, `lib/fixtures.ts` (`previewReader`), `app/dev/preview/page.tsx`, `app/dev/preview/preview-nav.tsx`, `app/dev/preview/post/page.tsx`

**Interfaces:**
- Consumes: `toasts`, `isUndoToast` (5. feladat); `parseId` (`lib/pipeline/util.ts`); `useLanguage`
- Produces (`lib/reader-store.ts`):
  - típusok: `ItemState = { read: boolean; saved: boolean }`, `Flag = keyof ItemState`, `Todo = { id: number; itemId: string | null; text: string; done: boolean }`, `ReaderData = { states: Record<string, ItemState>; todos: Todo[] }`, `ReaderSnapshot = ReaderData & { loadedStates: Record<string, ItemState>; syncing: boolean }`
  - `StateWrite` (a POST `/api/state` négy alakja), `SendState = (write: StateWrite) => Promise<{ id?: number }>`, `PendingRemoval = { undo(): void; commit(): void }`
  - `EMPTY_ITEM_STATE`, `POST_STATE_PREFIX = "post:"`, `postStateKey(postId: number): string`, `readPostIds(itemIds: string[]): Set<number>`
  - `postState(write)`, `loadState(): Promise<ReaderData>`, `memorySend(fail?: boolean): SendState`
  - `createReaderStore(send: SendState, onError: () => void, initial?: ReaderData)`, `type ReaderStore`. A metódusai:
    - `subscribe`, `getSnapshot(): ReaderSnapshot`, `settled(): Promise<void>`
    - `hydrate(data)`, `hydrateFailed()`
    - `setFlag(itemId, flag, value): boolean`, `toggleFlag(itemId, flag): boolean`
    - `addTodo(text, itemId?): boolean`, `setTodoDone(id, done): boolean`, `removeTodo(id): PendingRemoval | null`
- Produces (a többi):
  - `useReaderState(preview?: ReaderPreview): { store: ReaderStore } & ReaderSnapshot`, `type ReaderPreview = { data: ReaderData; failWrites: boolean }`
  - `useModelContextTools(store: ReaderStore): void`
  - `ReaderPanel(props: { language; progress; readCount; total; syncing; todos; onAdd(text): boolean; onToggle(id, done): void; onDelete(id): void })`
  - `DigestDashboard` új propja: `preview?: ReaderPreview`
  - `lib/fixtures.ts`: `previewReader: ReaderData`
  - `PreviewNav(props: { current: PreviewView | "post"; failWrites: boolean })`, és a `/dev/preview?view=…&fail=1` kapcsoló

- [ ] **Step 1: A teszt megírása** (`lib/reader-store.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReaderStore,
  memorySend,
  postStateKey,
  readPostIds,
  type ReaderData,
  type SendState,
  type StateWrite,
  type Todo,
} from "./reader-store.ts";

const empty: ReaderData = { states: {}, todos: [] };
const todo = (id: number): Todo => ({ id, itemId: null, text: `t${id}`, done: false });
const noop = () => {};
/** What fetch does with no network: it rejects with a TypeError instead of answering !ok. */
const offline: SendState = async () => {
  throw new TypeError("Failed to fetch");
};
/** Lets every pending promise callback run. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

function recording() {
  const sent: StateWrite[] = [];
  const send: SendState = async (write) => {
    sent.push(write);
    return write.action === "add_todo" ? { id: 100 + sent.length } : {};
  };
  return { sent, send };
}

/** A send the test settles call by call, to see the order and the in-flight state. */
function manual() {
  const calls: { write: StateWrite; resolve: (value: { id?: number }) => void; reject: (error: Error) => void }[] = [];
  const send: SendState = (write) =>
    new Promise((resolve, reject) => {
      calls.push({ write, resolve, reject });
    });
  return { calls, send };
}

test("setting a flag to its current value sends nothing", async () => {
  const { sent, send } = recording();
  const store = createReaderStore(send, noop, empty);
  assert.equal(store.setFlag("a", "read", true), true);
  assert.equal(store.setFlag("a", "read", true), false, "a second Open click changes nothing");
  await store.settled();
  assert.deepEqual(sent, [{ action: "set_read", itemId: "a", value: true }]);
});

test("an offline write rolls back and reports the error once", async () => {
  let errors = 0;
  const store = createReaderStore(offline, () => errors++, empty);
  store.setFlag("a", "saved", true);
  assert.equal(store.getSnapshot().states.a.saved, true, "shown before the server answers");
  await store.settled();
  assert.equal(store.getSnapshot().states.a.saved, false);
  assert.equal(errors, 1);
});

test("a quick double toggle reaches the server in click order", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop, empty);
  store.toggleFlag("a", "saved");
  store.toggleFlag("a", "saved");
  await tick();
  assert.equal(calls.length, 1, "the second write waits for the first");
  calls[0].resolve({});
  await tick();
  assert.deepEqual(
    calls.map((call) => call.write),
    [
      { action: "set_saved", itemId: "a", value: true },
      { action: "set_saved", itemId: "a", value: false },
    ],
  );
  calls[1].resolve({});
  await store.settled();
  assert.equal(store.getSnapshot().states.a.saved, false);
});

test("when the newest of several writes fails, the flag shows what the server last confirmed", async () => {
  const { calls, send } = manual();
  const store = createReaderStore(send, noop, empty);
  store.toggleFlag("a", "read"); // true
  store.toggleFlag("a", "read"); // false
  store.toggleFlag("a", "read"); // true
  await tick();
  calls[0].resolve({}); // the server now has read = true
  await tick();
  calls[1].reject(new TypeError("Failed to fetch"));
  await tick();
  calls[2].reject(new TypeError("Failed to fetch"));
  await store.settled();
  // Undoing each failure in turn would end on false; the server says true.
  assert.equal(store.getSnapshot().states.a.read, true);
});

test("an added to-do shows at once and takes the server's id; a failed one disappears", async () => {
  let errors = 0;
  const send: SendState = async (write) => {
    if (write.action === "add_todo" && write.text === "boom") throw new TypeError("Failed to fetch");
    return { id: 7 };
  };
  const store = createReaderStore(send, () => errors++, empty);
  store.addTodo("  read the paper  ");
  store.addTodo("boom");
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.text), ["boom", "read the paper"]);
  assert.ok(store.getSnapshot().todos.every((item) => item.id < 0), "pending until the server answers");
  await store.settled();
  assert.deepEqual(store.getSnapshot().todos, [{ id: 7, itemId: null, text: "read the paper", done: false }]);
  assert.equal(errors, 1);
});

test("a second to-do for the same item is refused", () => {
  const store = createReaderStore(memorySend(), noop, empty);
  assert.equal(store.addTodo("Title", "item-1"), true);
  assert.equal(store.addTodo("Title", "item-1"), false);
  assert.equal(store.getSnapshot().todos.length, 1);
});

test("to-do text is trimmed and capped like the API; blank text is refused", () => {
  const store = createReaderStore(memorySend(), noop, empty);
  assert.equal(store.addTodo("   "), false);
  store.addTodo("x".repeat(500));
  assert.equal(store.getSnapshot().todos[0].text.length, 180);
});

test("a to-do still being created cannot be ticked or deleted", () => {
  const store = createReaderStore(manual().send, noop, empty);
  store.addTodo("pending");
  const [{ id }] = store.getSnapshot().todos;
  assert.equal(store.setTodoDone(id, true), false);
  assert.equal(store.removeTodo(id), null);
});

test("delete hides at once, sends nothing until commit, and undo puts it back in place", async () => {
  const { sent, send } = recording();
  const store = createReaderStore(send, noop, { states: {}, todos: [todo(1), todo(2), todo(3)] });
  const removal = store.removeTodo(2);
  assert.ok(removal);
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 3]);
  removal.undo();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 2, 3]);
  await store.settled();
  assert.deepEqual(sent, []);
});

test("a committed delete that fails offline brings the to-do back", async () => {
  let errors = 0;
  const store = createReaderStore(offline, () => errors++, { states: {}, todos: [todo(1), todo(2)] });
  store.removeTodo(1)?.commit();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [2]);
  await store.settled();
  assert.deepEqual(store.getSnapshot().todos.map((item) => item.id), [1, 2]);
  assert.equal(errors, 1);
});

test("the first load keeps what the reader changed meanwhile", async () => {
  const store = createReaderStore(memorySend(), noop);
  assert.equal(store.getSnapshot().syncing, true);
  store.setFlag("a", "read", true); // clicked before GET /api/state answered
  store.addTodo("early");
  await store.settled();
  store.hydrate({ states: { a: { read: false, saved: true }, b: { read: true, saved: false } }, todos: [todo(9)] });
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.states.a, { read: true, saved: true }, "the local read wins, the server's saved stays");
  assert.deepEqual(snapshot.states.b, { read: true, saved: false });
  assert.deepEqual(snapshot.todos.map((item) => item.text), ["early", "t9"]);
  assert.equal(snapshot.syncing, false);
});

test("marking read after the load leaves loadedStates alone", () => {
  const store = createReaderStore(memorySend(), noop, { states: { a: { read: false, saved: false } }, todos: [] });
  store.setFlag("a", "read", true);
  assert.equal(store.getSnapshot().states.a.read, true);
  assert.equal(store.getSnapshot().loadedStates.a.read, false, "the feed keeps sorting by this, so the card stays put");
});

test("post read state is item_states post:<id>, within the 120-character key limit", () => {
  assert.equal(postStateKey(42), "post:42");
  assert.ok(postStateKey(Number.MAX_SAFE_INTEGER).length <= 120);
  const ids = readPostIds(["post:42", "post:7", "local-2026-W38-x-1a2b3c4d", "post:", "post:0", "post:12abc"]);
  assert.deepEqual([...ids].sort((a, b) => a - b), [7, 42]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/reader-store.test.ts`
Elvárt: FAIL, a modul nem létezik.

- [ ] **Step 3: A tár** (`lib/reader-store.ts`)

```ts
import { parseId } from "./pipeline/util.ts";

// The reader's own state (read / later flags, to-dos) with optimistic writes. Framework-free, so the
// ordering and rollback rules run under node --test; app/components/use-reader-state.ts binds it to React.

export type ItemState = { read: boolean; saved: boolean };
export type Flag = keyof ItemState;
export type Todo = { id: number; itemId: string | null; text: string; done: boolean };
/** GET /api/state. */
export type ReaderData = { states: Record<string, ItemState>; todos: Todo[] };
export type ReaderSnapshot = ReaderData & {
  /** The states as first loaded. The feed sorts by these, so a card marked read now stays in place until the next visit. */
  loadedStates: Record<string, ItemState>;
  syncing: boolean;
};
/** POST /api/state. */
export type StateWrite =
  | { action: "set_read" | "set_saved"; itemId: string; value: boolean }
  | { action: "add_todo"; text: string; itemId?: string }
  | { action: "set_todo"; id: number; value: boolean }
  | { action: "delete_todo"; id: number };
export type SendState = (write: StateWrite) => Promise<{ id?: number }>;
/** A hidden to-do. Call exactly one of the two, once; the undo toast guarantees that. */
export type PendingRemoval = { undo: () => void; commit: () => void };

export const EMPTY_ITEM_STATE: ItemState = { read: false, saved: false };
const FLAG_ACTIONS = { read: "set_read", saved: "set_saved" } as const;
/** app/api/state/route.ts and the todos.text check both stop at 180 characters. */
const MAX_TODO_TEXT = 180;

/** Library posts keep their read flag in item_states too. Radar ids look like `local-2026-W38-…`, so `post:` never collides. */
export const POST_STATE_PREFIX = "post:";
export const postStateKey = (postId: number) => `${POST_STATE_PREFIX}${postId}`;

export function readPostIds(itemIds: string[]): Set<number> {
  const ids = new Set<number>();
  for (const itemId of itemIds) {
    const postId = itemId.startsWith(POST_STATE_PREFIX) ? parseId(itemId.slice(POST_STATE_PREFIX.length)) : null;
    if (postId !== null) ids.add(postId);
  }
  return ids;
}

export async function postState(write: StateWrite): Promise<{ id?: number }> {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(write),
    // A delete made final by `pagehide` has to outlive the tab.
    keepalive: true,
  });
  if (!response.ok) throw new Error(`state write ${response.status}`);
  return (await response.json()) as { id?: number };
}

export async function loadState(): Promise<ReaderData> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`state read ${response.status}`);
  return (await response.json()) as ReaderData;
}

/** No network, for the offline preview and tests. `fail` rejects every write the way an offline fetch does. */
export function memorySend(fail = false): SendState {
  let nextId = 1000;
  return async (write) => {
    if (fail) throw new TypeError("Failed to fetch");
    return write.action === "add_todo" ? { id: nextId++ } : {};
  };
}

export function createReaderStore(send: SendState, onError: () => void, initial?: ReaderData) {
  let snapshot: ReaderSnapshot = {
    states: initial?.states ?? {},
    loadedStates: initial?.states ?? {},
    todos: initial?.todos ?? [],
    syncing: !initial,
  };
  const listeners = new Set<() => void>();
  const queues = new Map<string, Promise<void>>();
  /** The last value the server acknowledged, per write key. */
  const confirmed = new Map<string, boolean>();
  /** The newest write per key: only its failure decides what is shown. */
  const newest = new Map<string, number>();
  /** Flags changed before the first load finished; the load must not overwrite them. */
  const changedEarly: { itemId: string; flag: Flag }[] = [];
  let writeCount = 0;
  let nextTempId = -1;

  function update(next: Partial<ReaderSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  /** Runs `task` after every earlier write under `key` has settled: writes reach the server in click order. `task` never rejects. */
  function queue(key: string, task: () => Promise<void>) {
    queues.set(key, (queues.get(key) ?? Promise.resolve()).then(task));
  }

  function writeBoolean(key: string, current: boolean, value: boolean, show: (value: boolean) => void, write: StateWrite) {
    if (!confirmed.has(key)) confirmed.set(key, current);
    const writeId = ++writeCount;
    newest.set(key, writeId);
    show(value);
    queue(key, () =>
      send(write).then(
        () => {
          confirmed.set(key, value);
        },
        () => {
          onError();
          if (newest.get(key) === writeId) show(confirmed.get(key) ?? current);
        },
      ),
    );
  }

  function showFlag(itemId: string, flag: Flag, value: boolean) {
    const state = snapshot.states[itemId] ?? EMPTY_ITEM_STATE;
    update({ states: { ...snapshot.states, [itemId]: { ...state, [flag]: value } } });
  }

  function setFlag(itemId: string, flag: Flag, value: boolean): boolean {
    const current = (snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag];
    if (current === value) return false;
    if (snapshot.syncing) changedEarly.push({ itemId, flag });
    writeBoolean(`${flag}:${itemId}`, current, value, (shown) => showFlag(itemId, flag, shown), {
      action: FLAG_ACTIONS[flag],
      itemId,
      value,
    });
    return true;
  }

  function setTodos(todos: Todo[]) {
    update({ todos });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    /** Resolves once every write queued so far has settled. */
    settled: async () => {
      await Promise.all(queues.values());
    },
    /** The first GET /api/state. Flags and to-dos the reader changed while it loaded keep their local value. */
    hydrate(data: ReaderData) {
      const states = { ...data.states };
      for (const { itemId, flag } of changedEarly) {
        states[itemId] = { ...(states[itemId] ?? EMPTY_ITEM_STATE), [flag]: (snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag] };
      }
      const localIds = new Set(snapshot.todos.map((item) => item.id));
      update({
        states,
        loadedStates: data.states,
        todos: [...snapshot.todos, ...data.todos.filter((item) => !localIds.has(item.id))],
        syncing: false,
      });
    },
    hydrateFailed() {
      update({ syncing: false });
    },
    setFlag,
    toggleFlag: (itemId: string, flag: Flag) => setFlag(itemId, flag, !(snapshot.states[itemId] ?? EMPTY_ITEM_STATE)[flag]),
    /** False when nothing was added: blank text, or the item already has a to-do. */
    addTodo(rawText: string, itemId?: string): boolean {
      const text = rawText.trim().slice(0, MAX_TODO_TEXT);
      if (!text || (itemId !== undefined && snapshot.todos.some((item) => item.itemId === itemId))) return false;
      const tempId = nextTempId--;
      setTodos([{ id: tempId, itemId: itemId ?? null, text, done: false }, ...snapshot.todos]);
      const write: StateWrite = itemId === undefined ? { action: "add_todo", text } : { action: "add_todo", text, itemId };
      queue(`todo:${tempId}`, () =>
        send(write)
          .then(({ id }) => {
            if (typeof id !== "number") throw new Error("add_todo answered without an id");
            setTodos(snapshot.todos.map((item) => (item.id === tempId ? { ...item, id } : item)));
          })
          .catch(() => {
            setTodos(snapshot.todos.filter((item) => item.id !== tempId));
            onError();
          }),
      );
      return true;
    },
    /** A negative id is a to-do the server has not answered for yet: there is nothing to address it by. */
    setTodoDone(id: number, done: boolean): boolean {
      const current = snapshot.todos.find((item) => item.id === id);
      if (id < 0 || !current || current.done === done) return false;
      const show = (value: boolean) => setTodos(snapshot.todos.map((item) => (item.id === id ? { ...item, done: value } : item)));
      writeBoolean(`todo:${id}`, current.done, done, show, { action: "set_todo", id, value: done });
      return true;
    },
    /** Hides the to-do now; `commit` deletes it on the server (restoring it if that fails), `undo` puts it back. */
    removeTodo(id: number): PendingRemoval | null {
      const index = snapshot.todos.findIndex((item) => item.id === id);
      if (id < 0 || index === -1) return null;
      const removed = snapshot.todos[index];
      const restore = () => {
        const todos = [...snapshot.todos];
        todos.splice(Math.min(index, todos.length), 0, removed);
        setTodos(todos);
      };
      setTodos(snapshot.todos.filter((item) => item.id !== id));
      return {
        undo: restore,
        commit: () =>
          queue(`todo:${id}`, () =>
            send({ action: "delete_todo", id }).then(
              () => undefined,
              () => {
                restore();
                onError();
              },
            ),
          ),
      };
    },
  };
}

export type ReaderStore = ReturnType<typeof createReaderStore>;
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/reader-store.test.ts`
Elvárt: 13 teszt PASS.

Mutációs próba: a `writeBoolean` hibaágában a `confirmed.get(key) ?? current` helyett írj `!value`-t. A `when the newest of several writes fails…` tesztnek el kell buknia. Utána állítsd vissza.

- [ ] **Step 5: A hookok**

`app/components/use-reader-state.ts`:

```ts
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createReaderStore, loadState, memorySend, postState, type ReaderData } from "@/lib/reader-store";
import { toasts } from "./undo-toast";

/** The offline preview (app/dev/preview): seeded state and no network; `failWrites` acts like being offline. */
export type ReaderPreview = { data: ReaderData; failWrites: boolean };

/** The reader's flags and to-dos, loaded once per mount. Every failed write rolls back and raises the error toast. */
export function useReaderState(preview?: ReaderPreview) {
  const [store] = useState(() =>
    createReaderStore(preview ? memorySend(preview.failWrites) : postState, () => toasts.show({ kind: "failed" }), preview?.data),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const seeded = preview !== undefined;

  useEffect(() => {
    if (seeded) return;
    let live = true;
    loadState().then(
      (data) => {
        if (live) store.hydrate(data);
      },
      () => {
        if (live) store.hydrateFailed();
      },
    );
    return () => {
      live = false;
    };
  }, [store, seeded]);

  return { store, ...snapshot };
}
```

`app/components/use-model-context-tools.ts`: a dashboard mostani `document.modelContext` effektje költözik ide. A tulajdonos döntése szerint marad, csak külön fájlba kerül. A két eszköz neve, leírása és sémája változatlan, a végrehajtás a tárat hívja:

```ts
"use client";

import { useEffect } from "react";
import type { ReaderStore } from "@/lib/reader-store";

// WebMCP-style tools (`document.modelContext.registerTool`): let an in-browser AI agent mark items read
// and add to-dos for the signed-in reader. Does nothing in a browser without the API.

type ModelContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function useModelContextTools(store: ReaderStore) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };
    register({
      name: "mark_digest_item_read",
      title: "Mark digest item read",
      description: "Mark one visible AI digest item as read for the signed-in reader.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string" }, value: { type: "boolean" } },
        required: ["itemId", "value"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const { itemId, value } = input as { itemId: string; value: boolean };
        store.setFlag(itemId, "read", value);
        await store.settled();
        // After a failed write this is the rolled-back value, not the requested one.
        return { itemId, read: store.getSnapshot().states[itemId]?.read ?? false };
      },
    });
    register({
      name: "add_digest_todo",
      title: "Add digest to-do",
      description: "Add a short personal follow-up to the signed-in reader's digest list.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1, maxLength: 180 } },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const created = store.addTodo((input as { text: string }).text);
        await store.settled();
        return { created };
      },
    });
    return () => lifecycle.abort();
  }, [store]);
}
```

- [ ] **Step 6: A teendő-panel** (`app/components/reader-panel.tsx`)

```tsx
import { useState } from "react";
import { Check, ListTodo, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { Language } from "@/data/digest-types";
import type { Todo } from "@/lib/reader-store";

const copy = {
  hu: {
    progress: "Heti haladás",
    syncing: "SZINKRON…",
    synced: "SZINKRONBAN",
    todo: "Személyes To-do",
    placeholder: "Mit olvassak el később?",
    add: "Hozzáadás",
    delete: "Törlés",
    empty: "(づ ◕‿◕ )づ Még üres. Írj be egy teendőt fent, vagy egy hír „+ teendő” gombjával tedd ide.",
    invite: "CSAK MEGHÍVÓVAL",
    daily: "NAPI FUTÁS · 05:00 UTC",
    freeze: "HETI ZÁRÁS · VAS 24:00",
  },
  en: {
    progress: "Weekly progress",
    syncing: "SYNC…",
    synced: "SYNCED",
    todo: "Personal to-do",
    placeholder: "What should I read later?",
    add: "Add",
    delete: "Delete",
    empty: "(づ ◕‿◕ )づ Nothing yet. Type one above, or use + to-do on a story.",
    invite: "INVITE-ONLY PROFILES",
    daily: "DAILY RUN · 05:00 UTC",
    freeze: "WEEKLY FREEZE · SUN 24:00",
  },
};

/** Weekly progress and the personal to-do list: the 2xl side column, and the header Sheet below 2xl. */
export function ReaderPanel({ language, progress, readCount, total, syncing, todos, onAdd, onToggle, onDelete }: {
  language: Language;
  progress: number;
  readCount: number;
  total: number;
  syncing: boolean;
  todos: Todo[];
  /** False when nothing was added (blank text): the input keeps what was typed. */
  onAdd: (text: string) => boolean;
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [text, setText] = useState("");
  const t = copy[language];
  const openTodos = todos.filter((item) => !item.done).length;
  const add = () => {
    if (onAdd(text)) setText("");
  };

  return (
    <>
      <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.14em]">{t.progress}</p>
          <span className="font-display text-3xl text-signal">{progress}%</span>
        </div>
        <Progress value={progress} className="mt-4 h-3 rounded-none bg-ink/15 [&_[data-slot=progress-indicator]]:bg-signal" />
        <p className="mt-3 font-mono text-[11px] text-ink/55">
          {readCount} / {total} · {syncing ? t.syncing : t.synced}
        </p>
      </section>

      <section className="mt-7">
        <div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-signal" />
            <h2 className="font-display text-2xl">{t.todo}</h2>
          </div>
          <span className="font-mono text-xs">{openTodos}</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder={t.placeholder}
            aria-label={t.todo}
            className="min-h-10 flex-1 border-2 border-ink bg-paper focus-visible:border-signal"
          />
          <Button size="icon-lg" variant="signal" onClick={add} aria-label={t.add}>
            <Plus />
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {todos.map((item) => (
            <li key={item.id} className={`flex items-center gap-2 border border-ink/25 bg-paper/60 pl-3 ${item.id < 0 ? "opacity-60" : ""}`}>
              {/* The label is the 40px target; the 16px checkbox alone would be too small. */}
              <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={item.done}
                  disabled={item.id < 0}
                  onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                  className="border-ink data-[state=checked]:bg-ink"
                />
                <span className={`min-w-0 flex-1 text-sm leading-5 [overflow-wrap:anywhere] ${item.done ? "text-ink/40 line-through" : ""}`}>
                  {item.text}
                </span>
              </label>
              <Button
                variant="ghost"
                size="icon-lg"
                disabled={item.id < 0}
                onClick={() => onDelete(item.id)}
                aria-label={t.delete}
                className="size-10 hover:bg-signal/20 sm:size-8"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {!todos.length && <li className="py-7 text-center font-mono text-xs leading-5 text-ink/55">{t.empty}</li>}
        </ul>
      </section>

      <section className="mt-8 border-t-2 border-ink pt-5 font-mono text-[11px] leading-5 text-ink/55">
        <p className="flex items-center gap-2 text-signal">
          <Check className="size-3" /> {t.invite}
        </p>
        <p>{t.daily}</p>
        <p>{t.freeze}</p>
      </section>
    </>
  );
}
```

A napi futás időpontja a `vercel.json` szerint 05:00 UTC. A régi „07:00” télen hibás volt (kódbázis-átnézés, 12. kockázat).

- [ ] **Step 7: A dashboard a tárra** (`app/components/digest-dashboard.tsx`, pontos cserék a 2. feladat utáni állapoton)

1. **Importok:**
   - `import { useCallback, useEffect, useMemo, useState } from "react";` helyett `import { useMemo, useState } from "react";`;
   - a lucide-importból törlődik a `Check`, a `Plus` és a `Trash2`;
   - a `Progress` import törlődik;
   - a `Checkbox` marad, mert a hírkártya olvasott-jelölője még használja;
   - a `./language-context` import alá:
   ```tsx
   import { EMPTY_ITEM_STATE } from "@/lib/reader-store";
   import { ReaderPanel } from "./reader-panel";
   import { isUndoToast, toasts } from "./undo-toast";
   import { useModelContextTools } from "./use-model-context-tools";
   import { useReaderState, type ReaderPreview } from "./use-reader-state";
   ```
2. **Típusok:** az `ItemState`, az `EMPTY_ITEM_STATE` és a `Todo` helyi definíciója törlődik. A `type Filter` marad.
3. **A `ui` objektum:** mindkét nyelvből törlődik a `progress`, a `todo`, a `todoPlaceholder` és az `add` kulcs, mert a `reader-panel.tsx`-be költöznek.
4. **A `mutate` függvény** törlődik.
5. **Új prop:** a `DigestDashboard` props-típusába az `archived` után:
   ```tsx
   /** The offline preview (app/dev/preview): seeded reader state, no network. */
   preview?: ReaderPreview;
   ```
   A paraméterlistába: `preview,`.
6. **Az állapot:**
   - a `const [states, setStates] = …`, a `const [todos, setTodos] = …`, a `const [todoText, setTodoText] = …` és a `const [syncing, setSyncing] = …` sor helyére ez a két sor kerül (a `filter` előtte és a `const t = ui[language];` utána marad):
   ```tsx
   const { store, states, todos, syncing } = useReaderState(preview);
   useModelContextTools(store);
   ```
   - a `const refreshState = useCallback(` sortól a `document.modelContext` effekt záró `}, [refreshState]);` soráig minden törlődik.
7. **Műveletek:** az `async function setItemState(` sortól a `readerPanel` JSX-változó záró `);` soráig minden erre cserélődik:
   ```tsx
   function deleteTodo(id: number) {
     const removal = store.removeTodo(id);
     if (removal) toasts.show({ kind: "todoDeleted", ...removal });
   }

   // Rendered twice: as the 2xl side column, and inside the header Sheet below 2xl.
   const readerPanel = (
     <ReaderPanel
       language={language}
       progress={progress}
       readCount={readCount}
       total={digestItems.length}
       syncing={syncing}
       todos={todos}
       onAdd={(text) => store.addTodo(text)}
       onToggle={(id, done) => store.setTodoDone(id, done)}
       onDelete={deleteTodo}
     />
   );
   ```
8. **A hírkártya:**
   - `states[item.id] ?? { read: false, saved: false }` helyett `states[item.id] ?? EMPTY_ITEM_STATE`;
   - a mentés gomb `onClick`-je: `() => store.toggleFlag(item.id, "saved")`;
   - a jelölőnégyzet `onCheckedChange`-e: `(checked) => store.setFlag(item.id, "read", checked === true)`.
9. **A panel nem modális:**
   - `<Sheet>` helyett `<Sheet modal={false}>`;
   - a `SheetContent`-re:
   ```tsx
   // Non-modal, so the undo toast above it stays clickable, reachable by Tab and announced.
   onInteractOutside={(event) => {
     if (isUndoToast(event.target)) event.preventDefault();
   }}
   ```

   Modális panel mellett a Radix a panelen kívül mindent `aria-hidden`-né és kattinthatatlanná tesz, és csapdába ejti a fókuszt. A panelből törölt teendő visszavonás-csíkja így elérhetetlen lenne. Mobilon ez minden törlésre igaz, mert ott a panel mindig Sheet.

- [ ] **Step 8: Mintaadatos olvasói állapot az előnézetben**

`lib/fixtures.ts`: import `import type { ReaderData } from "./reader-store.ts";`, és a fájl végére:

```ts
/** One read item (sorted to the end of the feed), one saved Top 3 item, a linked to-do, a long one and a done one. */
export const previewReader: ReaderData = {
  states: {
    "local-2026-W39-read": { read: true, saved: false },
    "companies-2026-W39-must-2": { read: false, saved: true },
  },
  todos: [
    { id: 1, itemId: null, text: `Hosszú teendő: ${LONG_WORD}`, done: false },
    { id: 2, itemId: "local-2026-W39-must-3", text: "Minta hír: local-2026-W39-must-3", done: false },
    { id: 3, itemId: null, text: "Kész teendő", done: true },
  ],
};
```

`app/dev/preview/page.tsx`:
- a `searchParams` típusa `Promise<{ view?: string; fail?: string }>`;
- a destrukturálás `const [{ view: requested, fail }, language] = …`, alatta `const failWrites = fail === "1";`;
- a fixtures-importba kerül a `previewReader`;
- `<PreviewNav current={view} failWrites={failWrites} />`;
- a két dashboard-sor ez lesz:

```tsx
      {view === "radar" && (
        <DigestDashboard key={String(failWrites)} issue={previewIssue} items={previewItems} githubTop10={previewGithub} preview={{ data: previewReader, failWrites }} />
      )}
      {view === "radar-empty" && (
        <DigestDashboard key={String(failWrites)} issue={previewIssue} items={[]} githubTop10={[]} preview={{ data: { states: {}, todos: [] }, failWrites }} />
      )}
```

A `key` új tárat ad, amikor a `fail` kapcsoló változik. A poszt-oldalon `<PreviewNav current="post" failWrites={false} />`.

`app/dev/preview/preview-nav.tsx`: a nézetlinkek a `fail`-t viszik tovább, és a listanézeteken kerül mellé egy kapcsoló:

```tsx
export function PreviewNav({ current, failWrites }: { current: PreviewView | "post"; failWrites: boolean }) {
  const fail = failWrites ? "&fail=1" : "";
  return (
    <nav aria-label="Preview views" className="flex flex-wrap gap-x-3 border-b-2 border-signal bg-ink px-4 font-mono text-xs text-paper">
      {PREVIEW_VIEWS.map((view) => (
        <Link key={view} href={`/dev/preview?view=${view}${fail}`} aria-current={view === current ? "page" : undefined} className={linkClass}>
          {view}
        </Link>
      ))}
      <Link href="/dev/preview/post" aria-current={current === "post" ? "page" : undefined} className={linkClass}>
        post
      </Link>
      {current !== "post" && (
        // Every write rejects like an offline fetch: the rollback and the error toast become visible.
        <Link href={`/dev/preview?view=${current}${failWrites ? "" : "&fail=1"}`} className="focus-ring ml-auto flex min-h-10 items-center text-signal">
          {failWrites ? "writes: fail" : "writes: ok"}
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 9: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón. Ennek nem szabad találatot adnia: `grep -n "modelContext\|refreshState\|mutate(" app/components/digest-dashboard.tsx`.

A kontroller Playwrighttal nézi, 1280 px-en, a `/dev/preview?view=radar` oldalon:
1. a panelben töröl egy teendőt; a csík megjelenik, a „Visszavonás” visszahozza, és a panel nyitva marad;
2. `&fail=1` mellett a „Mentés” gomb egy pillanatra aktív, aztán visszaáll, és megjelenik a hibacsík.

- [ ] **Step 10: Commit**

```bash
git add lib/reader-store.ts lib/reader-store.test.ts lib/fixtures.ts app/components app/dev
git commit -m "refactor: move reader state into an optimistic store with rollback"
```

---

### Task 7: Kártyák: minden gomb a láblécben, Top 3 teljes kártyaként, olvasatlanok elöl

**Files:**
- Create: `lib/feed.ts`, `lib/feed.test.ts`, `app/components/story-card.tsx`, `app/components/tag.tsx`
- Modify: `app/components/digest-dashboard.tsx` (teljes újraírás), `app/components/post-blocks.tsx`, `app/(app)/library/library-view.tsx`, `app/(app)/library/[id]/post-article.tsx`

**Interfaces:**
- Consumes: `useReaderState`, `ReaderPreview`, `ReaderPanel`, `useModelContextTools`, `EMPTY_ITEM_STATE`, `Flag`, `ItemState` (6. feladat); `toasts`, `isUndoToast` (5. feladat); `digestItem` (4. feladat, a tesztben); `useIsMobile` (`hooks/use-mobile.ts`)
- Produces:
  - `type Filter = "all" | DigestCategory | "saved"`, `sortUnreadFirst<T>(items, states): T[]`, `feedItems(items, filter, states, loadedStates): DigestItem[]`
  - `Tag(props: { tag: string })`
  - `type CardActions = { onOpen(item: DigestItem): void; onToggle(itemId: string, flag: Flag): void; onAddTodo(item: DigestItem): void }`, `type CardProps = { item; state: ItemState; hasTodo: boolean; language; actions: CardActions }`
  - `StoryCard(props: CardProps)`, `MustReadCard(props: CardProps & { rank: number })`

- [ ] **Step 1: A teszt megírása** (`lib/feed.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { feedItems, sortUnreadFirst } from "./feed.ts";
import { digestItem } from "./fixtures.ts";

const read = { read: true, saved: false };
const ids = (items: { id: string }[]) => items.map((item) => item.id);

test("sortUnreadFirst moves read items to the end of their own group", () => {
  const items = [digestItem("m1", { mustRead: true }), digestItem("m2", { mustRead: true }), digestItem("a"), digestItem("b"), digestItem("c")];
  assert.deepEqual(ids(sortUnreadFirst(items, { m1: read, a: read })), ["m2", "m1", "b", "c", "a"]);
});

test("feedItems leaves the Top 3 out of the all view only", () => {
  const items = [digestItem("m", { mustRead: true, category: "research" }), digestItem("r", { category: "research" }), digestItem("l")];
  assert.deepEqual(ids(feedItems(items, "all", {}, {})), ["r", "l"]);
  assert.deepEqual(ids(feedItems(items, "research", {}, {})), ["m", "r"], "a category view has no Top 3 above it");
});

test("feedItems sorts by the loaded states, so a card read just now stays put", () => {
  const items = [digestItem("a"), digestItem("b")];
  assert.deepEqual(ids(feedItems(items, "all", { a: read }, {})), ["a", "b"]);
  assert.deepEqual(ids(feedItems(items, "all", { a: read }, { a: read })), ["b", "a"]);
});

test("the saved view follows the live state", () => {
  const items = [digestItem("a"), digestItem("b", { mustRead: true })];
  assert.deepEqual(ids(feedItems(items, "saved", { b: { read: false, saved: true } }, {})), ["b"]);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/feed.test.ts`
Elvárt: FAIL, a `feed.ts` nem létezik.

- [ ] **Step 3: A megvalósítás** (`lib/feed.ts`)

```ts
import type { DigestCategory, DigestItem } from "../data/digest-types.ts";
import type { ItemState } from "./reader-store.ts";

export type Filter = "all" | DigestCategory | "saved";

/** Unread before read, within the must-read group and within the rest; otherwise the server's must-read/score order. */
export function sortUnreadFirst<T extends { id: string; mustRead?: boolean }>(items: T[], states: Record<string, ItemState>): T[] {
  const rank = (item: T) => (item.mustRead ? 0 : 2) + (states[item.id]?.read ? 1 : 0);
  return [...items].sort((a, b) => rank(a) - rank(b)); // Array.prototype.sort is stable
}

/**
 * The cards under the Top 3. "all" leaves the must-read items out (they are the Top 3 above it); a
 * category or "saved" view has no Top 3, so its must-read items stay in. Sorted by `loadedStates`,
 * not the live states, so marking a card read doesn't move it until the next visit.
 */
export function feedItems(
  items: DigestItem[],
  filter: Filter,
  states: Record<string, ItemState>,
  loadedStates: Record<string, ItemState>,
): DigestItem[] {
  const visible = items.filter((item) =>
    filter === "all" ? !item.mustRead : filter === "saved" ? states[item.id]?.saved : item.category === filter,
  );
  return sortUnreadFirst(visible, loadedStates);
}
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/feed.test.ts`
Elvárt: 4 teszt PASS.

- [ ] **Step 5: `Tag`** (`app/components/tag.tsx`), és a négy kézzel írt chip cseréje

```tsx
/** A `#tag` chip. The border follows the text colour, so it works on paper, cream and ink cards alike. */
export function Tag({ tag }: { tag: string }) {
  return <span className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>;
}
```

A cserék, mindegyik `import { Tag } from "@/app/components/tag";` importtal (a `post-blocks.tsx`-ben `./tag`):
- `app/components/post-blocks.tsx`: `{block.topics.slice(0, 8).map((topic) => <Tag key={topic} tag={topic} />)}`;
- `app/(app)/library/library-view.tsx`: `{post.tags.map((tag) => <Tag key={tag} tag={tag} />)}`;
- `app/(app)/library/[id]/post-article.tsx`: `{post.tags.map((tag) => <Tag key={tag} tag={tag} />)}`.

A negyedik a kártya, lásd lent.

- [ ] **Step 6: A kártyák** (`app/components/story-card.tsx`)

```tsx
import { Bookmark, BookmarkCheck, Check, Clock3, ExternalLink, ListChecks, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DigestItem, Language } from "@/data/digest-types";
import type { Flag, ItemState } from "@/lib/reader-store";
import { Tag } from "./tag";

const copy = {
  hu: {
    score: "PONT",
    min: "PERC",
    why: "MIÉRT FONTOS",
    open: "Megnyitás",
    later: "Később",
    addTodo: "Teendőhöz adás",
    hasTodo: "Már a teendők között",
    read: "Olvasott",
  },
  en: {
    score: "SCORE",
    min: "MIN",
    why: "WHY IT MATTERS",
    open: "Open source",
    later: "Later",
    addTodo: "Add to to-dos",
    hasTodo: "Already a to-do",
    read: "Read",
  },
};

export type CardActions = {
  /** The Open link was followed: marks the item read. */
  onOpen: (item: DigestItem) => void;
  onToggle: (itemId: string, flag: Flag) => void;
  onAddTodo: (item: DigestItem) => void;
};

export type CardProps = { item: DigestItem; state: ItemState; hasTodo: boolean; language: Language; actions: CardActions };

const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";

/** A feed card: meta (a 96px gutter from lg up), the text, then every action in one row at the bottom. */
export function StoryCard(props: CardProps) {
  const { item, state, language } = props;
  const t = copy[language];
  return (
    <article className={`story-card border-2 border-ink bg-paper p-5 sm:p-6 ${state.read ? "story-read" : ""}`}>
      <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-5">
        {/* A row of meta on narrow screens, the 96px gutter from lg up. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px] leading-5 text-ink/55 lg:block">
          <p className="text-signal">{item.publishedLabel}</p>
          <p className="lg:mt-2">
            {t.score} <span className="font-display text-xl text-ink lg:block lg:text-3xl">{item.score}</span>
          </p>
          <p className="flex items-center gap-1 lg:mt-2">
            <Clock3 className="size-3" /> {item.readMinutes} {t.min}
          </p>
        </div>
        <div className="min-w-0">
          <CardText {...props} titleClassName="max-w-3xl text-[clamp(1.5rem,3vw,2.6rem)] leading-[0.98] tracking-tight" />
          <CardFooter {...props} />
        </div>
      </div>
    </article>
  );
}

/** A Top 3 card: rank and score on top, then the same text and actions as a feed card. */
export function MustReadCard({ rank, ...props }: CardProps & { rank: number }) {
  const { item, state } = props;
  return (
    <article className={`must-card border-2 border-ink bg-paper p-5 ${state.read ? "story-read" : ""}`}>
      <div className="mb-6 flex items-start justify-between">
        <span className="font-display text-5xl text-signal">{String(rank).padStart(2, "0")}</span>
        <span className="border border-ink px-2 py-1 font-mono text-[10px]">{item.score}/100</span>
      </div>
      <CardText {...props} titleClassName="text-2xl leading-[1.02]" />
      <CardFooter {...props} />
    </article>
  );
}

function CardText({ item, language, titleClassName }: CardProps & { titleClassName: string }) {
  const t = copy[language];
  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.12em] text-signal [overflow-wrap:anywhere]">{item.source}</p>
      <h2 className={`mt-3 font-display [overflow-wrap:anywhere] ${titleClassName}`}>{item.title[language]}</h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-ink/72">{item.summary[language]}</p>
      <div className="mt-5 border-l-4 border-signal pl-4">
        <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.why}</p>
        <p className="mt-1 text-sm leading-6">{item.why[language]}</p>
      </div>
      {item.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Tag key={tag} tag={tag} />
          ))}
        </div>
      )}
    </>
  );
}

/** [Open] [rating: milestone B] [Later] [+ to-do] … [Read]: every action in one row at the bottom, in thumb reach. */
function CardFooter({ item, state, hasTodo, language, actions }: CardProps) {
  const t = copy[language];
  const todoLabel = hasTodo ? t.hasTodo : t.addTodo;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Button asChild variant="ink" className="min-h-10">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => actions.onOpen(item)}
          onAuxClick={(event) => {
            if (event.button === 1) actions.onOpen(item); // a middle click opens a tab too
          }}
        >
          {t.open} <ExternalLink />
        </a>
      </Button>
      {/* Milestone B puts the 👎 👍 ❤ RatingControl here, between Open and Later (spec 1.4.3). */}
      <Button
        variant="brutal"
        size="icon-lg"
        aria-pressed={state.saved}
        aria-label={t.later}
        title={t.later}
        onClick={() => actions.onToggle(item.id, "saved")}
        className={`size-10 sm:size-8 ${pressedClass}`}
      >
        {state.saved ? <BookmarkCheck /> : <Bookmark />}
      </Button>
      <Button
        variant="brutal"
        size="icon-lg"
        disabled={hasTodo}
        aria-label={todoLabel}
        title={todoLabel}
        onClick={() => actions.onAddTodo(item)}
        className="size-10 sm:size-8"
      >
        {hasTodo ? <ListChecks /> : <ListPlus />}
      </Button>
      <Button
        variant="brutal"
        aria-pressed={state.read}
        onClick={() => actions.onToggle(item.id, "read")}
        className={`ml-auto min-h-10 sm:min-h-8 ${pressedClass}`}
      >
        <Check /> {t.read}
      </Button>
    </div>
  );
}
```

A spec 1.4.3 sorrendje: `[Megnyitás] [👎 👍 ❤] [Később] [+ teendő]`. A kézi „Olvasott” kapcsoló (1.4.1) ebben nem szerepel, de az „minden gomb a kártya aljára” szabály ide hozza, ezért a sor végére kerül. A Top 3 forrás-linkje helyett a teljes lábléc szerepel, így az érintési felület is legalább 40 px (1.4.9).

- [ ] **Step 7: A dashboard újraírása** (`app/components/digest-dashboard.tsx`, a teljes fájl)

```tsx
"use client";

import { useState, type ReactNode } from "react";
import {
  Bookmark,
  Building2,
  ExternalLink,
  FlaskConical,
  GitFork,
  ListTodo,
  Newspaper,
  Radar,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentIssue, DigestItem, GithubTopEntry } from "@/data/digest-types";
import { useIsMobile } from "@/hooks/use-mobile";
import { feedItems, type Filter } from "@/lib/feed";
import { EMPTY_ITEM_STATE } from "@/lib/reader-store";
import { useLanguage } from "./language-context";
import { ReaderPanel } from "./reader-panel";
import { MustReadCard, StoryCard, type CardActions } from "./story-card";
import { isUndoToast, toasts } from "./undo-toast";
import { useModelContextTools } from "./use-model-context-tools";
import { useReaderState, type ReaderPreview } from "./use-reader-state";

const copy = {
  hu: {
    live: "ÉLŐ KIADÁS",
    archived: "LEZÁRT KIADÁS",
    categories: "Kategóriák",
    panel: "Haladás és to-do",
    updated: "Napi frissítés",
    archive: "Heti zárás",
    status: "ÁLLAPOT",
    frozen: "LEZÁRVA",
    collecting: "GYŰJTÉS",
    lead: "Helyi modellek · kutatás · élvonalbeli cégek · repók",
    all: "Aktuális radar",
    local: "Local LLM Lab",
    research: "Kutatási radar",
    companies: "AI cégek",
    github: "GitHub Top 10",
    saved: "Mentve későbbre",
    mustRead: "TOP 3 · KÖTELEZŐ",
    feed: "A HÉT ÉLŐ ADATFOLYAMA",
    tracked: "FIGYELT REPO",
    sample: "Ez a heti kiadás még üres — a napi automatikus futás tölti fel.",
    emptyAll: "A hét minden híre fent, a Top 3-ban van.",
    emptySaved: "Még nincs mentett hír. A kártyák Később gombjával gyűjtheted ide.",
    emptyCategory: "Ebben a kategóriában ezen a héten nincs hír.",
    emptyGithub: "Ezen a héten még nincs GitHub-lista, a napi futás tölti fel.",
    showAll: "Összes hír",
  },
  en: {
    live: "LIVE ISSUE",
    archived: "ARCHIVED ISSUE",
    categories: "Categories",
    panel: "Progress & to-do",
    updated: "Daily refresh",
    archive: "Weekly close",
    status: "STATUS",
    frozen: "FROZEN",
    collecting: "COLLECTING",
    lead: "Local models · research · frontier companies · repositories",
    all: "Current radar",
    local: "Local LLM Lab",
    research: "Research radar",
    companies: "AI companies",
    github: "GitHub Top 10",
    saved: "Saved for later",
    mustRead: "TOP 3 · MUST READ",
    feed: "THE WEEK'S LIVE SIGNAL",
    tracked: "TRACKED REPO",
    sample: "This week's issue is still empty — the daily automated run fills it.",
    emptyAll: "Every story this week is up top, in the Top 3.",
    emptySaved: "Nothing saved yet. Collect stories here with the Later button on a card.",
    emptyCategory: "No story in this category this week.",
    emptyGithub: "No GitHub list this week yet; the daily run fills it.",
    showAll: "All stories",
  },
} as const;

const filters: { id: Filter; icon: LucideIcon }[] = [
  { id: "all", icon: Radar },
  { id: "local", icon: Zap },
  { id: "research", icon: FlaskConical },
  { id: "companies", icon: Building2 },
  { id: "github", icon: GitFork },
  { id: "saved", icon: Bookmark },
];

export function DigestDashboard({
  issue,
  items,
  githubTop10,
  archived = false,
  preview,
}: {
  issue: CurrentIssue;
  items: DigestItem[];
  githubTop10: GithubTopEntry[];
  /** A closed week opened from /archive: same reading UI, no "live" framing. */
  archived?: boolean;
  /** The offline preview (app/dev/preview): seeded reader state, no network. */
  preview?: ReaderPreview;
}) {
  const { language } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const { store, states, loadedStates, todos, syncing } = useReaderState(preview);
  useModelContextTools(store);
  const isMobile = useIsMobile();
  const t = copy[language];

  const topThree = items.filter((item) => item.mustRead);
  const feed = feedItems(items, filter, states, loadedStates);
  const readCount = items.filter((item) => states[item.id]?.read).length;
  const progress = items.length ? Math.round((readCount / items.length) * 100) : 0;
  const openTodos = todos.filter((todo) => !todo.done).length;
  const itemsWithTodo = new Set(todos.map((todo) => todo.itemId));

  const actions: CardActions = {
    onOpen(item) {
      // Opening is reading. Already read means nothing changed, so there is nothing to undo.
      if (store.setFlag(item.id, "read", true)) {
        toasts.show({ kind: "markedRead", undo: () => store.setFlag(item.id, "read", false) });
      }
    },
    onToggle: (itemId, flag) => store.toggleFlag(itemId, flag),
    onAddTodo(item) {
      if (store.addTodo(item.title[language], item.id)) toasts.show({ kind: "todoAdded" });
    },
  };

  function deleteTodo(id: number) {
    const removal = store.removeTodo(id);
    if (removal) toasts.show({ kind: "todoDeleted", ...removal });
  }

  const cardProps = (item: DigestItem) => ({
    item,
    state: states[item.id] ?? EMPTY_ITEM_STATE,
    hasTodo: itemsWithTodo.has(item.id),
    language,
    actions,
  });

  const emptyFeed = filter === "saved" ? t.emptySaved : filter !== "all" ? t.emptyCategory : items.length ? t.emptyAll : null;

  // Rendered twice: as the 2xl side column, and inside the header Sheet below 2xl.
  const panel = (
    <ReaderPanel
      language={language}
      progress={progress}
      readCount={readCount}
      total={items.length}
      syncing={syncing}
      todos={todos}
      onAdd={(text) => store.addTodo(text)}
      onToggle={(id, done) => store.setTodoDone(id, done)}
      onDelete={deleteTodo}
    />
  );

  return (
    <div className="min-w-0 bg-cream text-ink">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b-2 border-ink bg-cream px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {!archived && <span className="live-pulse shrink-0" />}
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] tracking-[0.2em] text-signal">{archived ? t.archived : t.live}</p>
            <p className="font-display text-lg leading-none">{issue.label}</p>
          </div>
        </div>
        {/* Non-modal, so the undo toast above it stays clickable, reachable by Tab and announced. */}
        <Sheet modal={false}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={t.panel}
              className="h-10 shrink-0 rounded-full border-ink bg-transparent font-mono text-xs hover:bg-ink hover:text-paper sm:h-9 2xl:hidden"
            >
              <ListTodo /> {progress}%{openTodos > 0 && <span className="text-signal">· {openTodos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            // Focusing the to-do input on open would pop the phone keyboard over the panel.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (isUndoToast(event.target)) event.preventDefault();
            }}
            className={`overflow-y-auto border-ink bg-cream p-5 pt-12 text-ink ${isMobile ? "max-h-[85dvh] border-t-2" : "w-[88vw] max-w-sm border-l-2"}`}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t.panel}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* The chip bar belongs to this column, so the 2xl panel beside it is not covered. */}
        <div className="min-w-0">
          <nav
            aria-label={t.categories}
            className="sticky top-16 z-10 flex gap-2 overflow-x-auto border-b-2 border-ink bg-cream px-4 py-2 scrollbar-none sm:px-7"
          >
            {filters.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className="focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs aria-pressed:bg-signal"
              >
                <Icon className="size-3.5" /> {t[id]}
              </button>
            ))}
          </nav>

          <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
            <section className="relative overflow-hidden border-2 border-ink bg-ink px-5 py-7 text-paper sm:px-8 sm:py-9">
              <div className="signal-grid" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                {/* Sized in cqi, not vw: the nav and the panel make this column much narrower than the viewport. */}
                <div className="min-w-0 @container">
                  <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-paper/55">
                    <span className="border border-paper/30 px-2 py-1">AUTO / 自動</span>
                    <span>
                      {t.updated}: {issue.updated}
                    </span>
                  </div>
                  <h1 className="max-w-4xl font-display text-[clamp(2.6rem,15cqi,8rem)] leading-[0.77] tracking-[-0.07em]">
                    AI WEEKLY<span className="text-signal">{"//"}</span>
                  </h1>
                  <p className="mt-5 max-w-2xl font-mono text-sm leading-6 text-paper/65">{t.lead}</p>
                </div>
                <div className="border-l border-paper/25 pl-5 font-mono text-xs leading-6 text-paper/60">
                  <p className="text-signal">{t.archive}</p>
                  <p className="text-lg font-bold text-paper">{issue.archiveAt}</p>
                  <p>
                    {t.status}: {archived ? t.frozen : t.collecting}
                  </p>
                </div>
              </div>
            </section>

            {!items.length && !archived && (
              <div className="mt-4 border border-signal/50 bg-signal/10 px-4 py-3 font-mono text-xs leading-5 text-ink/70">※ {t.sample}</div>
            )}

            {filter === "github" ? (
              <section className="mt-9">
                <SectionLabel icon={GitFork} label="GITHUB / TOP 10" />
                {githubTop10.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {githubTop10.map(([repo, focus, url], index) => (
                      <a
                        key={repo}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring group flex items-center gap-4 border-2 border-ink bg-paper p-4 transition hover:-translate-y-0.5 hover:bg-signal"
                      >
                        <span className="font-display text-3xl text-signal group-hover:text-ink">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-sm font-bold">{repo}</span>
                          <span className="block text-sm text-ink/55 group-hover:text-ink/75">{focus}</span>
                        </span>
                        <span className="hidden font-mono text-[10px] sm:inline">{t.tracked}</span>
                        <ExternalLink className="size-4" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyNote>{t.emptyGithub}</EmptyNote>
                )}
              </section>
            ) : (
              <>
                {filter === "all" && topThree.length > 0 && (
                  <section className="mt-9 @container">
                    <SectionLabel icon={Zap} label={t.mustRead} />
                    <div className="grid gap-4 @3xl:grid-cols-3">
                      {topThree.map((item, index) => (
                        <MustReadCard key={item.id} rank={index + 1} {...cardProps(item)} />
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-11">
                  <SectionLabel icon={Newspaper} label={t.feed} />
                  <div className="space-y-4">
                    {feed.map((item) => (
                      <StoryCard key={item.id} {...cardProps(item)} />
                    ))}
                    {!feed.length && emptyFeed && (
                      <EmptyNote>
                        <p>{emptyFeed}</p>
                        {filter !== "all" && (
                          <Button variant="brutal" className="mt-4 min-h-10" onClick={() => setFilter("all")}>
                            {t.showAll}
                          </Button>
                        )}
                      </EmptyNote>
                    )}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>

        <aside className="hidden border-l-2 border-ink bg-cream px-5 py-7 2xl:sticky 2xl:top-16 2xl:block 2xl:h-[calc(100dvh-4rem)] 2xl:overflow-y-auto">
          {panel}
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b-2 border-ink pb-3">
      <span className="grid size-8 place-items-center bg-signal">
        <Icon className="size-4" />
      </span>
      <h2 className="font-mono text-xs font-bold tracking-[0.15em]">{label}</h2>
    </div>
  );
}

/** An empty view says what to do next (spec 1.4.10). */
function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="border-2 border-dashed border-ink/35 p-10 text-center font-mono text-sm text-ink/55">{children}</div>;
}
```

Mit változtat a dashboardon:
- a Top 3 teljes kártya, ugyanazokkal a gombokkal, és a „Minden” nézetben nem ismétlődik lent;
- a Megnyitás olvasottnak jelöl, visszavonással;
- a „+ teendő” a hír `id`-jével küldi a teendőt;
- a teendő-panel mobilon alulról nyílik (`side="bottom"`);
- az üres nézetek megmondják, mi a teendő.

- [ ] **Step 8: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón. Ennek nem szabad találatot adnia (a `tag.tsx` kivételével): `grep -rn "border-ink/30 px-2 py-1 font-mono text-\[10px\]\|border-current/30 px-2 py-1" app --include=*.tsx | grep -v tag.tsx`.

A kontroller Playwrighttal nézi a `/dev/preview?view=radar` oldalt 360 és 1280 px-en:
- a Top 3 kártyák láblécében ott vannak a gombok;
- a `local-2026-W39-read` kártya a lista végén van, halványítva;
- a „Megnyitás” új lapot nyit, és megjelenik az „Olvasottnak jelölve · Visszavonás” csík;
- a „+ teendő” után a gomb letiltott, és a panelben megjelenik a teendő;
- 360 px-en a panel alulról nyílik.

- [ ] **Step 9: Commit**

```bash
git add lib/feed.ts lib/feed.test.ts app/components "app/(app)/library"
git commit -m "feat: split story cards and put every action in the card footer"
```

---

### Task 8: Library: olvasott posztok, élő frissítés beküldés közben, üres állapot

**Files:**
- Create: `app/(app)/library/refresh-while-processing.tsx`, `app/(app)/library/[id]/mark-post-read.tsx`
- Modify: `lib/content.ts` (`getReadPostIds`), `app/(app)/library/page.tsx`, `app/(app)/library/library-view.tsx`, `app/(app)/library/submit-form.tsx`, `app/(app)/library/[id]/page.tsx`, `lib/fixtures.ts` (`previewReadPostIds`), `app/dev/preview/page.tsx`

**Interfaces:**
- Consumes: `POST_STATE_PREFIX`, `postStateKey`, `readPostIds`, `postState` (6. feladat); `LibraryView`, `LocalizedText` (3. feladat)
- Produces:
  - `getReadPostIds(db: SupabaseClient): Promise<Set<number>>`
  - `LibraryView(props: { posts: Post[]; open: SubmittedSource[]; readIds: Set<number> })`
  - `RefreshWhileProcessing(props: { active: boolean })`, `MarkPostRead(props: { postId: number })`
  - `previewReadPostIds: Set<number>`

- [ ] **Step 1: Az API ellenőrzése, séma-változás nélkül**

- A mostani `app/api/state/route.ts` a `set_read` ágban az `itemId`-t `String(body.itemId ?? "").slice(0, 120)` alakban veszi át. A tábla check-je `char_length(item_id) <= 120`, idegen kulcs nincs.
- A `post:<id>` legfeljebb 24 karakter. Ezt a 6. feladat `post read state…` tesztje rögzíti.
- Ha az M1 15. feladata után a `lib/state.ts` `parseStateAction` sémája az `itemId`-t mintához köti, akkor a `post:\d+` alakot is engedje. Ehhez kell egy eset a `lib/state.test.ts`-ben: `parseStateAction({ action: "set_read", itemId: "post:42", value: true })` elfogadja.

- [ ] **Step 2: Az olvasott posztok lekérdezése** (`lib/content.ts`)

Import: `import { POST_STATE_PREFIX, readPostIds } from "@/lib/reader-store";`. A függvény a `getPosts` alá:

```ts
/** The reader's opened posts (item_states `post:<id>`, RLS: own rows only); the Library list dims them. */
export async function getReadPostIds(db: SupabaseClient): Promise<Set<number>> {
  const { data } = await db.from("item_states").select("item_id").like("item_id", `${POST_STATE_PREFIX}%`).eq("is_read", true);
  return readPostIds((data ?? []).map((row) => row.item_id as string));
}
```

- [ ] **Step 3: A megnyitott poszt olvasott**

`app/(app)/library/[id]/mark-post-read.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { postState, postStateKey } from "@/lib/reader-store";

/** Opening a post marks it read (item_states `post:<id>`); the Library list dims it from then on. */
export function MarkPostRead({ postId }: { postId: number }) {
  useEffect(() => {
    // Not a click the reader made, so no error toast: a missed mark only leaves the card undimmed.
    postState({ action: "set_read", itemId: postStateKey(postId), value: true }).catch(() => undefined);
  }, [postId]);
  return null;
}
```

`app/(app)/library/[id]/page.tsx`:
- import: `import { MarkPostRead } from "./mark-post-read";`;
- a `<main>` első gyereke: `<MarkPostRead postId={post.id} />`.

Az előnézet a `PostArticle`-t rendereli, a `page.tsx`-et nem, így ott nem megy ki kérés.

- [ ] **Step 4: Élő frissítés beküldés közben** (`app/(app)/library/refresh-while-processing.tsx`)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 5000;
// ponytail: a source stuck in `pending` until the daily cron retries it would poll forever; 120 × 5 s
// (10 min) is twice the ingest's maxDuration (300 s). A status endpoint could stop on "no change" instead.
const MAX_POLLS = 120;

/** Re-renders the Library every 5 s while a submitted link is still processing, and stops when none is. */
export function RefreshWhileProcessing({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let polls = 0;
    const timer = setInterval(() => {
      if (++polls > MAX_POLLS) clearInterval(timer);
      else if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
```

A `router.refresh()` megtartja a kliens-komponensek állapotát. Az `active` addig igaz, amíg a friss szerveroldali lista még tartalmaz `pending` forrást. Ha már nem, az effekt leáll.

- [ ] **Step 5: A lista** (`app/(app)/library/library-view.tsx`)

- Importok: `import { RefreshWhileProcessing } from "./refresh-while-processing";`.
- A props-típus: `{ posts: Post[]; open: SubmittedSource[]; readIds: Set<number> }`.
- A `copy.empty` helyére két kulcs:
  ```ts
    empty: { hu: "Még üres a könyvtár. Küldj be egy linket fent ↑", en: "The library is empty. Submit a link above ↑" },
    toForm: { hu: "Az űrlaphoz", en: "To the form" },
  ```
- A `<main>` első gyereke: `<RefreshWhileProcessing active={open.some((source) => source.status === "pending")} />`.
- Az üres állapot:
  ```tsx
        {!posts.length && (
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />{" "}
            <a href="#submit" className="focus-ring inline-flex min-h-10 items-center text-signal underline">
              <LocalizedText value={copy.toForm} />
            </a>
          </p>
        )}
  ```
- A kártya `Link` `className`-je template literal lesz, és a végére kerül: `${readIds.has(post.id) ? "story-read" : ""}`. A `.story-read` ugyanaz a halványítás, mint a Radaron.

`app/(app)/library/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getOpenSources, getPosts, getReadPostIds } from "@/lib/content";
import { getReader } from "@/lib/supabase/server";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const reader = await getReader();
  if (!reader) redirect("/login?next=/library");
  const [posts, open, readIds] = await Promise.all([getPosts(reader.db), getOpenSources(reader.db), getReadPostIds(reader.db)]);
  return <LibraryView posts={posts} open={open} readIds={readIds} />;
}
```

- [ ] **Step 6: A beküldő űrlap** (`app/(app)/library/submit-form.tsx`)

- A `<form>`-ra kerül az `id="submit"`, ide mutat az üres állapot linkje.
- A `shadow-[6px_6px_0_#141414]` helyett `shadow-[6px_6px_0_var(--ink)]`.
- A két kézzel írt `<input>` helyére `Input` kerül, import: `import { Input } from "@/components/ui/input";`.
- A `copy` mindkét nyelvébe kerül egy `url` és egy `note` kulcs: `url: "Link"`, a note magyarul `note: "Megjegyzés"`, angolul `note: "Note"`. Ezek váltják a csak angol `aria-label`-t.

A két mező:

```tsx
        <Input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t.urlPlaceholder}
          aria-label={t.url}
          className="min-h-10 flex-1 border-2 border-ink bg-cream focus-visible:border-signal"
        />
```

```tsx
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder={t.notePlaceholder}
        aria-label={t.note}
        className="mt-2 min-h-10 border-ink/40 bg-cream focus-visible:border-signal"
      />
```

- [ ] **Step 7: Az előnézet**

`lib/fixtures.ts`, a fájl végére:

```ts
/** Post 2 was opened before: the Library list dims it. */
export const previewReadPostIds = new Set([2]);
```

`app/dev/preview/page.tsx`: a fixtures-importba kerül a `previewReadPostIds`, és:

```tsx
      {view === "library" && <LibraryView posts={previewPosts} open={previewSources} readIds={previewReadPostIds} />}
      {view === "library-empty" && <LibraryView posts={[]} open={[]} readIds={new Set()} />}
```

- [ ] **Step 8: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón.

A kontroller Playwrighttal:
1. **Frissítés beküldés közben.** A `/dev/preview?view=library` oldalon 11 másodperc után a `browser_network_requests` legalább két RSC-kérést mutat a `/dev/preview`-ra (van `pending` forrás). A `?view=library-empty` oldalon egyet sem.
2. **Halványítás.** A 2-es poszt kártyáján ott a `story-read` osztály.
3. **Üres állapot.** Az üres állapot linkje az űrlaphoz görget.

- [ ] **Step 9: Commit**

```bash
git add lib/content.ts lib/fixtures.ts "app/(app)/library" app/dev
git commit -m "feat: track read posts and refresh the library while links process"
```

---

### Task 9: Billentyűparancsok és súgó

**Files:**
- Create: `lib/keymap.ts`, `lib/keymap.test.ts`, `app/components/use-shortcuts.ts`
- Modify: `app/components/story-card.tsx`, `app/components/digest-dashboard.tsx`, `app/components/shell-dialogs.tsx` (`ShortcutHelp`), `app/components/app-shell.tsx`, `app/components/desktop-nav.tsx` (`onHelp`, ⌘K jelzés, a `[` a súgóban)

**Interfaces:**
- Consumes: `SearchSoon`, `DesktopNavProps`, `NavMode` (2. feladat); `StoryCard`, `MustReadCard` (7. feladat); `ReaderStore.toggleFlag` (6. feladat)
- Produces:
  - `type ShortcutAction = "next" | "previous" | "open" | "read" | "later" | "search" | "help" | "toggleNav"`
  - `SHORTCUTS: readonly { keys: readonly string[]; action: ShortcutAction; label: Localized }[]`
  - `type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean }`, `type KeyTarget = { editable: boolean; inDialog: boolean }`
  - `isEditableTarget(element: { tagName?: string; isContentEditable?: boolean } | null): boolean`, `shortcutFor(press: KeyPress, target: KeyTarget): ShortcutAction | null`, `nextCardIndex(current: number, count: number, step: 1 | -1): number | null`
  - `useShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>): void`
  - `story-card.tsx`: `focusedCardId(): string | null`, `moveCardFocus(step: 1 | -1): void`, `openFocusedCard(): void`
  - `ShortcutHelp(props: { open: boolean; onOpenChange: (open: boolean) => void })`
  - `DesktopNavProps` új mezője: `onHelp: () => void` (a `mode`/`onToggle` a 2. feladatból jön, és onnantól `[` már a saját gombjukkal is átváltja őket)

- [ ] **Step 1: A teszt megírása** (`lib/keymap.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditableTarget, nextCardIndex, shortcutFor, type KeyPress, type KeyTarget } from "./keymap.ts";

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...modifiers });
const page: KeyTarget = { editable: false, inDialog: false };

test("each single key maps to its action", () => {
  assert.deepEqual(
    ["j", "k", "o", "r", "l", "/", "?", "["].map((key) => shortcutFor(press(key), page)),
    ["next", "previous", "open", "read", "later", "search", "help", "toggleNav"],
  );
});

test("nothing fires while typing, whatever the key", () => {
  const typing: KeyTarget = { editable: true, inDialog: false };
  for (const keyPress of [press("j"), press("r"), press("o"), press("?"), press("/"), press("["), press("k", { metaKey: true })]) {
    assert.equal(shortcutFor(keyPress, typing), null, keyPress.key);
  }
});

test("an open dialog or an IME composition swallows shortcuts", () => {
  assert.equal(shortcutFor(press("j"), { editable: false, inDialog: true }), null);
  assert.equal(shortcutFor(press("j", { isComposing: true }), page), null);
});

test("browser combos stay the browser's; Ctrl or ⌘ + K is search, AltGr + K is not", () => {
  assert.equal(shortcutFor(press("r", { ctrlKey: true }), page), null, "Ctrl+R still reloads");
  assert.equal(shortcutFor(press("r", { metaKey: true }), page), null);
  assert.equal(shortcutFor(press("j", { altKey: true }), page), null);
  assert.equal(shortcutFor(press("J"), page), null, "Shift+J is not j");
  assert.equal(shortcutFor(press("k", { ctrlKey: true }), page), "search");
  assert.equal(shortcutFor(press("K", { metaKey: true }), page), "search");
  assert.equal(shortcutFor(press("k", { ctrlKey: true, altKey: true }), page), null, "AltGr is Ctrl+Alt on Windows");
});

test("isEditableTarget: form fields and contenteditable, not buttons or cards", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(isEditableTarget({ tagName }), true, tagName);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  for (const tagName of ["BUTTON", "A", "ARTICLE", "BODY"]) assert.equal(isEditableTarget({ tagName, isContentEditable: false }), false, tagName);
  assert.equal(isEditableTarget(null), false);
});

test("nextCardIndex starts at the first card and stops at both ends", () => {
  assert.equal(nextCardIndex(-1, 5, 1), 0);
  assert.equal(nextCardIndex(-1, 5, -1), 0);
  assert.equal(nextCardIndex(2, 5, 1), 3);
  assert.equal(nextCardIndex(4, 5, 1), 4);
  assert.equal(nextCardIndex(0, 5, -1), 0);
  assert.equal(nextCardIndex(-1, 0, 1), null);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/keymap.test.ts`
Elvárt: FAIL, a modul nem létezik.

- [ ] **Step 3: A leképezés** (`lib/keymap.ts`)

```ts
import type { Localized } from "../data/digest-types.ts";

// Desktop keyboard shortcuts as data plus pure functions; app/components/use-shortcuts.ts binds them to the window.

export type ShortcutAction = "next" | "previous" | "open" | "read" | "later" | "search" | "help" | "toggleNav";

/** What the help dialog lists. Single-character keys are also what shortcutFor matches; longer ones are display only. */
export const SHORTCUTS: readonly { keys: readonly string[]; action: ShortcutAction; label: Localized }[] = [
  { keys: ["j"], action: "next", label: { hu: "Következő kártya", en: "Next card" } },
  { keys: ["k"], action: "previous", label: { hu: "Előző kártya", en: "Previous card" } },
  { keys: ["o"], action: "open", label: { hu: "Megnyitás (olvasottnak is jelöli)", en: "Open (also marks it read)" } },
  { keys: ["r"], action: "read", label: { hu: "Olvasott ki/be", en: "Toggle read" } },
  { keys: ["l"], action: "later", label: { hu: "Későbbre ki/be", en: "Toggle later" } },
  { keys: ["⌘K", "Ctrl K", "/"], action: "search", label: { hu: "Keresés (hamarosan)", en: "Search (coming soon)" } },
  { keys: ["["], action: "toggleNav", label: { hu: "Oldalsáv össze/kinyitása", en: "Collapse/expand the sidebar" } },
  { keys: ["?"], action: "help", label: { hu: "Ez a lista", en: "This list" } },
];

const BY_KEY = new Map(
  SHORTCUTS.flatMap(({ keys, action }) => keys.filter((key) => key.length === 1).map((key) => [key, action] as const)),
);

export type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean };
export type KeyTarget = { editable: boolean; inDialog: boolean };

/** True for anything that takes typing: input, textarea, select, or a contenteditable element (and its children). */
export function isEditableTarget(element: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!element) return false;
  return element.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName ?? "");
}

/**
 * The action a key press asks for, or null. Nothing fires while typing, inside an open dialog, or
 * mid-composition. Letters take no modifier, so Ctrl+R (reload) and the like stay the browser's.
 * `/` and `?` ignore Shift, which the Hungarian layout needs to type them. Ctrl/⌘+K is search; AltGr (Ctrl+Alt) is not.
 */
export function shortcutFor(press: KeyPress, target: KeyTarget): ShortcutAction | null {
  if (press.isComposing || target.editable || target.inDialog) return null;
  if (press.ctrlKey || press.metaKey) return !press.altKey && press.key.toLowerCase() === "k" ? "search" : null;
  if (press.altKey) return null;
  return BY_KEY.get(press.key) ?? null;
}

/** The card j/k moves to: the first one while none has focus, clamped at both ends; null when there are none. */
export function nextCardIndex(current: number, count: number, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (current < 0) return 0;
  return Math.min(count - 1, Math.max(0, current + step));
}
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test lib/keymap.test.ts`
Elvárt: 6 teszt PASS.

- [ ] **Step 5: A hook** (`app/components/use-shortcuts.ts`)

```ts
"use client";

import { useEffect, useEffectEvent } from "react";
import { isEditableTarget, shortcutFor, type ShortcutAction } from "@/lib/keymap";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/** Runs the handler for a shortcut pressed anywhere on the page; a key without a handler here is left alone. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    const action = shortcutFor(event, {
      editable: isEditableTarget(element),
      inDialog: Boolean(element?.closest('[role="dialog"], [role="alertdialog"]')),
    });
    const handler = action ? handlers[action] : undefined;
    if (!handler) return;
    event.preventDefault();
    handler();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
```

A keret és a dashboard is regisztrál. Egy leütést az kezel, akinek van rá kezelője, és a `preventDefault` után a másik figyelő (`defaultPrevented`) már nem nyúl hozzá.

- [ ] **Step 6: A kártyák fókuszálhatók** (`app/components/story-card.tsx`)

Import: `import { nextCardIndex } from "@/lib/keymap";`.

A `StoryCard` és a `MustReadCard` `<article>`-je megkapja a `{...cardFocus(item.id)}` propot, a `className` elejére pedig a `focus-ring` kerül. A Megnyitás `<a>`-ja megkapja a `data-card-open` attribútumot. A fájl végére:

```tsx
const CARD = "[data-card-id]";

/** Makes a card a j/k stop: focusable from script (not by Tab) and findable by id. */
const cardFocus = (itemId: string) => ({ tabIndex: -1, "data-card-id": itemId });

/** The id of the card that has focus, or holds the focused button. */
export function focusedCardId(): string | null {
  return document.activeElement?.closest<HTMLElement>(CARD)?.dataset.cardId ?? null;
}

/** j/k: focus the next or previous card and scroll it to the middle, instantly under prefers-reduced-motion. */
export function moveCardFocus(step: 1 | -1) {
  const cards = [...document.querySelectorAll<HTMLElement>(CARD)];
  const index = nextCardIndex(cards.findIndex((card) => card.contains(document.activeElement)), cards.length, step);
  if (index === null) return;
  const card = cards[index];
  card.focus({ preventScroll: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
}

/** o: follows the focused card's Open link, which also marks it read. */
export function openFocusedCard() {
  document.activeElement?.closest(CARD)?.querySelector<HTMLAnchorElement>("[data-card-open]")?.click();
}
```

A `cardFocus` a fájl elejére, a `pressedClass` mellé kerüljön, mert a komponensek használják.

- [ ] **Step 7: A dashboard parancsai** (`app/components/digest-dashboard.tsx`)

Importok:
- `import type { Flag } from "@/lib/reader-store";` (a meglévő `EMPTY_ITEM_STATE` importba is felvehető);
- a `./story-card` importba: `focusedCardId, moveCardFocus, openFocusedCard`;
- `import { useShortcuts } from "./use-shortcuts";`.

A `deleteTodo` függvény után:

```tsx
  function toggleFocused(flag: Flag) {
    const itemId = focusedCardId();
    if (itemId) store.toggleFlag(itemId, flag);
  }

  useShortcuts({
    next: () => moveCardFocus(1),
    previous: () => moveCardFocus(-1),
    open: openFocusedCard,
    read: () => toggleFocused("read"),
    later: () => toggleFocused("saved"),
  });
```

- [ ] **Step 8: A súgó** (`app/components/shell-dialogs.tsx`)

Importok: `import { Fragment, type ReactNode } from "react";` és `import { SHORTCUTS } from "@/lib/keymap";`. A `copy` mindkét nyelve két kulcsot kap:

```ts
    help: "Billentyűparancsok",
    helpNote: "A Radar kártyáin működnek; beviteli mezőben és nyitott ablakban nem.",
```

```ts
    help: "Keyboard shortcuts",
    helpNote: "They work on Radar cards; not while typing or with a dialog open.",
```

A fájl végére:

```tsx
/** `?` opens it: the list comes from lib/keymap.ts, so a new shortcut shows up here by itself. */
export function ShortcutHelp({ open, onOpenChange }: DialogProps) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} title={t.help}>
      <DialogDescription className="text-sm leading-6 text-ink/70">{t.helpNote}</DialogDescription>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 font-mono text-sm">
        {SHORTCUTS.map(({ action, keys, label }) => (
          <Fragment key={action}>
            <dt className="flex flex-wrap gap-1">
              {keys.map((key) => (
                <kbd key={key} className="border border-ink bg-paper px-1.5 py-0.5 text-xs">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{label[language]}</dd>
          </Fragment>
        ))}
      </dl>
    </ShellDialog>
  );
}
```

A `[` sor semmilyen külön kódot nem igényel itt: a `SHORTCUTS`-ba a 3. lépésben már bekerült, és a fenti `.map` automatikusan kilistázza.

- [ ] **Step 9: A keret és az asztali navigáció**

`app/components/app-shell.tsx`:
- importok: `import { useShortcuts } from "./use-shortcuts";`, a `./shell-dialogs` importba a `ShortcutHelp`;
- az `AppShell` törzse (a 2. feladat `navMode`/`toggleNav`/`persistNavMode`-ja megmarad; csak a súgó-ablak és a `useShortcuts` kerül hozzá, a `toggleNav` pedig bekötődik a `[` billentyűre):

```tsx
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(initialNavMode);
  const openSearch = () => setSearchOpen(true);
  const openHelp = () => setHelpOpen(true);
  const toggleNav = () => {
    const next: NavMode = navMode === "rail" ? "full" : "rail";
    persistNavMode(next);
    setNavMode(next);
  };
  // ⌘K and / are reserved for the search palette (milestone C); until then they open its placeholder.
  useShortcuts({ search: openSearch, help: openHelp, toggleNav });
  return (
    <LanguageProvider initial={language}>
      <DesktopNav email={email} onSearch={openSearch} onHelp={openHelp} mode={navMode} onToggle={toggleNav}>
        {/* Room for the fixed bottom bar, so it never covers the end of the page. */}
        <div className="pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </DesktopNav>
      <MobileNav email={email} onSearch={openSearch} />
      <SearchSoon open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <UndoToast />
    </LanguageProvider>
  );
}
```

`app/components/desktop-nav.tsx`: a lábléc a 2. feladat óta már három sort tart (nyelv, fiók, összecsukó gomb), ezért itt a teljes fájl cserélődik — a `mode`/`onToggle`/rail-logika megmarad, csak az `onHelp` és a súgó-gomb (railben ikon, teljes módban ikon + „?”) kerül hozzá:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, Keyboard, Radar } from "lucide-react";
import { activeNavId, PRIMARY_NAV } from "@/lib/nav";
import type { NavMode } from "@/lib/nav-mode";
import { useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { AccountActions, NavEntry, NavTooltip, navIcons, SoonList } from "./nav-parts";

// Desktop navigation, variant A: a sidebar, collapsible to a ~56px icon rail (spec 1.2). Variants B
// (top bar) and C (icon rail as the default) replace this one file: same props, the same items from
// lib/nav.ts, and each lays out `children` (the page) itself.

const copy = {
  hu: { nav: "Fő navigáció", collapse: "Oldalsáv összecsukása", expand: "Oldalsáv kinyitása", shortcuts: "Billentyűparancsok" },
  en: { nav: "Main navigation", collapse: "Collapse sidebar", expand: "Expand sidebar", shortcuts: "Keyboard shortcuts" },
};

const itemClassFull =
  "focus-ring flex min-h-10 w-full items-center gap-3 border-l-2 border-transparent px-3 font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

const itemClassRail =
  "focus-ring flex min-h-10 w-full items-center justify-center border-l-2 border-transparent text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";

export type DesktopNavProps = {
  email: string;
  onSearch: () => void;
  onHelp: () => void;
  mode: NavMode;
  onToggle: () => void;
  children: ReactNode;
};

export function DesktopNav({ email, onSearch, onHelp, mode, onToggle, children }: DesktopNavProps) {
  const { language } = useLanguage();
  const active = activeNavId(usePathname());
  const t = copy[language];
  const rail = mode === "rail";
  return (
    <div className="md:flex">
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-paper/15 bg-ink text-paper md:flex ${rail ? "w-14" : "w-64"}`}
      >
        <Link href="/" className={`focus-ring flex items-center gap-3 border-b border-paper/15 ${rail ? "justify-center p-3" : "p-5"}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-signal bg-signal text-ink">
            <Radar className="size-5" />
          </span>
          {!rail && (
            <span className="font-display text-2xl leading-none tracking-tight">
              NEON
              <br />
              NEWS
              <br />
              <span className="text-signal">RADAR</span>
            </span>
          )}
        </Link>
        <nav aria-label={t.nav} className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const Icon = navIcons[item.id];
              const entry = (
                <NavEntry item={item} active={active === item.id} onSearch={onSearch} className={rail ? itemClassRail : itemClassFull}>
                  <Icon className="size-4 shrink-0" />
                  <span className={rail ? "sr-only" : "flex-1 text-left"}>{item.label[language]}</span>
                  {!rail && !item.href && <kbd className="font-mono text-[10px] text-paper/45">⌘K</kbd>}
                </NavEntry>
              );
              return <li key={item.id}>{rail ? <NavTooltip label={item.label[language]}>{entry}</NavTooltip> : entry}</li>;
            })}
          </ul>
          {!rail && <SoonList className="mt-6 px-3" />}
        </nav>
        <div className={`space-y-3 border-t border-paper/15 ${rail ? "px-2 py-3" : "p-4"}`}>
          {rail ? (
            <div className="flex flex-col items-center gap-3">
              <LanguageToggle iconOnly />
              <button
                type="button"
                onClick={onHelp}
                aria-label={t.shortcuts}
                className="focus-ring grid size-10 place-items-center text-paper/55 hover:text-signal"
              >
                <Keyboard className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <LanguageToggle />
              <button
                type="button"
                onClick={onHelp}
                aria-label={t.shortcuts}
                className="focus-ring flex min-h-10 items-center gap-2 px-2 font-mono text-[11px] text-paper/55 hover:text-signal"
              >
                <Keyboard className="size-4" /> ?
              </button>
            </div>
          )}
          {rail ? <AccountActions email={email} iconOnly /> : <AccountActions email={email} />}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!rail}
            aria-label={rail ? t.expand : t.collapse}
            className="focus-ring flex min-h-10 w-full items-center justify-center gap-2 border-t border-paper/15 pt-3 font-mono text-[11px] text-paper/55 hover:text-signal"
          >
            {rail ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!rail && t.collapse}
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 10: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón. A kézi Playwright-próba a 11. feladat listájában van.

- [ ] **Step 11: Commit**

```bash
git add lib/keymap.ts lib/keymap.test.ts app/components
git commit -m "feat: add keyboard shortcuts and a shortcut help dialog"
```

---

### Task 10: Szélesebb cikkoszlop és egységes képkeret

**Files:**
- Create: `app/components/post-image.tsx`, `app/(app)/library/[id]/post-article.test.ts`
- Modify: `app/components/post-blocks.tsx`, `app/components/post-blocks.test.ts`, `app/(app)/library/[id]/post-article.tsx`

**Interfaces:**
- Consumes: `PostArticle` (a 4. feladat `app/(app)/library/[id]/post-article.tsx`-je), `mediaSources`, `isValidPlaceholder` (`lib/post-view.ts`), `safeHref`, `type Block`, `type ImageBlock` (`lib/blocks.ts`), `testPost` (`lib/test/fixtures.ts`), `render` (`lib/test/render.ts`)
- Produces: `PostImage(props: { src: string; srcSet: string; sizes: string; alt: string; width?: number; height?: number; priority: boolean; placeholder?: string })` (`app/components/post-image.tsx`)

A spec 1.4.11–12. pontja (`docs/superpowers/specs/2026-09-24-ux-signals-search-design.md`) két ergonómiai javítást kér a poszt-oldalon: szélesebb keret, olvasható sorhosszal, és egységes képkeret. Ez a feladat a 2. feladat utáni útvonalakon dolgozik: a poszt-oldal törzse a 4. feladat óta `app/(app)/library/[id]/post-article.tsx`-ben van (`PostArticle`), a blokkok renderelője változatlanul `app/components/post-blocks.tsx` (`PostBlocks`, benne az `ImageView`). **Olvasd újra mindkét fájlt**, mert a 4., a 6. és a 7. feladat is módosítja őket (a 7. a `repo` blokk `topics`-felsorolását cseréli `Tag`-re) — a lenti kódrészletek a pontosan idézett „előtte” szöveget keresik, a körülöttük lévő sorok a korábbi feladatoktól függően már mások lehetnek.

A blokkséma (`lib/blocks.ts`) ma nem ismer „táblázat” blokktípust, a spec „táblázatok” szava ellenére — ez a feladat ezért csak a ténylegesen létező típusokra vonatkozik: a kép, a kód és a videó blokk lesz teljes szélességű, a többi (bekezdés, lista, cím, idézet, fejezetlista, repó, elválasztó) a 75ch-s olvasási szélességben marad.

- [ ] **Step 1: A tesztek megírása**

`app/components/post-blocks.test.ts`-ben a meglévő `blocks` tömb (és a destructuring-lista) csak bővül — a régi indexek nem változnak, mert két elem a végére kerül:

```ts
const blocks = assignIds([
  { type: "video", provider: "youtube", videoId: "bad" },
  { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
  { type: "chapters", items: [{ seconds: 30, title: "Intro" }] },
  { type: "paragraph", content: [{ text: "docs", href: "/doc" }, { text: " and " }, { text: "a trap", href: "javascript:alert(1)" }] },
  { type: "video", provider: "vimeo", videoId: "76979871" },
  { type: "repo", fullName: "owner/repo", url: "javascript:alert(2)", stars: 1, topics: [] },
  { type: "image", originalUrl: "javascript:alert(3)", alt: "", path: null },
  { type: "code", language: "ts", code: "const answer = 42;" },
  {
    type: "image",
    originalUrl: "https://blog.test/figure.png",
    alt: "A chart",
    caption: "Figure 1",
    path: "1/0123456789abcdef",
    format: "avif",
    widths: [640, 1280],
    width: 1280,
    height: 720,
    placeholder: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  },
]);
const [invalidVideo, youtube, , paragraph, vimeo, repo, missingImage, codeBlock, mirroredImage] = blocks;
```

A fájl végére öt új teszt:

```ts
test("both the missing-image box and a loaded image share the same frame", () => {
  const doc = renderBlocks();
  const missingFrame = wrapper(doc, missingImage)!.querySelector("figure")!;
  const loadedFrame = wrapper(doc, mirroredImage)!.querySelector("figure")!;
  for (const frame of [missingFrame, loadedFrame]) {
    assert.ok(frame.classList.contains("bg-paper"), frame.className);
    assert.ok(frame.classList.contains("shadow-[4px_4px_0_var(--ink)]"), frame.className);
  }
  assert.ok(missingFrame.classList.contains("border-dashed"), "the missing box's border is dashed");
  assert.equal(loadedFrame.classList.contains("border-dashed"), false, "a loaded image keeps a solid border");
});

test("a loaded image's caption sits inside its frame, in mono", () => {
  const doc = renderBlocks();
  const frame = wrapper(doc, mirroredImage)!.querySelector("figure")!;
  const caption = frame.querySelector("figcaption")!;
  assert.equal(caption.textContent, "Figure 1");
  assert.ok(caption.classList.contains("font-mono"));
});

test("the image itself is contained, capped at 80dvh tall, and stacked above the placeholder", () => {
  const doc = renderBlocks();
  const img = wrapper(doc, mirroredImage)!.querySelector("img")!;
  assert.ok(img.classList.contains("relative"), img.className);
  assert.ok(img.classList.contains("object-contain"), img.className);
  assert.ok(img.classList.contains("max-h-[80dvh]"), img.className);
});

test("a loaded image's placeholder sits behind it, ready to be hidden once the browser fires onload", () => {
  const doc = renderBlocks();
  const frame = wrapper(doc, mirroredImage)!.querySelector("figure")!;
  const placeholderLayer = frame.querySelector('span[aria-hidden="true"]')!;
  assert.match(placeholderLayer.getAttribute("style") ?? "", /background-image/);
  // The server-rendered markup is always the pre-load state (render.ts runs no effects or refs); the
  // browser removes this layer once the image has loaded (onLoad, or `complete` at hydration) —
  // Task 11's Playwright checklist item 12 checks that in a real browser.
});

test("images, code and video break out of the prose width; paragraphs keep it", () => {
  const doc = renderBlocks();
  for (const wide of [mirroredImage, codeBlock, youtube]) {
    assert.equal(wrapper(doc, wide)!.classList.contains("max-w-[75ch]"), false, wide.id);
  }
  assert.ok(wrapper(doc, paragraph)!.classList.contains("max-w-[75ch]"));
});
```

`app/(app)/library/[id]/post-article.test.ts` (új fájl; négy `../`, mert az `[id]` a 2. feladat óta négy könyvtárral van a gyökér alatt, mint a szomszédos tesztek):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { testPost } from "../../../../lib/test/fixtures.ts";
import { render } from "../../../../lib/test/render.ts";

const { PostArticle } = await import("./post-article.tsx");

const renderArticle = (post = testPost()) => render(createElement(PostArticle, { post, language: "en", query: {}, canEdit: false }));

test("the post column is the widened frame, not the old narrow one", () => {
  const wrapper = renderArticle().querySelector("article > div")!;
  assert.ok(wrapper.classList.contains("max-w-5xl"), wrapper.className);
  assert.equal(wrapper.classList.contains("max-w-3xl"), false);
});

test("the summary and key points stay at the readable prose width", () => {
  const post = testPost({ keyPoints: { hu: [], en: ["First point"] } });
  const doc = renderArticle(post);
  const summary = [...doc.querySelectorAll("p")].find((p) => p.textContent === post.summary.en)!;
  assert.ok(summary.classList.contains("max-w-[75ch]"), summary.className);
  const keyPointsBlock = doc.querySelector("ul")!.closest("div")!;
  assert.ok(keyPointsBlock.classList.contains("max-w-[75ch]"), keyPointsBlock.className);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/post-blocks.test.ts "app/(app)/library/[[]id]/post-article.test.ts"`
Az `[id]` szögletes zárójelét `[[]id]`-ként kell írni, különben a `node --test` glob-karakterosztálynak veszi, 0 tesztet futtat, és 0-val lép ki (CLAUDE.md, Tests). A kimenet `# tests` sora nem lehet 0.
Elvárt: FAIL — a mai `ImageView` a hiányzó képet sima `<p>`-ként adja vissza, `<figure>` nélkül, a betöltött képnél pedig a keret osztályai (`bg-paper`, `shadow-[4px_4px_0_var(--ink)]`) még az `img`-en sincsenek meg; a `post-article.test.ts` a modul hiánya miatt bukik.

- [ ] **Step 3: A képkomponens** (`app/components/post-image.tsx`)

```tsx
"use client";

import { useState } from "react";

/**
 * The post image itself: a blurred placeholder sits behind it until it has loaded, then this layer
 * is removed — never left as the image's own permanent CSS background — so a transparent PNG/AVIF
 * (arXiv, GitHub figures) never shows blur bleeding through a transparent pixel afterwards (spec
 * 1.4.12). The only stateful piece of the post renderer, split out so post-blocks.tsx can stay
 * hook-free and keep rendering inside a Server Component (see its own header comment).
 * A cached image can finish loading before hydration, when onLoad has no listener yet, so the ref
 * callback also checks `complete`; the img is `relative` so it paints above the placeholder layer.
 */
export function PostImage({
  src,
  srcSet,
  sizes,
  alt,
  width,
  height,
  priority,
  placeholder,
}: {
  src: string;
  srcSet: string;
  sizes: string;
  alt: string;
  width?: number;
  height?: number;
  priority: boolean;
  placeholder?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className="relative block">
      {placeholder && !loaded && (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${placeholder}")` }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-encoded; next/image would re-optimize them */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        className="relative max-h-[80dvh] w-full object-contain"
      />
    </span>
  );
}
```

- [ ] **Step 4: Az egységes keret és a szélesség-szabály `post-blocks.tsx`-ben**

Előbb olvasd újra a fájlt. A `Language`/`Block` importja után, az utolsó importsor mellé:

```tsx
import { PostImage } from "./post-image";
```

A `numberLocale` függvény után, az `InlineContent` elé:

```tsx
// The one place the post image frame (spec 1.4.12) is defined: paper background, ink border, inner
// padding, a hard shadow with no blur. `dashed` is the "image unavailable" box; a loaded image keeps
// a solid border. The caption, when there is one, lives inside this same frame — never a sibling of it.
const imageFrameClass = "border-2 bg-paper p-2 shadow-[4px_4px_0_var(--ink)]";

function ImageFrame({ dashed = false, caption, children }: { dashed?: boolean; caption?: string; children: ReactNode }) {
  return (
    <figure className={`${imageFrameClass} ${dashed ? "border-dashed border-ink/35" : "border-ink"}`}>
      {children}
      {caption && <figcaption className="mt-2 font-mono text-xs leading-5 text-ink/60">{caption}</figcaption>}
    </figure>
  );
}

// The block types that get the widened column's full width (spec 1.4.11); the block schema has no
// table type yet, so this list is only what actually exists. Everything else keeps the 75ch prose cap.
const FULL_WIDTH_BLOCK_TYPES = new Set<Block["type"]>(["image", "code", "video"]);
```

A teljes `ImageView` függvény erre cserélődik:

```tsx
function ImageView({ block, priority, language, baseUrl }: { block: ImageBlock; priority: boolean; language: Language; baseUrl: string }) {
  const sources = mediaSources(block);
  if (!sources) {
    const href = safeHref(block.originalUrl, baseUrl);
    return (
      <ImageFrame dashed>
        <p className="font-mono text-xs text-ink/60">
          {labels[language].missing}:{" "}
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="focus-ring text-signal underline">
              {block.originalUrl}
            </a>
          ) : (
            block.originalUrl
          )}
        </p>
      </ImageFrame>
    );
  }
  const placeholder = block.placeholder && isValidPlaceholder(block.placeholder) ? block.placeholder : undefined;
  return (
    <ImageFrame caption={block.caption}>
      <PostImage
        src={sources.src}
        srcSet={sources.srcSet}
        // Roughly the widened column's own content width (spec 1.4.11, max-w-5xl minus its padding);
        // a request-size hint only, so a few px of slack here is harmless.
        sizes="(min-width: 1024px) 944px, 100vw"
        alt={block.alt}
        width={block.width}
        height={block.height}
        priority={priority}
        placeholder={placeholder}
      />
    </ImageFrame>
  );
}
```

A blokk-sor `div`-je (`PostBlocks` render-ciklusában) ez a sor:

```tsx
    out.push(
      <div key={block.id} id={`b-${block.id}`} data-block-id={block.id} className={`scroll-mt-24 ${controls ? "relative pr-12 min-h-10" : ""}`}>
```

erre cserélődik:

```tsx
    out.push(
      <div key={block.id} id={`b-${block.id}`} data-block-id={block.id} className={`scroll-mt-24 ${controls ? "relative pr-12 min-h-10" : ""} ${FULL_WIDTH_BLOCK_TYPES.has(block.type) ? "" : "max-w-[75ch]"}`}>
```

- [ ] **Step 5: A poszt-oldal kerete** (`app/(app)/library/[id]/post-article.tsx`)

Előbb olvasd újra a fájlt (a 6. és a 7. feladat is módosíthatta a köztes sorokat). Ez a sor:

```tsx
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-16">
```

erre:

```tsx
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-10 sm:py-16">
```

Az összefoglaló és a kulcspontok folyószöveg, ezért a spec szerint 75ch-nál nem szélesebb. Ez a blokk:

```tsx
        <p className="mt-8 text-lg leading-8">{post.summary[language]}</p>
        {post.keyPoints[language].length > 0 && (
          <div className="mt-8 border-l-4 border-signal pl-5">
            <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
              {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        )}
```

erre:

```tsx
        <p className="mt-8 max-w-[75ch] text-lg leading-8">{post.summary[language]}</p>
        {post.keyPoints[language].length > 0 && (
          <div className="mt-8 max-w-[75ch] border-l-4 border-signal pl-5">
            <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{t.keyPoints}</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
              {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        )}
```

A `PostBlocks`-ot tartalmazó `<section className="mt-12">` változatlan marad, mert a szélesség blokkonként dől el (Step 4). Az oldalsáv összecsukásakor a tartalom külön kód nélkül kiszélesedik: a `<main>` már a 2. feladat `DesktopNav`-jának `<div className="min-w-0 flex-1">` oszlopában van, ez a szülő ad helyet, a `mx-auto max-w-5xl` pedig csak felfelé korlátoz.

- [ ] **Step 6: Futtatás, át kell mennie**

Futtatás: `node --experimental-strip-types --no-warnings --test app/components/post-blocks.test.ts "app/(app)/library/[[]id]/post-article.test.ts" && npx tsc --noEmit && npm run dup`
Elvárt: minden teszt PASS, köztük a 7 új (a `post-blocks.test.ts`-ben 5, a `post-article.test.ts`-ben 2), a tsc hiba nélkül fut, 0 klón.

- [ ] **Step 7: Teljes ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón.

- [ ] **Step 8: Commit**

```bash
git add app/components/post-image.tsx app/components/post-blocks.tsx app/components/post-blocks.test.ts "app/(app)/library/[id]/post-article.tsx" "app/(app)/library/[id]/post-article.test.ts"
git commit -m "feat: widen the post column and frame images uniformly"
```

---

### Task 11: Dokumentáció és végső ellenőrzés (Playwright az előnézeten)

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `TODO.md`

- [ ] **Step 1: `CLAUDE.md`**

Olvasd újra: az M1 14. és 15. feladata is átírta. Ahol egy szakasz már tartalmazza az alábbiak egy részét (például a copy-objektum szabályt), ott egészítsd ki, ne ismételd.

- **Auth**, a `proxy.ts` mondata végére: „`/dev/*` passes without a session in development only (`lib/public-paths.ts`).”
- **Layout**: az `app/` és az `app/components/` sor helyére:

```text
app/(app)/        the signed-in pages (/, /archive, /archive/[week], /library, /library/[id]) under
                  one layout, the app shell; the group name is not part of the URL
app/              /login, auth routes, API routes, /media, error/not-found, manifest
app/dev/preview/  offline preview on fixtures (development only)
app/components/   app-shell (+ mobile bottom bar), desktop-nav, nav-parts, shell-dialogs,
                  language-context, language-toggle, undo-toast, digest-dashboard, story-card,
                  reader-panel, tag, page-header (PageHero, StatusCard), post-blocks, post-image,
                  use-reader-state, use-shortcuts, use-model-context-tools
```

  A `lib/` sorai közé:

```text
lib/nav.ts        the menu items, the active item, which pages switch language in place
lib/nav-mode.ts   the `nav` cookie's value: full sidebar or icon rail
lib/keymap.ts     keyboard shortcuts → actions
lib/reader-store.ts  optimistic read/later/to-do state; post read state as post:<id>
lib/feed.ts       feed filter and unread-first order
lib/undo-queue.ts the one-at-a-time undo toast
lib/fixtures.ts   preview data
lib/public-paths.ts  paths that skip the sign-in redirect
```

- **Design language, Responsive rules**: a „Below `md` the dashboard's categories are a sticky chip bar and the sidebar is a Sheet; below `2xl` the progress/to-do panel opens as a right Sheet from the header.” mondat helyére:
  > The Radar categories are a sticky chip bar at every width. Below `md` the app shell shows a fixed five-slot bottom bar (it honours `env(safe-area-inset-bottom)`, and the content column has matching bottom padding); from `md` up the desktop nav takes its place. The progress/to-do panel is a bottom Sheet below `md`, a right Sheet from `md` to `2xl`, and a column from `2xl`; it is non-modal, so the undo toast stays usable while it is open.

  Ugyanitt: „the sidebar and panel make that column far narrower” helyett „the desktop nav and the panel make that column far narrower”.
- **Új szakasz az „Auth” után:**

```md
## App shell and navigation

Every signed-in page lives under `app/(app)/` and gets `app/(app)/layout.tsx` → `AppShell`. `/login`, `/auth/*`, `/api/*`, `/media` and `/dev/*` stay outside. Pages still check the session themselves: a layout cannot read the path for `?next=`.

- **One list:** `lib/nav.ts` holds the items (Radar, Library, Keresés, Archívum, and the dimmed "hamarosan" views) and `activeNavId()`. Both navigations render from it.
- **Mobile, below `md`:** the bottom bar in `app-shell.tsx`, five slots; "Több" opens a bottom Sheet with the language toggle, sign-out and the coming views.
- **Desktop:** `app/components/desktop-nav.tsx`, variant A (sidebar), collapsible to a ~56px icon rail via a toggle button at its foot (`aria-expanded`, localized "Collapse sidebar" / "Expand sidebar"). In rail mode every entry (including search, language and sign-out) shrinks to an icon with its accessible name kept (`aria-label` or sr-only text) and shown as a hover/focus tooltip (`NavTooltip` in `nav-parts.tsx`). The choice persists in the `nav` cookie (`full` | `rail`, same shape as `lang`); `readNavMode()` (`lib/nav-mode.ts`) parses it, and `app/(app)/layout.tsx` reads it server-side so the width is correct on first render. Variants B (top bar) and C (icon rail as the default) are a new `DesktopNav` with the same props that reuses `nav-parts.tsx`; no other file changes.
- **Search** is a placeholder dialog until milestone C (`SearchSoon`); `⌘K` / `Ctrl K` and `/` already open it.
- **Undo toast:** `toasts.show({ kind, undo?, commit? })` from `undo-toast.tsx`. One at a time, 5 s, `aria-live="polite"`; a new toast makes the previous action final, and `pagehide` does too. Read, delete and (milestone B) rating use it, and so does every failed write.
- **Reader state:** `lib/reader-store.ts` (optimistic, writes per key in click order, rollback to the last value the server confirmed) behind `use-reader-state.ts`. Library posts use `item_states` too, keyed `post:<id>`.
- **WebMCP:** `use-model-context-tools.ts` registers two `document.modelContext` tools for in-browser agents; a no-op elsewhere.

## Keyboard (desktop)

`lib/keymap.ts` maps keys to actions: `j`/`k` next/previous card, `o` open (marks read), `r` read, `l` later, `⌘K`/`/` search, `[` collapse/expand the sidebar, `?` help. `use-shortcuts.ts` binds it. Nothing fires in an input, textarea, select or contenteditable, inside an open dialog, or with Ctrl/⌘/Alt held (except `⌘K`). Card scrolling honours `prefers-reduced-motion`. A new shortcut is one `SHORTCUTS` row plus a handler; the help dialog lists it by itself.

## Offline preview

`npm run dev`, then `/dev/preview?view=radar|radar-empty|library|library-empty|archive|archive-empty` (plus `&fail=1` to make every write fail as if offline) and `/dev/preview/post` (every block type and banner; it is a separate path because it renders in the server's language, so the toggle refreshes it). It renders the real view components on `lib/fixtures.ts`, with no Supabase keys, no network and no sign-in. `proxy.ts` lets `/dev/` through only when `NODE_ENV` is `development`, and both pages call `notFound()` otherwise. UI changes are checked there with Playwright at 360, 768 and 1280 px. Add a fixture with every new block type, banner or empty state; `lib/fixtures.test.ts` fails for a missing block type.

## UI text (HU/EN)

One colocated `copy` object per component; no inline `language === "hu" ? … : …`, no English-only labels. Client components read `copy[language]` with `useLanguage()`. Server components on pages that switch language in place (Radar, Library list, Archive: `switchesLanguageInPlace()` in `lib/nav.ts`) keep `{ hu, en }` per key and render `<LocalizedText value={…} />`; the toggle refreshes any other page.
```

- **Hand-authored components**, új pont:
  > **`components/ui/sheet.tsx`, `dialog.tsx`**: the close button is patched to a 40px house-style square (`size-10`, ink border, paper → signal on hover); the stock one is a ~16px target.

  A `sidebar.tsx` pontja végére: „The app no longer renders it (the app shell has its own nav); it stays until the unused-component cleanup.”

- [ ] **Step 2: `README.md`**

Az M1 15. feladata onboarding-README-t ír. A „Project tour” szakaszba (ha nincs ilyen, a két nézet felsorolása alá) kerül ez:

> Every signed-in page shares the app shell (`app/(app)/`): a sidebar on desktop (collapsible to an icon rail), a five-slot bottom bar on phones. Desktop shortcuts: `j`/`k` move between cards, `o` opens (and marks read), `r` read, `l` later, `[` collapses the sidebar, `?` lists them.

A „Testing” szakaszba:

> UI without live data: `npm run dev`, then open `/dev/preview` (development only). It renders every view on fixtures, including empty states and a `&fail=1` offline mode; Playwright checks run against it at 360, 768 and 1280 px.

- [ ] **Step 3: `TODO.md`**

- A „Kész” alá új pont: `- [x] **App-keret és ergonómia (UI/UX A):** közös navigáció (asztalon összecsukható oldalsáv, mobilon alsó sáv), a Megnyitás olvasottnak jelöl visszavonással, olvasatlanok elöl, a Top 3 teljes kártya, teendő a hírhez kötve, olvasott Library-posztok, élő frissítés beküldés közben, billentyűparancsok, nyelvváltás frissítés nélkül, offline előnézet (\`/dev/preview\`).`
- Az „UI/UX és keresés” pont első sora: `- [ ] **UI/UX és keresés:** az A mérföldkő kész (terv: [docs/superpowers/plans/2026-09-24-ux-a-app-shell.md](docs/superpowers/plans/2026-09-24-ux-a-app-shell.md)); hátra van a B (értékelés, GitHub-fül) és a C (keresés, lapozás).` Az alpontjai közül az egységes navigáció, a mobilos ergonómia és az offline előnézet kikerül, mert kész.
- A „Neked: az asztali navigáció kiválasztása” pont alá: `  - Most az **A** van bent, 2026-09-25-től ~56 px-es ikonsávvá csukható (\`[\`, vagy a lábléc gombja). A csere egyetlen fájl: \`app/components/desktop-nav.tsx\`.`
- A „Kényelmi funkciók” alatt: `- [x] **Todo cikkhez kötése.** A hírkártya „+ teendő” gombja (UI/UX A).`

- [ ] **Step 4: Végső ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`
Elvárt: minden zöld, 0 klón. A tesztszám a kiinduláshoz képest 39-cel nő: nav 4, nav-mode 2, public-paths 3, fixtures 4, undo-queue 3, reader-store 13, feed 4, keymap 6. Ha valamelyik fájlban eltér a szám, a tesztneveket vesd össze ezzel a tervvel. A 10. feladat emellett 7 újabb tesztet ad: 5-öt a meglévő `post-blocks.test.ts`-hez, és 2-t az új `post-article.test.ts`-ben.

- [ ] **Step 5: Playwright-ellenőrzőlista** (a kontroller futtatja a Playwright MCP-eszközeivel, `npm run dev` mellett)

Nézetek: `http://localhost:3000/dev/preview?view=` + `radar`, `radar-empty`, `library`, `library-empty`, `archive`, `archive-empty`, és a `http://localhost:3000/dev/preview/post` (a lenti listában: `post`). Szélességek (`browser_resize`): 360×740, 768×1024, 1280×800.

1. **Nincs vízszintes görgetés** (minden nézet és szélesség). Elvárt: `scrollWidth <= innerWidth`.
   ```js
   () => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
   ```
2. **Legalább 40 px mobilon** (360 px, minden nézet). A mondatbeli, inline linkek kivételek. Egy jelölőnégyzetnél a körülötte lévő `label` számít. Elvárt: üres tömb.
   ```js
   () => [...document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea')]
     .filter((el) => el.getClientRects().length > 0)
     .filter((el) => !(el.tagName === "A" && getComputedStyle(el).display === "inline"))
     .map((el) => {
       const box = (el.closest("label") ?? el).getBoundingClientRect();
       return { el: el.outerHTML.slice(0, 90), w: Math.round(box.width), h: Math.round(box.height) };
     })
     .filter(({ w, h }) => w < 40 || h < 40)
   ```
   Nyiss meg minden panelt is (a teendő-panelt és a „Több”-et), és futtasd ott is.
3. **Látszik a fókuszkeret.** 1280 px-en a `radar`, a `library` és a `post` nézetben tíz `Tab` (`browser_press_key`), és minden lépés után:
   ```js
   () => { const style = getComputedStyle(document.activeElement); return { tag: document.activeElement.tagName, outline: style.outlineStyle, ring: style.boxShadow }; }
   ```
   Elvárt: minden lépésnél vagy `outline` ≠ `none`, vagy van gyűrű (`boxShadow` ≠ `none`).
4. **Az alsó sáv.**
   - 360 px-en a `#mobile-nav` látszik, 768 és 1280 px-en nem, és ott az oldalsáv látszik.
   - 360 px-en a lap aljára görgetve az utolsó elem nem lóg a sáv alá (4. feladat, 8. lépés, 3. szkript).
   - A „Több” alulról nyílik, benne a nyelvváltó, a kijelentkezés és a három „hamarosan” sor.
   - A „Keresés” a „hamarosan” ablakot nyitja.
5. **Billentyűparancsok** (1280 px, `radar`).
   - Kártyák között:
     - `j` → az első kártya kap fókuszt (`document.activeElement.dataset.cardId` az első Top 3 id-je);
     - `j` → a második;
     - `k` → megint az első.
   - Műveletek a fókuszban lévő kártyán:
     - `r` → a kártyán megjelenik a `story-read` osztály;
     - `l` → a „Később” gomb `aria-pressed="true"`;
     - `o` → új lap nyílik (`browser_tabs`: 2), és megjelenik az „Olvasottnak jelölve” csík.
   - Ablakok:
     - `?` → nyílik a súgó (`role="dialog"`), `Escape` → bezárul;
     - `/` és `Control+k` → a keresés helye nyílik.
   - Oldalsáv:
     - `[` → az `aside` szélessége 56-ra csökken, a gomb `aria-expanded="false"`;
     - `[` még egyszer → visszaáll 256-ra, `aria-expanded="true"`.
   - Gépelés (a Review Focus 1. pontja):
     - a `library` nézetben kattints a link-mezőbe, és gépeld be: `jkr?/o[`;
     - elvárt: a mező értéke `jkr?/o[`, ablak nem nyílt, új lap nem nyílt, az oldalsáv nem vált.
     - Ugyanez 1280 px-en a teendő-panel mezőjében (nyisd meg a fejléc gombjával).
6. **Visszavonás** (360 px, `radar`).
   - Egy kártya „Megnyitás” gombja → megjelenik a csík, és a sáv fölött van: a csík `getBoundingClientRect().bottom` kisebb, mint a `#mobile-nav` teteje. A „Visszavonás” után a kártya nem halvány.
   - A panelben egy teendő törlése → csík → „Visszavonás” → a teendő visszakerül a helyére, a panel nyitva marad.
7. **Hálózat nélkül** (`radar&fail=1`). A „Később” gomb egy pillanatra aktív, aztán visszaáll (`aria-pressed="false"`), és megjelenik a hibacsík. Egy új teendő megjelenik, majd eltűnik. Egy törölt teendő 5 másodperc után visszajön.
8. **Nyelvváltás.**
   - A `radar`, a `library-empty` és az `archive` nézetben (1280 px) a nyelvváltó után a szöveg azonnal vált, és a `browser_network_requests` nem mutat új `_rsc` kérést. A `library` nézet itt nem jó, mert a `pending` forrás miatt 5 másodpercenként amúgy is frissül; ott csak a szöveg azonnali váltását nézd.
   - Ugyanez a `post` nézetben (`/dev/preview/post`) egy frissítő kérést mutat, és a poszt szövege is átvált.
   - A `<html lang>` mindkét esetben követi a váltást.
9. **Library.** A 8. feladat 8. lépésének két próbája: RSC-kérések 5 másodpercenként `pending` forrásnál, és a `story-read` a 2-es poszton.
10. **Csökkentett mozgás.** `browser_emulate_media` a `prefers-reduced-motion: reduce` beállítással, `radar`, `j` → a görgetés azonnali. Ellenőrzés: a leütés után 50 ms-mal a kártya már középen van.
11. **Az oldalsáv összecsukása** (1280 px, `radar`, `library` és `post` nézet).
    - A lábléc gombjára kattintva (`browser_click`) az `aside` szélessége `256`-ról `56`-ra vált, és a gomb `aria-expanded` értéke `"true"`-ról `"false"`-ra:
      ```js
      () => {
        const aside = document.querySelector("aside");
        const toggle = aside.querySelector("button[aria-expanded]");
        return { width: Math.round(aside.getBoundingClientRect().width), expanded: toggle.getAttribute("aria-expanded") };
      }
      ```
    - Frissítés után (`browser_navigate` ugyanarra az URL-re) az `aside` már az első kiértékeléskor is 56 széles: a szerver a `nav` sütiből már a helyes móddal renderel (`app/(app)/layout.tsx`; a `/dev/preview` ugyanígy olvassa, lásd a 4. feladat 7. lépését), nincs olyan köztes állapot, amit a kliens utólag igazítana.
    - A gomb újbóli kattintására az `aside` visszaáll `256`-ra, `aria-expanded="true"`.
    - Rail módban egy `Tab`-bal fókuszált menüponthoz buborék tartozik:
      ```js
      () => { const tip = document.activeElement.closest("li")?.querySelector('[role="tooltip"]'); return tip ? getComputedStyle(tip).opacity : null; }
      ```
      Elvárt fókuszban: `"1"`. Egy további `Tab` után (a fókusz odébb áll) újra `"0"`.
    - Nincs vízszintes görgetés rail módban sem (az 1. pont szkriptje).
    - `[` billentyűvel kattintás nélkül is ugyanez történik (lásd az 5. pont Oldalsáv-alpontját).

12. **Az egységes képkeret** (`post` nézet; 360×740, és 1280×800 mindkét oldalsáv-módban — nyitva és a 11. pont szerint összecsukva).
    - Minden `<figure>` a cikktörzsben paper hátterű és kemény árnyékú; a hiányzó képnél a szegély szaggatott, a betöltöttnél sima. Elvárt: minden sor `background: "rgb(251, 239, 202)"` (a `--paper` szín) és `shadow: true`.
      ```js
      () => [...document.querySelectorAll("article figure")].map((figure) => {
        const style = getComputedStyle(figure);
        return { background: style.backgroundColor, border: style.borderStyle, shadow: style.boxShadow !== "none" };
      })
      ```
    - A képek `object-contain`-nel ülnek a keretben — így az átlátszó hátterű arXiv/GitHub-ábrák a keret paper hátterén jelennek meg, nem a cream oszlopon:
      ```js
      () => [...document.querySelectorAll("article figure img")].map((img) => getComputedStyle(img).objectFit)
      ```
      Elvárt: minden elem `"contain"`.
    - Egy betöltött kép mögött nem marad elmosott előnézet, újratöltés után sem (a gyorsítótárból jövő kép a hidratálás előtt betölthet, ezt a `PostImage` ref-callbackje kezeli). Az oldal betöltése, majd egy újratöltés után:
      ```js
      () => [...document.querySelectorAll("article figure")].filter((figure) => {
        const img = figure.querySelector("img");
        return img?.complete && img.naturalWidth > 0 && figure.querySelector('span[aria-hidden="true"]');
      }).length
      ```
      Elvárt: mindkétszer `0`.
    - Nincs vízszintes görgetés egyik szélességen és oldalsáv-módban sem (az 1. pont szkriptje), és 1280 px-en az oldalsáv összecsukása után a cikkoszlop szélesebb lesz, miközben a bekezdések (`article p`) szélessége nem haladja meg a 75 karaktert (`getComputedStyle(p).maxWidth` a `75ch`-nak megfelelő, a bekezdés `font-size`-ától függő px-érték).

Minden talált hibára előbb egy tiszta segédfüggvényes teszt a `lib/`-ben, ha a hiba logikai, aztán a javítás, és külön commit (`fix: …`).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md TODO.md
git commit -m "docs: document the app shell, shortcuts and offline preview"
```

A push a felhasználó feladata: `! git push origin ux-a-app-shell`.
