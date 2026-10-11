# Vizuális audit, ergonómia és új komponensek (2a) — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 2a spec tíz döntése a kódban: a hírkártya egy elsődleges gombbal és egy eszközsorral, szó közben nem törő és alacsonyabb címek, 11 px-es betűpadló, a kártya három állapotának három jele, fiók-menü, a belépés a landing keretében, a kilépés a landingre, a Motion könyvtár négy helyen, öt új közös komponens, és az R3 elrendezés.

**Architecture:** Tizenegy feladat a `visual-review` branchen (a `codebase-order` tetején). Előbb a tipográfia és a kártya (1–3), aztán a címek és az elrendezés (4–6), a fiók-menü és a belépés (7–8), a közös komponensek (9), a mozgás (10), végül a doksi és a Playwright-audit megismétlése (11). Minden feladat egy commit, a doksi-kivonatok (`DESIGN.md`) minden érintett feladatban frissülnek, mert a kivonat-teszt különben bukik.

**Tech Stack:** Next.js 16.3.4, React 19.2, Tailwind 4, Radix (`radix-ui`), `motion@14.0.0` (új), `node --test` + linkedom, Playwright MCP.

**Spec:** `.claude/docs/specs/2026-10-11-visual-review-and-components-design.md` (benne hivatkozva: `.claude/docs/specs/2026-10-02-r3-layout-design.md`).

## Global Constraints

- Az öt ellenőrzés minden commit előtt: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`.
- `lib/`-ben relatív `.ts` importok; UI-szöveg `{ hu, en }` copy-objektumban; nincs `NEXT_PUBLIC_`, nincs raw HTML.
- **Egy új függőség:** `motion`, pontos verzió, legalább 7 napos kiadás: `14.0.0` (2026-10-02). A `pnpm-workspace.yaml` `minimumReleaseAge: 10080` érvényesül. Lockfile commitolva.
- **A márka marad:** cream/ink/signal, 2 px keret, zéró lekerekítés, mono eyebrow, `//`. Nincs sötét téma, nincs webfont.
- **Mozgás csak műveletre válaszul** (DESIGN.md 5. elv); `prefers-reduced-motion` alatt semmi nem mozdul.
- **Betűpadló 11 px:** a kódban `text-[10px]` nem marad.
- Az érintési célok 40 px (`min-h-10` / `size-10`), finom mutatóval `sm`-től 32 px lehet.
- A DESIGN.md kivonatai (`lib/design-excerpts.test.ts`) minden érintett fájlnál újramásolva.
- Commit: Conventional Commits, kisbetűs felszólító tárgy, explicit pathspec. Push nincs.

## Plan-szintű döntések (a spec pontosítása)

- **D7, sheet-ek és dialógusok:** a Radix `data-[state]` CSS-animációi már 160 ms-osak és a művelethez kötöttek; a Motion `AnimatePresence`-re cserélésük `forceMount`-ot és a fókuszkezelés újraírását kívánná. **Maradnak a Radix-animációk.** A Motion oda jön, ahol a CSS nem tud: az értékelés-nyomás rugója, a toast ki-be úszása (az `AnimatePresence` egyben megszünteti az `animationend` könyvelést és a tartalék-időzítő hiányát), és a taiyaki ikon fordulása nyitáskor (a `layoutId` a portálon át nem megbízható).
- **D8, `CardToolbar`:** a hírkártya eszközsora (értékelés + Később + Teendő). A poszt-oldal eszközsorában nincs Később és Teendő, ott a `RatingControl` marad közvetlenül.
- **D4, a Később jele:** az `article` `data-saved` attribútumot kap, a jel CSS (`.story-card[data-saved]::before`, `.must-card[data-saved]::before`): 4 px széles signal sáv a kártya bal szélén. A 🔖 ikon telt marad (`BookmarkCheck`).
- **R3 §4, egy réteg:** a Radar panel nyitott állapota az `AppShell`-be kerül egy `PanelContext`-tel (mint a `ReadHereContext`); a chat nyitása bezárja a panelt és fordítva.

## Review Focus

1. **Olvasott és 👎 egyszerre:** a kártya halvány ÉS szaggatott, a szöveg marad olvasható, a gombok kattinthatók. → 3. feladat tesztje (`story-read` és `has-[[data-rating=down]]` egyszerre).
2. **`o` billentyű a kártyán:** a forrás-link a meta sorba költözik, a `[data-card-open]` vele megy, különben az `o` semmit nem nyit. → 2. feladat tesztje.
3. **Hosszú magyar cím 360 px-en** (`Transzformerarchitektúraoptimalizálásilehetőségvizsgálatijegyzőkönyv`): `sm` alatt bárhol törhet, nincs vízszintes görgetés; 1280-on nem törik szó közben. → 4. feladat tesztje + 11. Playwright.
4. **Kilépés, majd Vissza:** a `/about?signed_out=1` státusz-sora egy navigáció után nem marad ott (az URL paramétere csak az első betöltésre vonatkozik). → 8. feladat: a sor csak `signed_out=1`-re jelenik meg, a landing linkjei paraméter nélküliek; teszt a paraméter nélküli renderre.
5. **Reduced motion:** az értékelés-nyomásnak nincs transzformációja, a toast azonnal jelenik meg. → 10. feladat: `MotionConfig reducedMotion="user"` + Playwright `prefers-reduced-motion: reduce` emulációval a 11. feladatban.

---

### Task 1: Betűpadló 11 px és a panel lábléce a hero-ba

**Files:**
- Modify: `app/components/story-card.tsx` (76, 104, 120), `app/components/tag.tsx`, `app/(app)/library/library-view.tsx` (91, 106), `app/(app)/library/[id]/post-article.tsx` (76, 103), `app/components/app-shell.tsx` (136), `app/components/desktop-nav.tsx` (94), `app/components/digest-dashboard.tsx` (216 és a hero állapotsora), `app/components/nav-parts.tsx` (93), `app/components/post-blocks.tsx` (134, 156), `app/components/reader-panel.tsx` (a lábléc), `app/globals.css` (a `font-size: 10px` a `.signal-grid::after`-ben marad: dekoratív rácsfelirat, nem olvasandó szöveg), `.claude/docs/DESIGN.md`
- Test: `lib/design-tokens.test.ts`

- [ ] **Step 1: A teszt (RED).** A `lib/design-tokens.test.ts` végére:

```ts
// 2a spec D3. Kills a 10px label creeping back: the floor for mono meta is 11px.
test("no component sets text-[10px]: the typographic floor is 11px", () => {
  const offenders = sourceFiles(new URL("../app/", repoRoot)).filter((href) => /\.tsx$/.test(href) && readFileSync(new URL(href), "utf8").includes("text-[10px]"));
  assert.deepEqual(offenders.map((href) => href.slice(repoRoot.href.length)), []);
});
```

A fájl tetejére a `sourceFiles` segéd (a `lib/client-bundle.test.ts`-ből másolva, hogy a két teszt ne függjön egymástól):

```ts
import { readdirSync, readFileSync } from "node:fs";
function sourceFiles(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, dir));
    return [new URL(entry.name, dir).href];
  });
}
```

(ha a `readFileSync` már importálva van, csak a `readdirSync` jön hozzá). Futtatás: `node --experimental-strip-types --no-warnings --test lib/design-tokens.test.ts` → Expected: FAIL, a 14 fájl listájával.

- [ ] **Step 2: A csere.** Minden felsorolt fájlban `text-[10px]` → `text-[11px]`; a `tracking-[0.2em]` a Radar fejlécében `tracking-[0.18em]`, a többi tracking marad. A `tag.tsx`: `px-2 py-1 font-mono text-[11px]`.

- [ ] **Step 3: A panel lábléce.** A `reader-panel.tsx`-ből a copy `invite`, `daily`, `freeze` kulcsai és az őket renderelő blokk kikerül. A `digest-dashboard.tsx` hero állapotsora (a `AUTO / 自動` mellett) kap egy harmadik elemet:

