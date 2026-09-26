---
version: alpha
name: NEON NEWS RADAR
description: Hard-cornered newsprint brutalism for a private, bilingual AI-research hub. Ink, paper and one signal orange, system fonts only, and offset shadows with no blur.
colors:
  ink: "#141414"
  paper: "#fbefca"
  cream: "#f8e8b4"
  signal: "#f15f22"
  cyan: "#59e1e8"
  background: "#fbefca"
  foreground: "#141414"
  card: "#fbefca"
  card-foreground: "#141414"
  popover: "#fbefca"
  popover-foreground: "#141414"
  primary: "#141414"
  primary-foreground: "#fbefca"
  secondary: "#f15f22"
  secondary-foreground: "#141414"
  muted: "#e8d9aa"
  muted-foreground: "#6b6252"
  accent: "#f15f22"
  accent-foreground: "#141414"
  destructive: "#c7352a"
  border: "#141414"
  input: "#141414"
  ring: "#f15f22"
  sidebar: "#141414"
  sidebar-foreground: "#fbefca"
  sidebar-primary: "#f15f22"
  sidebar-primary-foreground: "#141414"
  sidebar-accent: "#292929"
  sidebar-accent-foreground: "#fbefca"
  sidebar-border: "#fbefca2b"
  sidebar-ring: "#f15f22"
typography:
  display-hero:
    fontFamily: Arial Black, Impact, Haettenschweiler, sans-serif
    fontSize: 2.6rem # the floor of clamp(2.6rem, 11vw, 8.8rem) in PageHero
    fontWeight: 900
    lineHeight: 0.78
    letterSpacing: -0.07em
  display-title:
    fontFamily: Arial Black, Impact, Haettenschweiler, sans-serif
    fontSize: 1.9rem # the floor of clamp(1.9rem, 6vw, 4.6rem), the post page title
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: -0.05em
  display-card:
    fontFamily: Arial Black, Impact, Haettenschweiler, sans-serif
    fontSize: 1.5rem # text-2xl on a must-card; clamp(1.5rem, 3vw, 2.6rem) on a story card
    fontWeight: 900
    lineHeight: 1.02
  body:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.75rem
  body-post:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.7
  lead:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.75rem
  eyebrow:
    fontFamily: '"Courier New", Courier, ui-monospace, monospace'
    fontSize: 0.75rem
    fontWeight: 400
    letterSpacing: 0.2em
  label:
    fontFamily: '"Courier New", Courier, ui-monospace, monospace'
    fontSize: 10px
    fontWeight: 400
    letterSpacing: 0.15em
  control:
    fontFamily: '"Courier New", Courier, ui-monospace, monospace'
    fontSize: 0.75rem
    fontWeight: 500
rounded:
  none: 0px
  full: 999px # rounded-full compiles to calc(infinity * 1px); .live-pulse uses 999px. Both draw the same pill.
spacing:
  gutter: 16px
  gutter-radar: 28px
  gutter-page: 40px
  card: 20px
  card-roomy: 24px
  frame: 8px
  touch: 40px
components: # padding is CSS shorthand (block inline) on tag, page-hero and nav-tooltip, where the spec's single Dimension can't express it
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: 40px
  button-ink-hover:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: 40px
  button-signal-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-brutal:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    height: 40px
  button-brutal-hover:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
  tag:
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: 4px 8px
  story-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.card}"
  must-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.card}"
  page-hero:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    typography: "{typography.display-hero}"
    padding: 40px 16px
  status-card:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    padding: 28px
    width: 448px
  image-frame:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "{spacing.frame}"
  undo-toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    height: 48px
  undo-toast-failed:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
  nav-tooltip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: 4px 8px
  sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    width: 256px
  sidebar-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    width: 56px
  bottom-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: 64px
---

# DESIGN.md

## Overview

NEON NEWS RADAR looks like a hard-cornered broadsheet: ink on paper, one signal orange, and everything drawn with 2px ink rules and flat offset shadows. The type is heavy black display over plain sans body text, with monospace labels. The design language is deliberate, so don't erode it.