```tsx
                    <span>{t.schedule}</span>
```

copy: hu `schedule: "NAPI 05:00 UTC · ZÁRÁS VAS 24:00"`, en `schedule: "DAILY 05:00 UTC · FREEZE SUN 24:00"`. A `reader-panel.test` (ha a lábléc szövegét pinelte, grep `INVITE`) frissül.

- [ ] **Step 4: DESIGN.md.** Typography tábla: a „Label” sor `text-[11px]`, mono, `tracking-[0.12em]` / `[0.15em]`, „source labels, why it matters, meta, tags; **never under 11px**”; a Colors tábla 246. sora „11px meta labels”; az Eyebrow sor „(the Radar header's is 11px)”; az app-shell és tag kivonatok újramásolva (`slotClass`, `Tag`). A „Progress bar and the reader panel” szakaszból a lábléc említése ki.

- [ ] **Step 5: Futtatás és commit.** A teszt PASS; `node --experimental-strip-types --no-warnings --test lib/design-excerpts.test.ts app/components/shell.test.ts` PASS. Próba: egy `text-[10px]` visszaírva a `tag.tsx`-be → a teszt bukik.

```bash
git commit -m "style: raise the mono label floor to 11px and move the schedule into the radar hero" -- app lib/design-tokens.test.ts .claude/docs/DESIGN.md
```

---

### Task 2: A hírkártya: egy elsődleges gomb, egy eszközsor, a forrás a meta sorban

**Files:**
- Create: `app/components/card-toolbar.tsx`, `app/components/card-toolbar.test.ts`
- Modify: `app/components/story-card.tsx` (a `StoryCard` meta oszlopa, a `MustReadCard` fejléce, a `CardFooter`), `app/components/shell.test.ts` (222–230), `.claude/docs/DESIGN.md` (a story-card kivonatai)

**Interfaces:**
- Produces: `CardToolbar({ itemId, saved, hasTodo, rating, language, onToggleSaved, onAddTodo })`.
- Consumes: `RatingControl`, `pressedClass`, `Button`.

- [ ] **Step 1: A teszt (RED).** `app/components/card-toolbar.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { CardToolbar } = await import("./card-toolbar.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RatingsProvider } = await import("./rating-control.tsx");

const toolbar = (props: Partial<ComponentProps<typeof CardToolbar>> = {}) =>
  render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RatingsProvider, { send: async () => ({}) }, createElement(CardToolbar, { itemId: "a", saved: false, hasTodo: false, rating: null, language: "hu", onToggleSaved: () => {}, onAddTodo: () => {}, ...props })),
    ),
  );

// 2a spec D1. Kills the toolbar losing one of its five buttons, the Later toggle not pressed when saved, the
// to-do button enabled once the item is a to-do, and the group not being one flex unit (it must wrap as one).
test("the card toolbar is one unit of the three ratings, Later and To-do", () => {
  const doc = toolbar({ saved: true, hasTodo: true });
  const unit = doc.querySelector("[data-card-toolbar]")!;
  assert.equal(unit.querySelectorAll("button").length, 5);
  assert.equal(unit.querySelector('button[aria-label="Később"]')?.getAttribute("aria-pressed"), "true");
  assert.equal(unit.querySelector('button[aria-label="Már a teendők között"]')?.hasAttribute("disabled"), true);
  assert.equal(doc.querySelector('[data-card-toolbar] [role="group"]') !== null, true);
});
```

Futtatás → FAIL (nincs modul).

- [ ] **Step 2: A komponens.** `app/components/card-toolbar.tsx`:

```tsx
"use client";

import { Bookmark, BookmarkCheck, ListChecks, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import type { RatingValue } from "@/lib/ratings";
import { pressedClass } from "./rating-classes";
import { RatingControl } from "./rating-control";

const copy = {
  hu: { later: "Később", addTodo: "Teendőhöz adás", hasTodo: "Már a teendők között" },
  en: { later: "Later", addTodo: "Add to to-dos", hasTodo: "Already a to-do" },
};

/** A card's tool row (2a spec D1): the three ratings, then Later and To-do in the same size, one flex unit
 *  so it wraps as a whole and the To-do icon never stands alone on a line. */
export function CardToolbar({ itemId, saved, hasTodo, rating, language, onToggleSaved, onAddTodo }: {
  itemId: string;
  saved: boolean;
  hasTodo: boolean;
  rating: RatingValue | null;
  language: Language;
  onToggleSaved: () => void;
  onAddTodo: () => void;
}) {
  const t = copy[language];
  const todoLabel = hasTodo ? t.hasTodo : t.addTodo;
  return (
    <div data-card-toolbar className="flex items-center gap-1">
      <RatingControl target={{ kind: "item", id: itemId }} initial={rating} />
      <Button
        variant="brutal"
        size="icon-lg"
        aria-pressed={saved}
        aria-label={t.later}
        title={t.later}
        onClick={onToggleSaved}
        className={`size-10 sm:pointer-fine:size-8 ${pressedClass}`}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
      </Button>
      <Button variant="brutal" size="icon-lg" disabled={hasTodo} aria-label={todoLabel} title={todoLabel} onClick={onAddTodo} className="size-10 sm:pointer-fine:size-8">
        {hasTodo ? <ListChecks /> : <ListPlus />}
      </Button>
    </div>
  );
}
```

Futtatás → PASS.

- [ ] **Step 3: A kártya (RED a shell-tesztben).** A `shell.test.ts` 222–230. sorának tesztje:

```ts
// 2a spec D1 and Review Focus 2. Kills the source link gone from the meta row (and with it the `o` shortcut's
// target), two primary buttons, and a Read toggle anywhere but last.
test("StoryCard puts the source in its meta row, one Read here button, the toolbar, then Read last", () => {
  const item = previewItems.find((candidate) => !candidate.mustRead)!;
  const doc = withShellProviders(StoryCard, { item, state: { read: false, saved: false }, hasTodo: false, language: "en", actions: cardActions, rating: null });
  const article = doc.querySelector("article.story-card")!;
  assert.equal(article.getAttribute("data-card-id"), item.id);
  assert.equal(article.querySelector("[data-card-open]")?.getAttribute("href"), item.url);
  assert.equal(article.querySelectorAll('a[href^="http"]').length, 1, "the source link, once, in the meta row");
  assert.equal(article.querySelectorAll("[data-card-toolbar]").length, 1);
  const buttons = [...article.querySelectorAll("button")];
  assert.match(buttons.at(-1)?.textContent ?? "", /Read/);
  assert.equal(article.querySelectorAll("button[aria-pressed]").length, 5); // Later + Read + the three rating toggles
});
```

Futtatás → FAIL (`a[href^="http"]` 1, de a `[data-card-toolbar]` 0).

- [ ] **Step 4: A `story-card.tsx`.**
  - A copy-ból `later`, `addTodo`, `hasTodo` kikerül (a toolbaré); `open` marad a forrás-linknek: hu `"Forrás"`, en `"Source"`.
  - **Forrás a meta sorban:** a `CardText` első sora (`item.source`) link lesz:

```tsx
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        data-card-open
        onClick={() => actions.onOpen(item)}
        onAuxClick={(event) => {
          if (event.button === 1) actions.onOpen(item);
        }}
        className="focus-ring inline-flex min-h-10 items-center gap-1 font-mono text-[11px] tracking-[0.12em] text-signal [overflow-wrap:anywhere] hover:underline"
      >
        {item.source} <ExternalLink className="size-3" aria-hidden="true" />
        <span className="sr-only">({t.open})</span>
      </a>
```

  A `CardText` ehhez megkapja az `actions`-t (a `CardProps` már tartalmazza).
  - **A `CardFooter`:**

```tsx
function CardFooter({ item, state, hasTodo, language, actions, postId, rating }: CardProps) {
  const t = copy[language];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {postId !== undefined ? (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}`} onClick={() => actions.onOpen(item)}>
            <BookOpen /> {t.readHere} <PendingDot />
          </Link>
        </Button>
      ) : (
        parseSubmittedUrl(item.url) && (
          <Button
            variant="brutal"
            className="min-h-10"
            onClick={(event) => {
              actions.onOpen(item);
              actions.onReadHere(item, event.currentTarget);
            }}
          >
            <BookOpen /> {t.readHere}
          </Button>
        )
      )}
      <CardToolbar
        itemId={item.id}
        saved={state.saved}
        hasTodo={hasTodo}
        rating={rating}
        language={language}
        onToggleSaved={() => actions.onToggle(item.id, "saved")}
        onAddTodo={() => actions.onAddTodo(item)}
      />
      <Button variant="brutal" aria-pressed={state.read} onClick={() => actions.onToggle(item.id, "read")} className={`ml-auto min-h-10 sm:pointer-fine:min-h-8 ${pressedClass}`}>
        <Check /> {t.read}
      </Button>
    </div>
  );
}
```

  Az importokból `Bookmark`, `BookmarkCheck`, `ListChecks`, `ListPlus`, `RatingControl` kikerül; jön a `CardToolbar`. A `[data-card-open]` csak a meta linken marad, így az `o` továbbra is a forrást nyitja.

- [ ] **Step 5: DESIGN.md.** A story-card három kivonata (643, 647, 651. sor) újramásolva; a „must-card and story-card” szöveg: „[Olvasd itt] [👎 👍 ❤ 🔖 ☑] … [✓ Elolvastam]: one primary action, one tool unit (`CardToolbar`, `card-toolbar.tsx`), the Read toggle last; the source is a link in the meta row.”

- [ ] **Step 6: Futtatás, próbák, commit.** `node --experimental-strip-types --no-warnings --test app/components/shell.test.ts app/components/card-toolbar.test.ts lib/design-excerpts.test.ts` → PASS. Próbák: a `data-card-open` levéve a linkről → bukik; a Read gomb az eszközsor elé → bukik.

```bash
git add app/components/card-toolbar.tsx app/components/card-toolbar.test.ts
git commit -m "feat: give the story card one primary action, a tool unit and its source in the meta row" -- app/components .claude/docs/DESIGN.md
```

---

### Task 3: A kártya három állapota, három jel

**Files:**
- Modify: `app/components/rating-classes.ts` (`dislikedClass`), `app/components/story-card.tsx` (`data-saved`), `app/globals.css`, `app/components/shell.test.ts`, `app/components/rating-control.test.ts` (ha a `dislikedClass` opacitását pineli), `.claude/docs/DESIGN.md`

- [ ] **Step 1: A teszt (RED).** `shell.test.ts`-be:

```ts
// 2a spec D4 and Review Focus 1. Kills a saved card with no mark of its own (only the toggle showed it), a 👎
// that also dims (read and 👎 would look the same), and a read 👎 card losing either sign.
test("a card shows saved, read and 👎 with three different signs that can combine", () => {
  const item = previewItems.find((candidate) => !candidate.mustRead)!;
  const saved = withShellProviders(StoryCard, { item, state: { read: false, saved: true }, hasTodo: false, language: "en", actions: cardActions, rating: null });
  assert.equal(saved.querySelector("article")?.getAttribute("data-saved"), "");
  const readDown = withShellProviders(StoryCard, { item, state: { read: true, saved: false }, hasTodo: false, language: "en", actions: cardActions, rating: -1 });
  const article = readDown.querySelector("article")!;
  assert.ok(article.classList.contains("story-read"));
  assert.equal(article.querySelector('[role="group"]')?.getAttribute("data-rating"), "down");
  assert.equal(article.hasAttribute("data-saved"), false);
});
```

És a `rating-classes` sorát pinelő teszt: `assert.equal(dislikedClass, "has-[[data-rating=down]]:border-dashed");` a `rating-control.test.ts`-ben (ha már van ilyen állítás az opacitással, az cserélődik). Futtatás → FAIL (`data-saved` hiányzik; a `dislikedClass` még opacitást hordoz).

- [ ] **Step 2: A kód.** `rating-classes.ts`: `export const dislikedClass = "has-[[data-rating=down]]:border-dashed";` és a komment: „A card or row that holds a 👎 rating turns its frame dashed; it stays as readable as the rest (2a spec D4: read dims, 👎 dashes, saved shows a bar).” `story-card.tsx`: mindkét `article` kap `data-saved={state.saved || undefined}`-et (a `cardFocus` mellé). `globals.css`, a `.story-read` sor után:

```css
/* A saved card (2a spec D4): a 4px signal bar on its left edge, visible without the Later toggle. */
.story-card, .must-card { position: relative; }
.story-card[data-saved]::before, .must-card[data-saved]::before { content: ""; position: absolute; inset: -2px auto -2px -2px; width: 4px; background: var(--signal); }
```

- [ ] **Step 3: DESIGN.md.** A „must-card and story-card” szakaszba a D4 táblázata (Olvasott: `opacity-60`, a sor végén; 👎: szaggatott keret; Később: signal sáv balra, `data-saved`), a `rating-classes.ts` kivonat (663. sor) és a két `article` kivonat újramásolva; a `globals.css` kivonatba a két új sor, ha a kivonat a `.story-read`-et tartalmazza.

- [ ] **Step 4: Futtatás, próba, commit.** A tesztek PASS. Próba: a `data-saved` levéve → bukik; az `opacity-60` visszaírva a `dislikedClass`-ba → bukik.

```bash
git commit -m "feat: give a saved card its own mark and keep a disliked card readable" -- app/components app/globals.css .claude/docs/DESIGN.md
```

---

### Task 4: Címek a saját oszlophoz, szó közben soha; alacsonyabb másodlagos hero

**Files:**
- Modify: `app/components/page-header.tsx` (`HeroBand`, `PageHero`), `app/components/digest-dashboard.tsx` (a Radar heroja telefonon, R3 §1), `app/components/page-skeletons.tsx` (a `HeroBand`-dal egy vonalban maradó váz, ha a padding-ot pineli), `.claude/docs/DESIGN.md`
- Test: `app/components/page-header.test.ts` (új)

- [ ] **Step 1: A teszt (RED).** `app/components/page-header.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../lib/test/render.ts";

const { PageHero } = await import("./page-header.tsx");

// 2a spec D2 and Review Focus 3. Kills a title sized to the viewport (vw) instead of its own column (cqi), one
// that may break inside a word from sm up, and a lead that keeps its old top margin (the hero is lower now).
test("PageHero sizes its title to its column, breaks inside a word only below sm, and sits lower", () => {
  const doc = render(createElement(PageHero, { eyebrow: "E", title: "GYŰJTEMÉNY", lead: "lead" }));
  const h1 = doc.querySelector("h1")!;
  assert.match(h1.className, /cqi/);
  assert.doesNotMatch(h1.className, /vw/);
  assert.match(h1.className, /sm:\[overflow-wrap:normal\]/);
  assert.ok(h1.closest(".\\@container"), "the title's column is the container");
  assert.match(doc.querySelector("section")?.className ?? "", /py-8 sm:py-10/);
});
```

Futtatás → FAIL.

- [ ] **Step 2: A kód.** `page-header.tsx`:

```tsx
export function HeroBand({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="@container border-b-2 border-signal bg-cream px-4 py-8 text-ink sm:px-10 sm:py-10">
      <div className={`mx-auto max-w-6xl ${aside ? "grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)] @4xl:items-end" : ""}`}>
        {/* The title's own column is the container: on the Library the form sits beside it. */}
        <div className="min-w-0 @container">{children}</div>
        {aside}
      </div>
    </section>
  );
}