- `app/globals.css` is the whole theme: Tailwind 4, CSS-first, with no `tailwind.config`. It imports `tailwindcss`, `tw-animate-css` and the vendored shadcn utility pack in `vendor/`.
- Five brand tokens (`--ink`, `--paper`, `--cream`, `--signal` and `--cyan`) sit in `:root`, and the full shadcn token set is remapped onto them. `@theme inline` exposes them as Tailwind colours (`bg-ink`, `text-signal`, `border-paper/15`). The front matter above equals `:root` value for value, and `lib/design-tokens.test.ts` fails when the two drift apart.
- **One fixed theme.** There is no `.dark` block, no `prefers-color-scheme` and no `next-themes`. The contrast is spatial:
  - `html` is ink and `body` is paper;
  - the navigation, the Library and the Archive are ink surfaces;
  - the Radar's content column, the title bands (`PageHero`), the post page, the sheets and the dialogs are cream;
  - cards on cream are paper.

### Principles

1. **Structure is information.** Every rule and frame says something:
   - a 2px ink frame is one thing you can act on;
   - a dashed frame means missing or empty;
   - a 4px signal bar on the left is the editorial voice ("why it matters", key points, quotes);
   - a mono eyebrow names the section in both languages.
2. **One accent, spent on meaning.** Signal marks what is active, hovered, focused, ranked or failed, and the `//` that closes a title. It is never decoration.
3. **Flat and hard.** There's no radius and no blur. Gradients appear only in `.signal-grid`, which draws the Radar hero's grid lines and fades them in.
4. **Dense, but capped.** Meta is small mono, titles are big display, and reading text stops at 75ch.
5. **Motion answers the reader.** Hovers, the must-card lift, the sheets and the toast all react to an action. Page content has no entrance animations, and reduced motion is respected.
6. **Bilingual by construction.** Every label has a Hungarian and an English string, and every heading survives a long Hungarian compound at 360px.

### Deliberate brand choices

Anthropic's frontend-design skill lists several of this app's core traits as the commonest tells of generated design. Here they are the brand, chosen on purpose. Don't "fix" them because generic design advice says so. The skill itself says that where the brief pins down a visual direction, the brief wins, and this file is the brief.

- **The cream and paper background** (`#fbefca`, `#f8e8b4`), with near-black ink (`#141414`) instead of pure black and a single bright signal accent.
- **Zero border-radius, 2px rules and broadsheet columns.** These are the newsprint look.
- **ALL-CAPS mono eyebrows over headings** (`MIRRORED SOURCES / KÖNYVTÁR`, `TOP 3 · KÖTELEZŐ`), mono data labels (`SCORE`, `12 MIN`, `3 / 12 · SYNCED`), and meta joined with middle dots.
- **A `→` on links and buttons** (`Sign out →`, `Irány a Radar →`), a signal `//` after every display title, and RADAR in signal in the wordmark.
- **01 / 02 / 03 numerals.** These encode real sequences: the Top 3 are ranked by score, the GitHub top 10 is ranked, and the archive numbers its closed weeks newest first. Use numerals only where the content really is a sequence.
- **Hover feedback on every card.** A card is the unit you act on, so it answers the pointer.

## Colors

The roles of the brand tokens:

| Token | Hex | Role |
| --- | --- | --- |
| ink | `#141414` | text, every 2px border, most offset shadows; the dark surfaces: the navigation, the Library and Archive pages, code blocks, the undo toast, the Radar hero |
| paper | `#fbefca` | the body background; the card surface (story, must-read, repo, image frame, form cards); light text on ink |
| cream | `#f8e8b4` | the working surface: the Radar column with its header and chip bar, `PageHero`, `StatusCard`, the post article, sheets and dialogs |
| signal | `#f15f22` | the one accent: the `//` after titles, eyebrows, source labels and inline links, the active nav entry, the focus outline, the hover state (an 8px signal shadow, or a card that turns signal), the rank numerals, the progress bar, the live dot, the failed toast, the pressed chip |
| cyan | `#59e1e8` | rare: only the Library's PROCESSING status and the `/// DAILY 07:00 → SUN FREEZE` caption on the Radar hero grid |

The remapped shadcn tokens:

- `background`, `card` and `popover` are paper; `foreground`, `primary`, `border` and `input` are ink.
- `secondary`, `accent`, `ring` and `sidebar-primary` are signal. As a result, a stock class such as `bg-accent` paints signal orange, which is why `skeleton.tsx` departs from upstream (CLAUDE.md → Hand-authored components).
- `muted` is `#e8d9aa`, `muted-foreground` is `#6b6252` and `destructive` is `#c7352a`. They are only reached through vendored components, and no app code uses them directly.
- The `sidebar-*` tokens serve the vendored shadcn sidebar, which the app no longer renders.