export function PageHero({ eyebrow, title, lead, aside }: { eyebrow: string; title: string; lead: ReactNode; aside?: ReactNode }) {
  return (
    <HeroBand aside={aside}>
      <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
      {/* 12cqi: GYŰJTEMÉNY fits one line beside the Library form at 1280; below sm the screen is narrower than the word, so it may break anywhere there. */}
      <h1 className="mt-3 font-display text-[clamp(2.4rem,12cqi,7rem)] leading-[0.8] tracking-[-0.06em] [overflow-wrap:anywhere] [hyphens:manual] sm:[overflow-wrap:normal]">
        {title}
        <span className="text-signal">{"//"}</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-7 text-ink/65">{lead}</p>
    </HeroBand>
  );
}
```

  A Radar heroja (`digest-dashboard.tsx`, 283–300): a lead `hidden sm:block`, az archívum-doboz `hidden sm:block`, és `sm` alatt egy egysoros állapot a cím alatt: `<p className="mt-3 font-mono text-xs text-paper/60 sm:hidden">{t.archive}: {issue.archiveAt} · {archived ? t.frozen : t.collecting}</p>`; a szekció paddingja `py-6 sm:py-9`. A `page-skeletons.tsx` `HeroBand`-vázának paddingja ugyanígy `py-8 sm:py-10`.

- [ ] **Step 3: DESIGN.md.** A `page-header.tsx` kivonatai (512, 543) újramásolva; a „`PageHero` and `StatusCard`” szövegben: „sized to its column (`12cqi`), never breaking inside a word from `sm`; the band is `py-8 sm:py-10`, the Radar's own hero keeps its size”; a Layout → Rhythm sorba a hero magassága.

- [ ] **Step 4: Futtatás, próba, commit.** PASS; `shell.test.ts`, `page-skeletons.test.ts`, `design-excerpts` PASS. Próba: `sm:[overflow-wrap:normal]` levéve → bukik.

```bash
git add app/components/page-header.test.ts
git commit -m "feat: size the page titles to their column and lower the secondary heroes" -- app/components .claude/docs/DESIGN.md
```

---

### Task 5: R3 elrendezés: alacsony képernyő, a panel oszlopa, szélességek és rácsok

**Files:**
- Modify: `app/globals.css` (alacsony képernyő), `app/components/digest-dashboard.tsx` (a gyökér `@container`, a panel oszlop `@[95rem]:`), `app/components/story-card.tsx` (`max-w-[900px]`), `app/(app)/library/[id]/post-notices.tsx` és `post-article.tsx` (75ch), `app/(app)/library/library-view.tsx` és `app/(app)/archive/archive-view.tsx` és `app/(app)/github/github-view.tsx` és `app/(app)/collection/collection-view.tsx` (a közös szélesség és a rács), `app/components/page-header.tsx` (`max-w-6xl` → a közös korlát), `app/components/page-skeletons.tsx`, `.claude/docs/DESIGN.md`
- Test: `app/components/shell.test.ts`, `lib/design-tokens.test.ts`

- [ ] **Step 1: A teszt (RED).** `shell.test.ts`-be:

```ts
// R3 spec §2–3. Kills the panel column keyed to the viewport (2xl) instead of the Radar's own width, a story
// card with no width cap on a wide screen, and the list grids stuck at two columns.
test("the Radar's panel column and the list grids follow their own width, and a story card is capped", () => {
  const radar = withShellProviders(DigestDashboard, { issue: previewIssue, items: previewItems, githubTop10: previewGithub, preview: { data: previewReader, failWrites: false } });
  const root = radar.querySelector("aside")!.parentElement!;
  assert.match(root.className, /@\[95rem\]:grid-cols/);
  assert.doesNotMatch(root.className, /2xl:grid-cols/);
  assert.match(radar.querySelector("article.story-card")?.className ?? "", /max-w-\[900px\]/);
  const library = withShellProviders(LibraryView, { posts: previewPosts, open: previewSources, readIds: previewReadPostIds, ratings: {}, preview: { failWrites: false } });
  assert.match(library.querySelector('a[href^="/library/"]')!.parentElement!.className, /@\[72rem\]:grid-cols-3/);
});
```

És a `design-tokens.test.ts`-be a CSS-re: `assert.match(css, /max-height: 31\.25rem/, "the low-viewport rule for the sticky Radar header");`. Futtatás → FAIL.

- [ ] **Step 2: A kód.**
  - **Alacsony képernyő (R3 §1):** `globals.css`:

```css
/* R3 §1: on a short viewport (a landscape phone) the Radar's sticky header and chip bar scroll with the page; only the bottom bar stays. */
@media (max-height: 31.25rem) {
  .radar-header, .radar-chips { position: static; }
}
```

  A `digest-dashboard.tsx` fejléce `radar-header` osztályt, a chip-sáv `radar-chips`-et kap.
  - **A panel oszlopa (R3 §2):** a dashboard gyökere `<div className="min-w-0 bg-cream text-ink @container">`; a rács `grid-cols-1 @[95rem]:grid-cols-[minmax(0,1fr)_330px]`; az `aside` `hidden … @[95rem]:sticky @[95rem]:top-16 @[95rem]:block @[95rem]:h-[calc(100dvh-4rem)] @[95rem]:overflow-y-auto`; a panel pill-gombja `@[95rem]:hidden`. A `2xl:` előfordulások ebben a fájlban mind `@[95rem]:` lesznek. Figyelem: a gyökérben nincs `position: fixed` gyerek (a Sheet portálon renderelődik), ezért a container biztonságos.
  - **Széles képernyő (R3 §3):** `story-card.tsx` `StoryCard` article: `max-w-[900px]`; `post-notices.tsx` minden figyelmeztetés-doboza és a `post-article.tsx` © sora `max-w-[75ch]`; a Library nyitott forrásainak sorai (`library-view.tsx` 50–63) `max-w-[75ch]`.
  - **Rácsok és közös korlát:** a `PageHero` és a lista-oldalak `max-w-6xl` helyett `max-w-[1600px]`; a Library és az Archívum rácsa `grid gap-5 @container` szülővel: `@[48rem]:grid-cols-2 @[72rem]:grid-cols-3 @[96rem]:grid-cols-4` (a `lg:grid-cols-2` helyett), a GitHub és a Gyűjtemény listája egy oszlop marad (sorok). A `page-skeletons.tsx` lista-váza ugyanezt a rácsot kapja.

- [ ] **Step 3: DESIGN.md.** Layout → Widths: „Page content is capped at `max-w-[1600px]` (the hero and the grids line up); a story card at 900px; post text, notices and the © line at 75ch.” Layout → Rhythm: a rácsok 1–4 oszlopa. A `digest-dashboard.tsx` kivonatok (595, 726, 798) és a `library-view.tsx` kivonat (537, 806) újramásolva. A „Page shell” szövegében a `2xl` → „the Radar's own width (`@[95rem]`)”.

- [ ] **Step 4: Futtatás, próba, commit.** PASS. Próba: `@[95rem]` → `2xl` visszaírva → bukik.

```bash
git commit -m "feat: lay the radar panel, the grids and the widths out by their own container" -- app .claude/docs/DESIGN.md
```

---

### Task 6: R3 rétegek: egyszerre egy panel, a taiyaki árnyéka

**Files:**
- Modify: `app/components/app-shell.tsx` (`PanelContext`, a chat és a panel egymást zárja), `app/components/digest-dashboard.tsx` (a Sheet vezérelt), `app/components/link-chat.tsx` (a sarok-taiyaki nyugalmi árnyéka), `app/components/reader-panel.tsx` (az oszlop alja), `app/components/shell.test.ts`, `.claude/docs/DESIGN.md`

**Interfaces:**
- Produces: `PanelContext` és `usePanel(): { open: boolean; setOpen: (open: boolean) => void }` az `app-shell.tsx`-ből; a dashboard Sheetje `open={panel.open} onOpenChange={panel.setOpen}`.

- [ ] **Step 1: A teszt (RED).** `shell.test.ts`-be:

```ts
// R3 spec §4. Kills the to-do panel and the link chat open at once: opening one closes the other.
test("opening the link chat closes the reader panel, and opening the panel closes the chat", async () => {
  const { createShellLayers } = await import("./app-shell.tsx");
  const layers = createShellLayers();
  layers.setPanelOpen(true);
  layers.setChatOpen(true);
  assert.deepEqual([layers.panelOpen(), layers.chatOpen()], [false, true]);
  layers.setPanelOpen(true);
  assert.deepEqual([layers.panelOpen(), layers.chatOpen()], [true, false]);
});
```

Futtatás → FAIL.

- [ ] **Step 2: A kód.** `app-shell.tsx`-ben egy keret-független kis állapotgép, amit a komponens `useSyncExternalStore`-ral olvas (a tesztelhetőség miatt, mint a `createRatingStore`):

```ts
/** The two overlays that never show together (R3 §4): the reader panel and the link chat. */
export function createShellLayers() {
  let panel = false;
  let chat = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    panelOpen: () => panel,
    chatOpen: () => chat,
    setPanelOpen(open: boolean) {
      panel = open;
      if (open) chat = false;
      notify();
    },
    setChatOpen(open: boolean) {
      chat = open;
      if (open) panel = false;
      notify();
    },
  };
}
```

  Az `AppShell` egy `useState(() => createShellLayers())`-ben tartja, `useSyncExternalStore(layers.subscribe, layers.chatOpen, layers.chatOpen)`-nel olvassa a `chatOpen`-t (a mai `useState` helyett; a `toggleChat`, a `readHere` és a `LinkChat onOpenChange` a `layers.setChatOpen`-t hívja), és egy `PanelContext`-ben adja a `{ open, setOpen }` párt. `usePanel()` a `ReadHereContext` mintájára (provider nélkül dob). A `digest-dashboard.tsx` Sheetje: `const panel = usePanel(); <Sheet modal={false} open={panel.open} onOpenChange={panel.setOpen}>`. A `/dev/preview` ugyanazt az `AppShell`-t használja, nem változik.
  - **A sarok-taiyaki árnyéka:** `app-shell.tsx` 110. sor: `shadow-[4px_4px_0_var(--ink)]` → `shadow-[4px_4px_0_var(--signal)]`.
  - **Az oszlop alja:** a `reader-panel.tsx` gyökérfragmentje helyett egy `<div className="pb-24">` a `@[95rem]` oszlopban (a dashboard `aside`-ja kapja a `pb-24`-et), hogy a sarok-taiyaki ne takarja az utolsó teendőt.

- [ ] **Step 3: DESIGN.md.** Elevation & Depth → Layering: „the reader panel and the link chat never show together (`createShellLayers`)”; a Link chat szakaszban a sarok-taiyaki árnyéka signal; az `app-shell.tsx` kivonatok (394, 472, 476, 483) újramásolva.

- [ ] **Step 4: Futtatás, próba, commit.** PASS; a shell többi tesztje PASS. Próba: `if (open) chat = false;` törölve → bukik.

```bash
git commit -m "feat: show one overlay at a time and give the corner taiyaki a signal shadow" -- app/components .claude/docs/DESIGN.md
```

---

### Task 7: Fiók-menü az oldalsávban, a „hamarosan” sorok ki

**Files:**
- Create: `app/components/account-menu.tsx`, `app/components/account-menu.test.ts`
- Modify: `app/components/desktop-nav.tsx` (a láb), `app/components/app-shell.tsx` (a „Több” sheet alja), `app/components/nav-parts.tsx` (`AccountActions` és `SoonList` törölve), `lib/nav.ts` (`stats`, `chat` sorok ki, `SOON_NAV` ki), `lib/nav.test.ts`, `app/components/shell.test.ts`, `.claude/docs/DESIGN.md`, `.claude/CLAUDE.md`

**Interfaces:**
- Produces: `AccountMenu({ email, onHelp, iconOnly? })`: a lenyíló menü (Radix `DropdownMenu`) három sorral: nyelv (a `LanguageToggle`), súgó (gomb, `onHelp`), kilépés (form `POST /auth/signout`); `AccountRows({ email, onHelp })` ugyanez sorokként a mobil sheetbe.

- [ ] **Step 1: A teszt (RED).** `app/components/account-menu.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ComponentProps } from "react";
import { render } from "../../lib/test/render.ts";

const { AccountRows } = await import("./account-menu.tsx");
const { LanguageProvider } = await import("./language-context.tsx");
const { RefreshProvider } = await import("./refresh-bar.tsx");

// 2a spec D5. Kills the e-mail cut short (it is the one line that says who is signed in), a sign-out that
// isn't a POST form (a GET link could be prefetched), and a row missing.
test("the account rows show the whole e-mail, the language, the help and a POST sign-out", () => {
  const doc = render(
    createElement(
      LanguageProvider,
      { initial: "hu" } as ComponentProps<typeof LanguageProvider>,
      createElement(RefreshProvider, null, createElement(AccountRows, { email: "a-very-long-address@example.test", onHelp: () => {} })),
    ),
  );
  assert.match(doc.body.textContent ?? "", /a-very-long-address@example\.test/);
  assert.equal(doc.querySelector('form[action="/auth/signout"]')?.getAttribute("method"), "post");
  assert.ok(doc.querySelector('button[aria-label="Switch to English"]'));
  assert.ok([...doc.querySelectorAll("button")].some((b) => /Billentyűparancsok/.test(b.textContent ?? "")));
  assert.equal(doc.querySelector("p")?.className.includes("truncate"), false);
});
```

Futtatás → FAIL. (A `LanguageToggle` a `useRefresh`-t használja, ezért kell a `RefreshProvider`; a `usePathname` a stubból „/”.)

- [ ] **Step 2: A komponens.** `app/components/account-menu.tsx`:

```tsx
"use client";

import { Keyboard, LogOut, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "./language-context";
import { LanguageToggle } from "./language-toggle";
import { NavTooltip } from "./nav-parts";

const copy = {
  hu: { account: "Fiók", language: "Nyelv", shortcuts: "Billentyűparancsok", signOut: "Kijelentkezés" },
  en: { account: "Account", language: "Language", shortcuts: "Keyboard shortcuts", signOut: "Sign out" },
};

const rowClass = "flex min-h-10 w-full items-center justify-between gap-3 font-mono text-[11px]";

/** The three rows every account surface shows (2a spec D5): the language, the shortcuts help, sign out. The
 *  e-mail wraps rather than truncates: it is the one line that says who is signed in. */
export function AccountRows({ email, onHelp }: { email: string; onHelp: () => void }) {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 font-mono text-[11px] opacity-70 [overflow-wrap:anywhere]">
        <UserRound className="size-4 shrink-0" aria-hidden="true" /> {email}
      </p>
      <div className={rowClass}>
        <span className="tracking-[0.14em]">{t.language}</span>
        <LanguageToggle />
      </div>
      <button type="button" onClick={onHelp} className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
        <span className="flex items-center gap-2">
          <Keyboard className="size-4" aria-hidden="true" /> {t.shortcuts}
        </span>
        <kbd className="border border-current/40 px-1.5 text-[11px]">?</kbd>
      </button>
      <form action="/auth/signout" method="post">
        <button type="submit" className={`press-shift focus-ring ${rowClass} hover:text-signal`}>
          <span className="flex items-center gap-2">
            <LogOut className="size-4" aria-hidden="true" /> {t.signOut}
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  );
}

/** The sidebar's foot: the avatar (the e-mail's first letter in a signal circle) and the address open the rows
 *  in a dropdown; in the rail only the avatar shows, named in a tooltip. */