Secondary text is ink or paper at an opacity (`text-ink/55` to `/72`, `text-paper/45` to `/70`), and hairlines on ink are `border-paper/15` to `/30`. Three colour literals live outside `:root`: the `bg-[#1c1c1c]` of the Library and Archive cards on ink, `themeColor: "#141414"` (ink) in `app/layout.tsx`, which paints the mobile browser chrome, and `rgb(241 95 34 / …)` (signal at an opacity) in the `.live-pulse` ring in `globals.css`.

**Contrast** (WCAG ratios, computed from the tokens):

| Pair | Ratio | Where |
| --- | --- | --- |
| ink on paper / cream | 16.1 / 15.1 | all body text |
| signal on ink, ink on signal | 5.6 | nav, hover states, the failed toast, signal buttons |
| cyan on ink | 11.7 | the PROCESSING status |
| `text-ink/72` on paper | 6.9 | card summaries |
| `text-paper/55` on ink | 5.5 | secondary text on ink |
| `text-paper/45` on ink / on `#1c1c1c` | 4.1 / 4.0 | the Library's error line, the ⌘K hint |
| `text-ink/55` on paper | 3.9 | 10px meta labels, empty notes |
| signal on paper / cream | 2.86 / 2.69 | large text / non-text only: the `//`, the rank numerals, rules, the focus outline. Today it also sets eyebrows, source labels and inline post links, which is the known gap |

WCAG AA asks 4.5:1 of small text, and 3:1 of large text and of non-text UI. The last three rows miss the first bar. `text-paper/45` and `text-ink/55` still clear 3:1, so they suit large or incidental text. Signal on a light surface sits just under 3:1 as well, so it is meant for large text and non-text marks only. Its small-text uses are the gap tracked in TODO.md (a brand decision: a darker signal for small text, or large and decorative use only). An inline link at least carries an underline, but a label does not.

## Typography

System fonts only, with no webfonts:

| Role | Class | Stack | Carries |
| --- | --- | --- | --- |
| Display | `.font-display` (weight 900) | `Arial Black, Impact, Haettenschweiler, sans-serif` | headings, card titles, the wordmark, numerals |
| Body | `body`, `--font-sans` | `Arial, Helvetica, sans-serif` | running text, summaries, leads |
| Mono | `.font-mono`, `--font-mono` | `"Courier New", Courier, ui-monospace, monospace` | eyebrows, labels, buttons, chips, meta, code |

Display headings tighten both leading and tracking as they grow (`leading-[0.78]` with `tracking-[-0.07em]` at hero size), and they break anywhere (`[overflow-wrap:anywhere]`), so a long Hungarian compound never overflows 360px. The type tokens in the front matter give the floors of the fluid sizes.

**The scale in use:**