export function AccountMenu({ email, onHelp, iconOnly = false }: { email: string; onHelp: () => void; iconOnly?: boolean }) {
  const { language } = useLanguage();
  const t = copy[language];
  const avatar = <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal font-display text-sm text-ink">{(email[0] ?? "?").toUpperCase()}</span>;
  const trigger = (
    <DropdownMenuTrigger
      aria-label={iconOnly ? t.account : undefined}
      className={`press-ink focus-ring flex min-h-10 w-full items-center gap-3 text-left font-mono text-[11px] text-paper/70 hover:text-paper data-[state=open]:text-signal ${iconOnly ? "justify-center" : ""}`}
    >
      {avatar}
      {!iconOnly && <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{email}</span>}
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {iconOnly ? <NavTooltip label={t.account}>{trigger}</NavTooltip> : trigger}
      <DropdownMenuContent side="top" align="start" className="w-72 border-2 border-ink bg-cream p-4 text-ink shadow-[6px_6px_0_var(--signal)]">
        <DropdownMenuLabel className="px-0 font-display text-xl">{t.account}<span className="text-signal">{"//"}</span></DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-ink/20" />
        {/* The rows handle their own keys and clicks; the menu only positions and dismisses them. */}
        <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()} className="block p-0 focus:bg-transparent">
          <div>
            <AccountRows email={email} onHelp={onHelp} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

  (A `DropdownMenuContent` a vendored shadcn komponensé: `rounded-md` és `shadow-md` osztályokat hordoz; a `className` felülírja őket a `cn` sorrendjében; ha nem, a `rounded-none shadow-none` kerül a className elejére.)

- [ ] **Step 3: A bekötés.** `desktop-nav.tsx` láb: a `LanguageToggle`, a súgó-gomb és az `AccountActions` helyett `rail ? <AccountMenu email={email} onHelp={onHelp} iconOnly /> : <AccountMenu email={email} onHelp={onHelp} />`, és alatta a `toggle`; a `SoonList` sor kikerül; a `Keyboard` import és a `shortcuts` copy marad csak, ha a `?` tooltip kell (nem: kikerül). `app-shell.tsx` MobileNav sheet: a nyelv-sor, a `SoonList` és az `AccountActions` helyett `<AccountRows email={email} onHelp={onSearchHelp} />` — a `MobileNav` kap egy `onHelp` propot az `AppShell`-től (`openHelp`), és a sheet a sor kattintására zárul (`onHelp={() => { setMoreOpen(false); onHelp(); }}`). `nav-parts.tsx`: `AccountActions`, `SoonList` és a `soonGroup`/`soon`/`signOut` copy törölve; `navIcons` a `stats`/`chat` sorok nélkül. `lib/nav.ts`: a `NavId` unióból `"stats" | "chat"` ki, a két sor ki, `SOON_NAV` ki, a `soon` mező marad a típusban (a jövőre). `lib/nav.test.ts`: a „soon item is never a link” állítás marad (üres halmazra igaz), a `SOON_NAV` import ki, ha volt. `shell.test.ts`: a nav-linkek száma marad 6; új állítás a „Több” sheet tesztjében nem kell (a sheet zárt renderben nem látszik).

- [ ] **Step 4: Doksi.** DESIGN.md → Sidebar and rail: az „Entries” pont „The coming views are listed at 40% opacity…” mondata ki; új pont: „**The foot:** the account menu (`account-menu.tsx`): the avatar and the whole address open a cream dropdown with the language, the shortcuts help and sign out; in the rail the avatar alone, named in a tooltip.” A „Bottom bar and the Több sheet”: „the language, the coming views and the account row” → „the account rows (language, help, sign out)”. `desktop-nav.tsx` kivonatok (453, 457) ellenőrizve. CLAUDE.md → App shell: a „dimmed hamarosan views” az egy-lista pontból ki; „Desktop” pont: a láb a fiók-menü; „Mobile”: a Több sheet alja a fiók-sorok.

- [ ] **Step 5: Futtatás, próba, commit.** `node --experimental-strip-types --no-warnings --test app/components/account-menu.test.ts app/components/shell.test.ts lib/nav.test.ts lib/design-excerpts.test.ts` PASS. Próba: a `method="post"` → `get` → bukik.

```bash
git add app/components/account-menu.tsx app/components/account-menu.test.ts
git commit -m "feat: fold the language, help and sign-out into an account menu and drop the soon rows" -- app/components lib/nav.ts lib/nav.test.ts .claude/docs/DESIGN.md .claude/CLAUDE.md
```

---

### Task 8: A belépés a landing keretében, a kilépés a landingre

**Files:**
- Modify: `app/login/page.tsx`, `app/login/page.test.ts`, `app/auth/signout/route.ts`, `app/about/page.tsx`, `app/about/page.test.ts`, `app/components/public-page.tsx` (a „Kijelentkeztél” sor), `.claude/CLAUDE.md` (Auth), `.claude/docs/DESIGN.md` (`StatusCard` szakasz)
- Create: `app/auth/signout/route.test.ts`

- [ ] **Step 1: A tesztek (RED).**
  - `app/auth/signout/route.test.ts` (a `route-hooks.ts` `routeStub`-jával, mint a `app/auth/google/route.test.ts`):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { authRequest, fakeAuth } from "../../../lib/test/fake-auth.ts";
import { routeStub } from "../../../lib/test/route-hooks.ts";

const { POST } = await import("./route.ts");

// 2a spec D6. Kills a sign-out that lands on the sign-in form instead of the landing page, and one that
// forgets to say it happened.
test("POST /auth/signout signs out and sends the visitor to the landing page with a signed_out mark", async () => {
  const auth = fakeAuth();
  routeStub.auth = auth;
  const response = await POST(authRequest("/auth/signout"));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search, "/about?signed_out=1");
  assert.equal(auth.calls.signOut, 1);
});
```

  (A `fakeAuth`/`authRequest` szerződése a `lib/test/fake-auth.ts`-ben; ha a `signOut` számlálója hiányzik, a fake kap egy `calls.signOut` mezőt.)
  - `app/about/page.test.ts`-be (Review Focus 4):

```ts
// 2a spec D6 and Review Focus 4. Kills the signed-out note missing, shown without the mark, or carried in the
// landing's own links.
test("the about page says you're signed out only on ?signed_out=1, and its links drop the mark", async () => {
  const marked = render(await AboutPage({ searchParams: Promise.resolve({ signed_out: "1" }) }));
  assert.match(marked.querySelector('[role="status"]')?.textContent ?? "", /Kijelentkeztél/);
  assert.equal([...marked.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("signed_out")), false);
  const plain = render(await AboutPage({ searchParams: Promise.resolve({}) }));
  assert.equal(plain.querySelector('[role="status"]'), null);
});
```

  - `app/login/page.test.ts`-be: `assert.ok(doc.querySelector('header a[href="/about"]'), "the login page sits in the public frame");` az első tesztbe.
  Futtatás → FAIL mind.

- [ ] **Step 2: A kód.**
  - `app/auth/signout/route.ts`: `return NextResponse.redirect(new URL("/about?signed_out=1", request.nextUrl.origin), 303);`
  - `public-page.tsx`: új prop `notice?: Localized`; a `header` után: `{notice && <p role="status" className="mx-auto max-w-[1600px] px-4 pb-2 font-mono text-xs text-signal sm:px-10"><LocalizedText value={notice} /></p>}`.
  - `app/about/page.tsx`: `searchParams: Promise<{ signed_out?: string }>`; `const { signed_out } = await searchParams;` és `<PublicPage language={…} notice={signed_out === "1" ? copy.signedOut : undefined}>`; copy: `signedOut: { hu: "Kijelentkeztél.", en: "You're signed out." }`.
  - `app/login/page.tsx`: a `StatusCard` helyett a `PublicPage` kerete és benne a landing belépő-kártyájának mása: `<main className="mx-auto max-w-[1600px] px-4 py-12 sm:px-10"><div className="max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">…</div></main>`, a kártyában: eyebrow `INVITE-ONLY / CSAK MEGHÍVÓVAL`, cím `SIGN IN//`, az `ErrorLine`, a `SignInForms`, és a `sent` állapot. A kártya kerete egy közös `SignInCard({ title, children })` komponensbe kerül a `sign-in-forms.tsx`-be, amit az `/about` belépő szakasza is használ (a 2 példány helyett 1). A `login/page.tsx` `getLanguage()`-t olvas a `PublicPage`-hez.
  - A `StatusCard` marad a hiba- és 404-oldalnak.