| Step | Size | Leading / tracking | Where |
| --- | --- | --- | --- |
| Hero | `clamp(2.6rem, 11vw, 8.8rem)` | 0.78 / -0.07em | `PageHero` |
| Radar hero | `clamp(2.6rem, 15cqi, 8rem)` | 0.77 / -0.07em | `AI WEEKLY//` |
| Post title | `clamp(1.9rem, 6vw, 4.6rem)` | 0.95 / -0.05em | the post page |
| Story title | `clamp(1.5rem, 3vw, 2.6rem)` | 0.98 / `tracking-tight` | story card |
| Numerals | `text-5xl` (48px) | none | the rank numerals, and the archive card's index and week |
| Status title | `text-4xl`, then `sm:text-5xl` | 0.9 / -0.04em | `StatusCard` |
| Card title | `text-2xl` (Library: `sm:text-3xl`) | 1.02 | must-card, Library card |
| Post headings | h2 `text-2xl sm:text-3xl`, h3 `text-xl sm:text-2xl`, h4 `text-lg sm:text-xl` | 1.05 / `tracking-tight` | post blocks |
| Lead | `text-lg` (18px) | `leading-7`, `leading-8` on the post summary | hero lead, post summary |
| Post body | `text-[17px]` | 1.7 | post blocks |
| Card body | `text-base` (16px) | `leading-7` | story summaries |
| Small body | `text-sm` (14px) | `leading-6` | "why it matters", dialog text |
| Eyebrow | `text-xs` (12px), mono | `tracking-[0.2em]` | `PageHero`, `StatusCard` (the Radar header's is 10px) |
| Control | `text-xs`, mono | none | buttons, chips, the toast |
| Label | `text-[11px]` / `text-[10px]`, mono | `tracking-[0.12em]` / `[0.15em]` | source labels, "why it matters", meta, tags |

## Layout

- **360px first.** Everything must fit a 360px viewport with no horizontal scroll.
- **Display sizes are fluid.** Headings use `clamp(2.6rem, 11vw, …)` or a smaller floor (the scale above). Only the Radar hero scales with its container (`cqi`); moving `PageHero` to `cqi` too is tracked in TODO.md.
- **Container queries, not `vw`.** Layout widths inside the main column use container queries (`@container`, `cqi`, `@3xl:`), because the desktop nav and the panel make that column far narrower than the viewport. `PageHero` switches to two columns at `@4xl`, the must-read grid at `@3xl`, and the GitHub list at `@2xl`.
- **Navigation by width.**
  - Below `md` the app shell shows a fixed, five-slot bottom bar that honours `env(safe-area-inset-bottom)`, and the content column has matching bottom padding.
  - From `md` up, the desktop nav takes its place: a 256px sidebar (`w-64`) or a 56px icon rail (`w-14`).
  - The Radar's categories are a sticky chip bar at every width.
- **The progress and to-do panel** is a bottom Sheet below `md`, a right Sheet from `md` to `2xl`, and a 330px column from `2xl`. It is non-modal, so the undo toast stays usable while it is open.
- **Touch targets are at least 40px** (`min-h-10`, or `size-10 sm:size-8` for icon buttons, which may shrink to 32px from `sm` up).
- **Use `dvh`, not `vh`.**
- **Hover styles only for pointers.** Custom `:hover` effects in `globals.css` sit inside `@media (hover: hover)`, because touch screens keep `:hover` after a tap. Tailwind's `hover:` variant already does this.
- **Widths.** Page content is capped at `max-w-6xl`, post text blocks at `max-w-[75ch]`, card text at `max-w-3xl` and leads at `max-w-2xl`. Images, code and video take the full column.
- **Gutters.** `px-4` (16px) everywhere at 360px. From `sm` it is `px-7` in the Radar (its main column widens to `px-10` from `lg`) and `px-10` on the other pages.
- **Rhythm.** Radar sections are `mt-9` apart, each opening with a `SectionLabel` (a signal icon square and a mono title over a 2px ink rule). Feed cards are `space-y-4`, the must-read grid is `gap-4`, and the Library grid is `gap-5`.

**Alignment.**

- Everything is left-aligned and ragged-right: headings, body, meta. Nothing is justified.
- Centring is kept for a few things: a lone card (`StatusCard` on ink), empty-state notes, the bottom bar's slots, the rail's icons and the toast lane.
- Secondary actions go to the right edge: the Radar header's panel pill, a card's Read button (`ml-auto`), the post page's Original link, and the hero's weekly-close block from `lg`.

**Desktop, the Radar at `md` and up** (at `2xl` the panel becomes a 330px column on the right):

```text
+-----------+----------------------------------------------------+
| (o) NEON  | * LIVE ISSUE  2026 / W39             [ 42% · 2 ]   |  header, sticky, cream
|     NEWS  +----------------------------------------------------+
|     RADAR | [Current radar] [Local LLM Lab] [Research] ...     |  chip bar, sticky
+-----------+  +----------------------------------------------+  |
| # Radar   |  | AI WEEKLY//                    Weekly close  |  |  hero, ink
|   Library |  +----------------------------------------------+  |
|   Search  |  TOP 3 · MUST READ                                 |
|   Archive |  +-01-----------+ +-02-----------+ +-03-----------+|  @3xl: three across
|   (soon)  |  +--------------+ +--------------+ +--------------+|
+-----------+  THE WEEK'S LIVE SIGNAL                            |
| HU    ?   |  +meta+-----------------------------------------+  |  story cards
| user    > |  +----+-----------------------------------------+  |
| << Coll.  |                                                    |
+-----------+----------------------------------------------------+
  w-64 ink   cream content column (@container)
```

In the rail, the ink column shrinks to `w-14`: only the icons stay, each with its tooltip.

**Mobile, below `md`:**

```text
+------------------------------+
| * LIVE ISSUE 2026 / W39 [42%]|  header, sticky
| [Current radar] [Local L... >|  chip bar, scrolls sideways
|                              |
|  AI WEEKLY//                 |  hero, ink
|  TOP 3 · MUST READ           |
|  +-01---------------------+  |  one column
|  +------------------------+  |
|  +-- story card ----------+  |
|                              |
|   [ Marked read    UNDO ]    |  toast lane, above the bar
+------------------------------+
| Radar Libr. Search Arch. More|  bottom bar, 5 x 64px, ink
+------------------------------+
```

## Elevation & Depth

Shadows are hard offsets with zero blur:

| Element | Rest | Hover |
| --- | --- | --- |
| must-card, repo block | `5px 5px 0 var(--ink)` | `8px 8px 0 var(--signal)` |
| story-card | none | `-6px 0 0 var(--signal)`, a signal bar on its left edge |
| `StatusCard`, shell dialogs | `8px 8px 0 var(--signal)` | none |
| progress card, submit form | `6px 6px 0 var(--ink)` | none |
| undo toast | `5px 5px 0 var(--signal)` (failed: `var(--ink)`) | none |
| image frame | `4px 4px 0 var(--ink)` | none |
| nav tooltip | `3px 3px 0 var(--ink)` | none |

- **Motion.** The transitions in `globals.css` (the must-card and story-card lifts) run 160ms `ease`. Tailwind's `transition*` utilities (buttons, list cards, the repo block, tooltips, the sheet close button) run at Tailwind's default of 150ms `cubic-bezier(0.4, 0, 0.2, 1)`. `prefers-reduced-motion: reduce` cuts every animation to 0.01ms and turns off smooth scrolling, and j/k card scrolling jumps instead of gliding. The `.live-pulse` dot (9px, signal) pulses a ring every 2s.
- **Layering.** From bottom to top:
  - the chip bar, `z-10`, sticky under the header;
  - the Radar header, `z-20`;
  - the desktop aside, `z-30`, so the rail's tooltips paint over both of those;
  - the mobile bottom bar, `z-40`;
  - sheets, dialogs and their `bg-black/50` overlays, `z-50`;
  - the undo toast lane, `z-[60]`.
- **Known exceptions:** the vendored Sheet keeps shadcn's blurred `shadow-lg`. `Input`, `Textarea` and `Checkbox` keep `shadow-xs`, and so does the `outline` Button variant, which the Radar's progress pill uses. House components never add a blurred shadow. The fix for these, and for the checkbox corners (Shapes), is tracked in TODO.md.

## Shapes

- **Radius is 0.** `--radius` (`0rem` in `:root`) and `--radius-sm/md/lg/xl` (`0` in `@theme inline`) are all zero. This is why stock shadcn files can be dropped in unmodified: `rounded-sm`, `rounded-md`, `rounded-lg` and `rounded-xl` compile to zero.
- **Not everything is neutralized.** `rounded-xs`, `rounded-2xl` to `4xl` and arbitrary `rounded-[…]` values keep their radius. Today that means the vendored `Checkbox` (`rounded-[4px]`), so the reader panel's to-do checkboxes have 4px corners.
- **`rounded-full` is not neutralized, and it is used on purpose:** for the logo badge in the desktop nav, the language toggle (both the pill and the round rail button), and the progress pill that opens the Radar's panel. The live dot draws its circle with `border-radius: 999px` in `.live-pulse`.
- **Rules.** A 2px ink border (`border-2 border-ink`) is the default frame. Tags and meta chips use 1px. A dashed border means "missing or empty": an unavailable image, an empty view, the hidden-blocks link. A 4px signal bar on the left (`border-l-4 border-signal`) marks quotes, "why it matters" and key points.
- **Texture.** `.signal-grid` draws a 34px paper grid at 12% opacity over the ink Radar hero, masked in from the left.

## Components

Use these instead of repeating class lists. Every excerpt below is copied verbatim from the file named on its fence, and `lib/design-excerpts.test.ts` fails when one no longer matches its source: re-copy the excerpt whenever you change the code it quotes.

### Page shell

`app/components/app-shell.tsx` wraps every signed-in page. The desktop nav lays out the page beside itself, the page gets room for the fixed bottom bar, and the dialogs and the toast are mounted once:

```tsx app/components/app-shell.tsx
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
```

Each page then sets its own surface. The Radar uses `<div className="min-w-0 bg-cream text-ink">` (`digest-dashboard.tsx`), and the Library and Archive use `<main className="min-h-dvh bg-ink text-paper">`.

### Sidebar and rail

`app/components/desktop-nav.tsx` and `nav-parts.tsx`:

- **The column:** ink, sticky and full height, with a `border-paper/15` right rule. At the top sit the round signal logo badge and the stacked NEON / NEWS / RADAR wordmark, with RADAR in signal.
- **Entries:** 40px mono rows. The active one gets a 2px signal left border, a `bg-signal/10` wash and signal text. The coming views are listed at 40% opacity with a "soon" label.
- **The rail:** only the icons stay. Each one shows its name in a `NavTooltip` on hover and on keyboard focus. The rail's nav has no overflow, because a scroll container would clip the tooltips. On viewports under 32rem tall, the whole aside scrolls instead.

```tsx app/components/desktop-nav.tsx
className={`sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-paper/15 bg-ink text-paper [@media(max-height:32rem)]:overflow-y-auto [@media(max-height:32rem)]:overflow-x-hidden md:flex ${rail ? "w-14" : "w-64"}`}
```

```tsx app/components/desktop-nav.tsx
const itemClassFull =
  "focus-ring flex min-h-10 w-full items-center gap-3 border-l-2 border-transparent px-3 font-mono text-sm text-paper/70 hover:bg-paper/5 hover:text-paper aria-[current=page]:border-signal aria-[current=page]:bg-signal/10 aria-[current=page]:text-signal";
```

The tooltip (`NavTooltip`):

```tsx app/components/nav-parts.tsx
className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap border-2 border-ink bg-paper px-2 py-1 font-mono text-xs text-ink opacity-0 shadow-[3px_3px_0_var(--ink)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
```

### Bottom bar and the "Több" sheet

Below `md`, `app-shell.tsx` shows an ink bar with a 2px signal top rule and five 64px slots. The active slot, or the open "Több", turns signal:

```tsx app/components/app-shell.tsx
className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-signal bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
```

```tsx app/components/app-shell.tsx
const slotClass =
  "focus-ring flex min-h-16 flex-col items-center justify-center gap-1 font-mono text-[10px] aria-[current=page]:text-signal data-[state=open]:text-signal";
```

"Több" is a cream bottom Sheet holding a display title with its `//`, the language row, the coming views and the account row:

```tsx app/components/app-shell.tsx
        <SheetContent
          side="bottom"
          closeLabel={t.close}
          className="max-h-[85dvh] gap-5 overflow-y-auto border-t-2 border-ink bg-cream p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] text-ink"
        >
```

The Sheet's close button, and the one in dialogs, is a 40px square with a 2px ink border, paper turning signal on hover (`components/ui/sheet.tsx`, `dialog.tsx`). Shell dialogs are cream, with a signal shadow: `className="border-2 border-ink bg-cream text-ink shadow-[8px_8px_0_var(--signal)]"` (`shell-dialogs.tsx`).

### `PageHero` and `StatusCard`

`app/components/page-header.tsx`. `PageHero` is the cream title band of the secondary pages. It has a signal mono eyebrow, a display title ending in a signal `//`, and an optional side panel that moves beside the text at `@4xl`:

```tsx app/components/page-header.tsx
    <section className="@container border-b-2 border-signal bg-cream px-4 py-10 text-ink sm:px-10 sm:py-16">
      <div className={`mx-auto max-w-6xl ${aside ? "grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)] @4xl:items-end" : ""}`}>
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,11vw,8.8rem)] leading-[0.78] tracking-[-0.07em] [overflow-wrap:anywhere]">
            {title}
            <span className="text-signal">{"//"}</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">{lead}</p>
        </div>
        {aside}
      </div>
    </section>
```

In use (`app/(app)/library/library-view.tsx`):

```tsx app/(app)/library/library-view.tsx
<PageHero eyebrow="MIRRORED SOURCES / KÖNYVTÁR" title="LIBRARY" lead={<LocalizedText value={copy.lead} />} aside={<SubmitForm preview={preview} />} />
```

`StatusCard` is a lone cream card on ink, with an optional wordmark (`brand`). It is used for sign-in, error and not-found, the pages outside the app shell:

```tsx app/components/page-header.tsx
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-paper">
      <section className="w-full max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">
```

### `Button`

`components/ui/button.tsx` keeps the stock shadcn variants and adds three house variants and an extended size set:

```tsx components/ui/button.tsx
        // House variants. rounded-* is already 0 through --radius, so no rounded-none needed.
        ink: "bg-ink font-mono text-xs text-paper hover:bg-signal hover:text-ink",
        signal: "border-2 border-ink bg-signal font-mono text-xs text-ink hover:bg-ink hover:text-paper",
        brutal: "border-2 border-ink bg-paper font-mono text-xs text-ink hover:bg-signal",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
```

The stock heights are under 40px, so every call site adds `min-h-10` or `size-10`, as the story card's Open link does, and a toggle shows its pressed state in ink (both from `story-card.tsx`):

```tsx app/components/story-card.tsx
<Button asChild variant="ink" className="min-h-10">
```

```tsx app/components/story-card.tsx
const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";
```

### `focus-ring`

The keyboard focus style, defined as an `@utility` in `app/globals.css`:

```css app/globals.css
@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--focus, var(--signal));
    outline-offset: 2px;
  }
}
```

Every custom interactive element carries it. On a signal-coloured control, override the colour with `--focus`, as the category chips do (`digest-dashboard.tsx`):

```tsx app/components/digest-dashboard.tsx
className="focus-ring [--focus:var(--ink)] flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-3 font-mono text-xs aria-pressed:bg-signal"
```

`Button` and `Input` keep shadcn's own 3px `ring/50` focus ring.

### `Tag`

`app/components/tag.tsx`. The border follows the text colour, so a tag works on paper, cream and ink alike:

```tsx app/components/tag.tsx
export function Tag({ tag }: { tag: string }) {
  return <span className="border border-current/30 px-2 py-1 font-mono text-[10px]">#{tag}</span>;
}
```

### must-card and story-card

`app/components/story-card.tsx` renders them, and `app/globals.css` gives them their lift. Both lifts run 160ms, and only on pointer devices:

```css app/globals.css
.must-card { box-shadow: 5px 5px 0 var(--ink); transition: transform 160ms ease, box-shadow 160ms ease; }
.must-card h2 { overflow-wrap: anywhere; hyphens: auto; }
.story-card { transition: opacity 160ms ease, transform 160ms ease, box-shadow 160ms ease; }
/* Touch screens keep :hover after a tap, which would leave cards shifted. */
@media (hover: hover) {
  .must-card:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 var(--signal); }
  .story-card:hover { transform: translateX(3px); box-shadow: -6px 0 0 var(--signal); }
}
.story-read { opacity: 0.58; }
```

```tsx app/components/story-card.tsx
className={`focus-ring must-card border-2 border-ink bg-paper p-5 ${state.read ? "story-read" : ""}`}
```

```tsx app/components/story-card.tsx
<span className="font-display text-5xl text-signal">{String(rank).padStart(2, "0")}</span>
```

```tsx app/components/story-card.tsx
className={`focus-ring story-card border-2 border-ink bg-paper p-5 sm:p-6 ${state.read ? "story-read" : ""}`}
```

- **must-card** shows a rank numeral (`01` to `03`), a `score/100` chip and a `text-2xl` title. The Top 3 sit side by side from `@3xl` (`grid gap-4 @3xl:grid-cols-3`) and are aligned: the old stagger (`nth-child` offsets) was removed on 2026-09-26.
- **story-card** has a 96px meta gutter from `lg`, and one row of actions at the bottom: Open (`ink`), Later and to-do (`brutal` icons), and Read on the right.
- **Both** dim to 58% once read, and take focus for j/k (`tabIndex={-1}` plus `focus-ring`).

### Image frame

`ImageFrame` in `app/components/post-blocks.tsx` is the one place the post image frame is defined. The caption goes inside the frame, and the "image unavailable" box is the same frame with a dashed border:

```tsx app/components/post-blocks.tsx
const imageFrameClass = "border-2 border-ink bg-paper p-2 shadow-[4px_4px_0_var(--ink)]";

function ImageFrame({ dashed = false, caption, children }: { dashed?: boolean; caption?: string; children: ReactNode }) {
  return (
    <figure className={`${imageFrameClass} ${dashed ? "border-dashed" : ""}`}>
      {children}
      {caption && <figcaption className="mt-2 font-mono text-xs leading-5 text-ink/60">{caption}</figcaption>}
    </figure>
  );
}
```

`PostImage` (`app/components/post-image.tsx`) keeps a small mirror at its own size and never stretches it. A blurred placeholder sits behind the image until it loads:

```tsx app/components/post-image.tsx
className="relative mx-auto block h-auto max-h-[80dvh] max-w-full object-contain"
```

### Undo toast

`app/components/undo-toast.tsx`. There is one fixed lane, above the bottom bar below `md` and 1.5rem from the bottom from `md` up. It is `z-[60]`, so it sits over open sheets. A failed write turns the toast signal:

```tsx app/components/undo-toast.tsx
className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-[60] flex justify-center md:bottom-6"
```

```tsx app/components/undo-toast.tsx
          className={`pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 border-2 border-ink px-4 py-1 font-mono text-xs ${
            toast.kind === "failed" ? "bg-signal text-ink shadow-[5px_5px_0_var(--ink)]" : "bg-ink text-paper shadow-[5px_5px_0_var(--signal)]"
          }`}
```

Raise one from any event handler (`digest-dashboard.tsx`). The Undo button uses the `signal` variant:

```tsx app/components/digest-dashboard.tsx
toasts.show({ kind: "markedRead", undo: () => store.setFlag(item.id, "read", false) });
```

### Progress bar and the reader panel

`app/components/reader-panel.tsx`:

```tsx app/components/reader-panel.tsx
      <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.14em]">{t.progress}</p>
          <span className="font-display text-3xl text-signal">{progress}%</span>
        </div>
        <Progress value={progress} aria-label={t.progress} className="mt-4 h-3 rounded-none bg-ink/15 [&_[data-slot=progress-indicator]]:bg-signal" />
```

- **The to-do list:** a 40px field and a `signal` add button, then rows whose label is the 40px target (the 16px checkbox alone would be too small).
- **Opening it:** below `2xl`, a round outline pill in the Radar header opens the panel. It shows `NN%`, plus the open to-do count in signal.

### Form fields

`Input` and `Textarea` (`components/ui/`) get a 2px ink border and a paper or cream fill at the call site, and usually turn signal on focus:

```tsx app/(app)/library/submit-form.tsx
className="min-h-10 flex-1 border-2 border-ink bg-cream focus-visible:border-signal"
```

That field is from `app/(app)/library/submit-form.tsx`, whose form sits on a paper card:

```tsx app/(app)/library/submit-form.tsx
<form id="submit" onSubmit={submit} className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
```

A multi-line field, from `app/(app)/library/[id]/post-editor.tsx`:

```tsx app/(app)/library/[id]/post-editor.tsx
                <Textarea
                  id={summaryId(lang)}
                  value={summary[lang]}
                  onChange={(e) => setSummary({ ...summary, [lang]: e.target.value })}
                  rows={5}
                  className="border-2 border-ink bg-paper"
```

### Empty states

An empty view says what to do next. On cream (`digest-dashboard.tsx`), a dashed box holds the note and, when a filter is on, a `brutal` "All stories" button:

```tsx app/components/digest-dashboard.tsx
function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="border-2 border-dashed border-ink/35 p-10 text-center font-mono text-sm text-ink/55">{children}</div>;
}
```

On ink (`library-view.tsx`), a mono line is followed by a 40px signal link:

```tsx app/(app)/library/library-view.tsx
          <p className="font-mono text-sm text-paper/55">
            <LocalizedText value={copy.empty} />{" "}
            <a href="#submit" className="focus-ring inline-flex min-h-10 items-center text-signal underline">
              <LocalizedText value={copy.toForm} />
            </a>
          </p>
```

## Do's and Don'ts

Do:

- Use the tokens (`bg-ink`, `text-signal`, `border-paper/15`) and the components above.
- Frame with 2px ink, lift with a hard offset shadow, and end a display title with a signal `//`.
- Give every control a 40px target, use container queries inside the main column, and use `dvh`.
- Keep the brand choices above, even when generic design advice calls them tells.
- Check UI changes on `/dev/preview` (TESTING.md → Test layers).

Don't:

- Don't add a dark theme, `prefers-color-scheme` styles or `next-themes`.
- Don't use webfonts, blurred shadows, gradients outside `.signal-grid`, or rounded corners beyond the `rounded-full` cases above.
- Don't add hex values outside `:root`, or use `bg-accent` as a neutral fill.
- Don't use `vw` for widths inside the main column, `vh` for heights, or a bare `:hover` rule in `globals.css`.
- Don't add numbered markers to content that isn't a sequence.

> ⚠️ **Never run `npx shadcn add` in this repo.** `add sidebar` appends `--sidebar-*` variables and a `.dark` block to `app/globals.css`. They land after the existing `@theme inline`, so they win the cascade and the sidebar renders stock grey. The command would also overwrite `components/ui/button.tsx`, which carries an extended size set (`xs`, `icon-xs`, `icon-sm`, `icon-lg`) and the house variants `ink` / `signal` / `brutal` that the app depends on. And it would install individual `@radix-ui/react-*` packages, although this project deliberately uses the unified `radix-ui`. Instead, fetch read-only with `npx shadcn@4.17.0 view <name>` and place the code by hand.