- [ ] **Step 3: Doksi.** CLAUDE.md → Auth: „`/login` sits in the public frame (`PublicPage`), sharing `SignInCard` with `/about`; `POST /auth/signout` lands on `/about?signed_out=1`, whose header shows a one-line status.” DESIGN.md → `PageHero` and `StatusCard`: a `StatusCard` „the error and not-found pages” (a sign-in kikerül).

- [ ] **Step 4: Futtatás, próba, commit.** PASS. Próba: a redirect `/login` visszaírva → bukik; a `signed_out === "1"` → `true` → a „plain” eset bukik.

```bash
git add app/auth/signout/route.test.ts
git commit -m "feat: put sign-in in the public frame and send sign-out to the landing page" -- app/login app/auth/signout app/about app/components/public-page.tsx app/components/sign-in-forms.tsx .claude/CLAUDE.md .claude/docs/DESIGN.md
```

---

### Task 9: `EmptyState`, `StatTile`, `Kbd`

**Files:**
- Create: `app/components/empty-state.tsx`, `app/components/stat-tile.tsx`, `app/components/kbd.tsx`, `app/components/ui-kit.test.ts`
- Modify: `app/components/digest-dashboard.tsx` (`EmptyNote` → `EmptyState`), `app/(app)/library/library-view.tsx`, `app/(app)/github/github-view.tsx`, `app/(app)/collection/collection-view.tsx` (az üres állapotok), `app/components/reader-panel.tsx` (a haladás blokkja `StatTile`), `app/components/shell-dialogs.tsx` és `app/components/desktop-nav.tsx` és `app/components/account-menu.tsx` (`<kbd>` → `Kbd`), `.claude/docs/DESIGN.md`

**Interfaces:**
- Produces: `EmptyState({ icon?, tone: "ink" | "cream", children })`, `StatTile({ label, value, detail?, trend? })`, `Kbd({ children })`.

- [ ] **Step 1: A teszt (RED).** `app/components/ui-kit.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { render } from "../../lib/test/render.ts";

const { EmptyState } = await import("./empty-state.tsx");
const { StatTile } = await import("./stat-tile.tsx");
const { Kbd } = await import("./kbd.tsx");

// 2a spec D8. Kills an empty state that isn't one dashed box with its text, a stat tile without its label and
// value, and a key badge that isn't a <kbd>.
test("the three small kit pieces render their one job each", () => {
  const empty = render(createElement(EmptyState, { tone: "ink" }, "Nothing here"));
  assert.match(empty.body.firstElementChild?.className ?? "", /border-dashed/);
  assert.match(empty.body.textContent ?? "", /Nothing here/);
  const tile = render(createElement(StatTile, { label: "Weekly progress", value: "42%", detail: "5 / 12" }));
  assert.match(tile.body.textContent ?? "", /Weekly progress.*42%.*5 \/ 12/s);
  const kbd = render(createElement(Kbd, null, "⌘K"));
  assert.equal(kbd.body.firstElementChild?.tagName, "KBD");
});
```

Futtatás → FAIL.

- [ ] **Step 2: A komponensek.**

```tsx
// app/components/empty-state.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** An empty view says what to do next (2a spec D8): one dashed box, its icon, a sentence, an optional link. */
export function EmptyState({ icon: Icon, tone, children }: { icon?: LucideIcon; tone: "ink" | "cream"; children: ReactNode }) {
  const frame = tone === "ink" ? "border-paper/35 text-paper/60" : "border-ink/35 text-ink/55";
  return (
    <div className={`flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center font-mono text-sm ${frame}`}>
      {Icon && <Icon className="size-6 text-signal" aria-hidden="true" />}
      <div className="max-w-[75ch]">{children}</div>
    </div>
  );
}
```

```tsx
// app/components/stat-tile.tsx
import type { ReactNode } from "react";

/** One number with its label (2a spec D8): the reader panel's progress now, the dashboard's tiles later. */
export function StatTile({ label, value, detail, children }: { label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs tracking-[0.14em]">{label}</p>
        <span className="font-display text-3xl text-signal">{value}</span>
      </div>
      {children}
      {detail && <p className="mt-3 font-mono text-[11px] text-ink/55">{detail}</p>}
    </section>
  );
}
```

```tsx
// app/components/kbd.tsx
import type { ReactNode } from "react";

/** A key badge: the shortcuts help and the Keresés row's ⌘K. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`border border-current/40 px-1.5 py-0.5 font-mono text-[11px] ${className}`}>{children}</kbd>;
}
```

- [ ] **Step 3: A bekötés.** `digest-dashboard.tsx`: az `EmptyNote` függvény törölve, a három helye `<EmptyState tone="cream">…</EmptyState>`. `library-view.tsx` üres állapota: `<EmptyState tone="ink" icon={BookOpen}><LocalizedText value={copy.empty} /> <a href="#submit" …>…</a></EmptyState>`. `github-view.tsx` és `collection-view.tsx`: a `<p className="font-mono text-sm text-paper/55">` helyett `<EmptyState tone="ink" icon={GitFork | Heart}>`. `reader-panel.tsx`: a haladás `section`-je `<StatTile label={t.progress} value={`${progress}%`} detail={`${readCount} / ${total} · ${syncing ? t.syncing : t.synced}`}><Progress … className="mt-4 …" /></StatTile>`. `shell-dialogs.tsx` és `account-menu.tsx` és `desktop-nav.tsx` `<kbd>` → `<Kbd>`.

- [ ] **Step 4: DESIGN.md.** Empty states szakasz: a két régi kivonat helyett az `EmptyState` kivonata és „one component, two tones”; „Progress bar and the reader panel”: a `reader-panel.tsx` kivonat (757) újramásolva; a `digest-dashboard.tsx` 798. kivonat (az `EmptyNote`) cserélve az `empty-state.tsx`-ére.

- [ ] **Step 5: Futtatás, próba, commit.** PASS; `shell.test.ts`, `github-view.test.ts`, `collection-view.test.ts`, `design-excerpts` PASS. Próba: az `EmptyState` `border-dashed` levéve → bukik.

```bash
git add app/components/empty-state.tsx app/components/stat-tile.tsx app/components/kbd.tsx app/components/ui-kit.test.ts
git commit -m "feat: add the empty state, stat tile and key badge and use them everywhere" -- app .claude/docs/DESIGN.md
```

---

### Task 10: Mozgás: a `motion` könyvtár az értékelés-nyomáson, a toaston és a taiyakin

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`corepack pnpm@11.25.0 add motion@14.0.0 --save-exact`), `app/components/app-shell.tsx` (`MotionConfig`), `app/components/rating-control.tsx`, `app/components/undo-toast.tsx`, `app/components/link-chat.tsx` (`TaiyakiButton`), `app/components/rating-control.test.ts`, `app/components/shell.test.ts`, `lib/client-bundle.test.ts` (ha a csomag-importok listáját pineli), `.claude/docs/DESIGN.md`, `.claude/docs/SECURITY.md` (ha a függőségek számát említi)

- [ ] **Step 1: A függőség.** `corepack pnpm@11.25.0 add motion@14.0.0 --save-exact`. Elvárt: a `package.json`-ban `"motion": "14.0.0"`, a lockfile frissül, a 7 napos kor teljesül (2026-10-02 < 2026-10-04). Ha a pnpm a korhatár miatt visszautasítja, a legújabb 7 napnál idősebb 13.x/14.x verzió jön, és a spec D7 sora frissül.

- [ ] **Step 2: A tesztek (RED).**
  - `rating-control.test.ts`-be:

```ts
// 2a spec D7. Kills a press with no motion wrapper (the spring answers the tap), and one that moves under
// reduced motion: the wrapper's transform is inline, so the static render shows whether it exists.
test("each rating button wraps its icon in a motion span keyed by its press", () => {
  const doc = control({ target: { kind: "item", id: "a" }, initial: null });
  assert.equal(doc.querySelectorAll('[role="group"] button [data-press-motion]').length, 3);
});
```

  (a `control` segéd a fájl meglévő render-segédje.)
  - `shell.test.ts`, a toast tesztje („UndoToast mounts its live region…”): az állítás kiegészül: `assert.equal(doc.querySelector('[role="status"] [data-toast]') !== null, true)` nyitott toastnál, és a `[data-toast]` egy `motion.div`.
  - `shell.test.ts` taiyaki tesztje: `assert.ok(doc.querySelector("button[aria-expanded] [data-taiyaki-icon]"))`.
  Futtatás → FAIL.

- [ ] **Step 3: A kód.**
  - `app-shell.tsx`: `import { MotionConfig } from "motion/react";` és a `LanguageProvider` alatt `<MotionConfig reducedMotion="user">…</MotionConfig>`.
  - `rating-control.tsx`: `import { motion } from "motion/react";` és a gomb belseje:

```tsx
          <motion.span
            data-press-motion
            key={presses}
            initial={false}
            animate={pressedNow ? { scale: [1, 0.88, 1] } : { scale: 1 }}
            transition={{ type: "spring", duration: 0.18, bounce: 0.4 }}
            className="grid place-items-center"
          >
            <Icon className={name === "heart" && value === 2 ? "fill-current" : undefined} />
          </motion.span>
```

  ahol `presses` egy `useState` számláló, amit az `onClick` növel, és `pressedNow` az utoljára nyomott gomb neve (`useState<string | null>`): csak az a gomb rugózik, amelyik kapta a kattintást.
  - `undo-toast.tsx`: a mai `shown`/`animationend` könyvelés helyett `AnimatePresence`: a lista egy elemű, `key={toast.id}`, `motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} data-toast`; az `animate-in/animate-out` osztályok kikerülnek; az `isUndoToast` segéd marad.
  - `link-chat.tsx` `TaiyakiButton`: a `TaiyakiIcon` egy `motion.span data-taiyaki-icon animate={{ rotate: open ? -12 : 0 }} transition={{ type: "spring", duration: 0.25, bounce: 0.3 }}`-ban.
  - Reduced motion: a `MotionConfig reducedMotion="user"` minden transzformációs animációt kikapcsol; az opacitás marad.

- [ ] **Step 4: DESIGN.md.** Elevation & Depth → Motion: új bekezdés: „**The `motion` library** (`motion/react`, `MotionConfig reducedMotion="user"` in the shell) runs the three motions CSS can't: the rating press (a 180ms spring to 0.88 and back, only on the pressed button), the toast's enter and exit (`AnimatePresence`, 160ms), and the taiyaki's turn when its panel opens. Sheets and dialogs keep their Radix 160ms CSS animations. Nothing else animates on its own.” Az `undo-toast.tsx` kivonatok (714, 718) újramásolva.

- [ ] **Step 5: Futtatás, próba, commit.** Az öt ellenőrzés (a build a csomaggal). Próba: a `data-press-motion` levéve → bukik.

```bash
git commit -m "feat: answer the rating press, the toast and the taiyaki with motion, off under reduced motion" -- package.json pnpm-lock.yaml app/components .claude/docs/DESIGN.md
```

---

### Task 11: Doksi, az audit megismétlése, zárás

**Files:**
- Modify: `.claude/docs/DESIGN.md` (egy átnézés: minden szakasz a kész állapotot írja le), `.claude/CLAUDE.md` (App shell: `createShellLayers`, `AccountMenu`, `CardToolbar`; Auth), `README.md` (Codemap: az új komponensek), `.claude/docs/ARCHITECTURE.md` (Codemap: `account-menu`, `card-toolbar`, `empty-state`, `stat-tile`, `kbd`), `.claude/docs/TODO.md`

- [ ] **Step 1: Doksi.** ARCHITECTURE Codemap `app/components/` listája: „the ratings… ; the kit: `card-toolbar`, `account-menu`, `empty-state`, `stat-tile`, `kbd`”. README Codemap sora ugyanígy. CLAUDE.md App shell: a layers, a fiók-menü, a toolbar egy-egy mondata; a „Keyboard” szakasz `o` sora: „the source link in the card's meta row”. TODO.md: a „Kész” alá a 2a sora (a spec és a terv linkjével), a „Következő lépések” elejére a kiadás sora (`visual-review` PR a `codebase-order` után, migráció nincs, élő próba: fiók-menü, kilépés → landing, a kártya egy telefonon), és a 2b (keresés) mint következő spec.

- [ ] **Step 2: Az audit megismétlése** (Playwright az előnézeten, `rm -rf .next/cache/turbopack`, `npm run dev`): ugyanaz a mérő-szkript, mint a 2a auditban, 360/768/1280/1680-on, `radar`, `companies`, `library`, `post`, `github`, `collection`, `archive`, `/about`, `/login`: nincs 11 px alatti szöveg (`textUnder11px: 0`, kivéve a `.signal-grid::after`); a `h1`-ek nem törnek szó közben 768-tól (a `getClientRects()` sorainak száma = a szavak száma vagy kevesebb); a hírkártya sora 360-on két sorba tördel és a `[data-card-toolbar]` egy sorban van; a másodlagos hero magassága ≤ 300 px 1280-on; nincs vízszintes görgetés; `prefers-reduced-motion: reduce` emulációval (`page.emulateMedia`) az értékelés-nyomás után a gomb `transform`-ja `none`; a Radar panel gombjára kattintva a chat zárva marad és fordítva. Képernyőkép a Radarról és a Libraryről 1280-on, egy pillantással ellenőrizve.

- [ ] **Step 3: Az öt ellenőrzés, commit.**

```bash
git commit -m "docs: describe the card toolbar, the account menu, the motion and the layout in the guides" -- .claude README.md
```

---

## Önellenőrzés

1. **Spec-lefedettség:** D1 → T2; D2 → T4; D3 → T1; D4 → T3; D5 → T7; D6 → T8; D7 → T10; D8 → T2 (CardToolbar), T7 (AccountMenu), T9 (EmptyState, StatTile, Kbd); D9 (R3) → T4 (§1 hero telefonon), T5 (§1 alacsony képernyő, §2, §3), T6 (§4); D10 → nincs feladat (kizárt); L10 → T5; L11 → T1; L12 → T9.
2. **Placeholder:** nincs „TBD”; minden komponens kódja a saját feladatában; a motion verziója rögzítve.
3. **Típusok:** `CardToolbar` propjai T2-ben és a T2 4. lépésében egyeznek; `createShellLayers` metódusai T6 1. és 2. lépésében egyeznek; `AccountRows({ email, onHelp })` T7-ben és a sheet bekötésében; `EmptyState({ icon?, tone, children })` T9-ben mindenütt; `PublicPage` `notice?: Localized` T8-ban.
4. **Review Focus:** 1 → T3 teszt; 2 → T2 teszt; 3 → T4 teszt + T11; 4 → T8 teszt; 5 → T10 `MotionConfig` + T11 Playwright.
