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
components:
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

## Colors

The roles of the brand tokens:

- **Ink `#141414`** is for text, every 2px border, most offset shadows, and the dark surfaces: the navigation, the Library and Archive pages, code blocks, the undo toast and the Radar hero. The viewport's `themeColor` in `app/layout.tsx` is the same `#141414`.
- **Paper `#fbefca`** is the body background, the card surface (story, must-read, repo, image frame, form cards) and the light text on ink.
- **Cream `#f8e8b4`** is the working surface: the Radar column and its header and chip bar, `PageHero`, `StatusCard`, the post article, sheets and dialogs.
- **Signal `#f15f22`** is the one accent, used for:
  - the `//` after every display title;
  - eyebrows, source labels and inline links;
  - the active navigation entry and the focus outline;
  - the hover state: an 8px signal shadow, or a card that turns signal;
  - the must-read rank numerals, the progress bar, the live dot, the failed toast and the pressed category chip.
- **Cyan `#59e1e8`** is rare. It appears only in the Library's PROCESSING status and the `/// DAILY 07:00 → SUN FREEZE` caption on the Radar hero grid.

The remapped shadcn tokens:

- `background`, `card` and `popover` are paper; `foreground`, `primary`, `border` and `input` are ink.
- `secondary`, `accent`, `ring` and `sidebar-primary` are signal. As a result, a stock class such as `bg-accent` paints signal orange, which is why `skeleton.tsx` departs from upstream (CLAUDE.md → Hand-authored components).
- `muted` is `#e8d9aa`, `muted-foreground` is `#6b6252` and `destructive` is `#c7352a`. They are only reached through vendored components, and no app code uses them directly.
- The `sidebar-*` tokens serve the vendored shadcn sidebar, which the app no longer renders.

Secondary text is ink or paper at an opacity (`text-ink/55` to `/72`, `text-paper/45` to `/70`), and hairlines on ink are `border-paper/15` to `/30`. One hex lives outside `:root`: the `bg-[#1c1c1c]` of the Library and Archive cards on ink.

**Contrast** (WCAG ratios, computed from the tokens):

| Pair | Ratio | Where |
| --- | --- | --- |
| ink on paper / cream | 16.1 / 15.1 | all body text |
| signal on ink, ink on signal | 5.6 | nav, hover states, the failed toast, signal buttons |
| cyan on ink | 11.7 | the PROCESSING status |
| `text-ink/72` on paper | 6.9 | card summaries |
| `text-paper/55` on ink | 5.5 | secondary text on ink |
| `text-ink/55` on paper | 3.9 | 10px meta labels, empty notes |
| signal on paper / cream | 2.9 / 2.7 | eyebrows, source labels, inline links in posts |

The last two rows are below the 4.5:1 that WCAG AA asks of small text. Signal on a light surface is fine for large display glyphs (the `//`, the rank numerals). For small text it is a known weakness: an inline link at least carries an underline, but a label does not.

## Typography

System fonts only, with no webfonts:

- **Display:** `.font-display` is `Arial Black, Impact, Haettenschweiler, sans-serif` at weight 900. It carries headings, card titles, the wordmark and numerals.
- **Body:** `body` and `--font-sans` are `Arial, Helvetica, sans-serif`.
- **Mono:** `.font-mono` and `--font-mono` are `"Courier New", Courier, ui-monospace, monospace`. It carries eyebrows, labels, buttons, chips and meta.

Display headings tighten both leading and tracking as they grow (`leading-[0.78]` with `tracking-[-0.07em]` at hero size), and they break anywhere (`[overflow-wrap:anywhere]`), so a long Hungarian compound never overflows 360px. The type tokens in the front matter give the floors of the fluid sizes.

## Layout

- **360px first.** Everything must fit a 360px viewport with no horizontal scroll.
- **Display sizes are fluid.** Headings use `clamp(2.6rem, 11vw, …)` or a smaller floor: `PageHero` uses `clamp(2.6rem, 11vw, 8.8rem)`, the post title `clamp(1.9rem, 6vw, 4.6rem)` and the story-card title `clamp(1.5rem, 3vw, 2.6rem)`. Only the Radar hero, `clamp(2.6rem, 15cqi, 8rem)`, scales with its container.
- **Container queries, not `vw`.** Layout widths inside the main column use container queries (`@container`, `cqi`, `@3xl:`), because the desktop nav and the panel make that column far narrower than the viewport. `PageHero` switches to two columns at `@4xl`, the must-read grid at `@3xl`, and the GitHub list at `@2xl`.
- **Navigation by width.**
  - Below `md` the app shell shows a fixed, five-slot bottom bar that honours `env(safe-area-inset-bottom)`, and the content column has matching bottom padding (`pb-[calc(4rem_+_env(safe-area-inset-bottom))] md:pb-0`).
  - From `md` up, the desktop nav takes its place: a 256px sidebar (`w-64`) or a 56px icon rail (`w-14`).
  - The Radar's categories are a sticky chip bar at every width.
- **The progress and to-do panel** is a bottom Sheet below `md`, a right Sheet from `md` to `2xl`, and a 330px column from `2xl`. It is non-modal, so the undo toast stays usable while it is open.
- **Touch targets are at least 40px** (`min-h-10`, or `size-10 sm:size-8` for icon buttons, which may shrink to 32px from `sm` up).
- **Use `dvh`, not `vh`.**
- **Hover styles only for pointers.** Custom `:hover` effects in `globals.css` sit inside `@media (hover: hover)`, because touch screens keep `:hover` after a tap. Tailwind's `hover:` variant already does this.
- **Widths.** Page content is capped at `max-w-6xl`, post text blocks at `max-w-[75ch]`, card text at `max-w-3xl` and leads at `max-w-2xl`. Images, code and video take the full column.
- **Gutters.** `px-4` (16px) everywhere at 360px. From `sm` it is `px-7` in the Radar (its main column widens to `px-10` from `lg`) and `px-10` on the other pages.

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
- **Known exceptions:** the vendored Sheet keeps shadcn's blurred `shadow-lg`, and `Input` and `Textarea` keep `shadow-xs`. House components never add a blurred shadow.

## Shapes

- **Radius is 0.** `--radius` (`0rem` in `:root`) and `--radius-sm/md/lg/xl` (`0` in `@theme inline`) are all zero. This is why stock shadcn files can be dropped in unmodified: `rounded-sm`, `rounded-md`, `rounded-lg` and `rounded-xl` compile to zero.
- **Not everything is neutralized.** `rounded-xs`, `rounded-2xl` to `4xl` and arbitrary `rounded-[…]` values keep their radius. Today that means the vendored `Checkbox` (`rounded-[4px]`), so the reader panel's to-do checkboxes have 4px corners.
- **`rounded-full` is not neutralized, and it is used on purpose:** for the logo badge in the desktop nav, the language toggle (both the pill and the round rail button), and the progress pill that opens the Radar's panel. The live dot draws its circle with `border-radius: 999px` in `.live-pulse`.
- **Rules.** A 2px ink border (`border-2 border-ink`) is the default frame. Tags and meta chips use 1px. A dashed border means "missing or empty": an unavailable image, an empty view, the hidden-blocks link. A 4px signal bar on the left (`border-l-4 border-signal`) marks quotes, "why it matters" and key points.
- **Texture.** `.signal-grid` draws a 34px paper grid at 12% opacity over the ink Radar hero, masked in from the left.

## Components

**Shared controls.** Use them instead of repeating class lists: the `Button` `ink` / `signal` / `brutal` variants, the `focus-ring` utility, `PageHero`, `StatusCard` and `Tag`.

- **`Button`** (`components/ui/button.tsx`). The stock shadcn variants are kept, and three house variants are added:
  - `ink`: ink with paper mono text, turning signal with ink text on hover;
  - `signal`: 2px ink border, signal with ink text, turning ink with paper text on hover;
  - `brutal`: 2px ink border, paper with ink text, turning signal on hover.

  The sizes are `default` (`h-9`), `xs` (`h-6`), `sm` (`h-8`), `lg` (`h-10`), `icon` (`size-9`), `icon-xs` (`size-6`), `icon-sm` (`size-8`) and `icon-lg` (`size-10`). The stock heights are under 40px, so call sites add `min-h-10` or `size-10`. A toggle shows its pressed state with `aria-pressed:bg-ink aria-pressed:text-paper`.
- **`focus-ring`** (`@utility` in `globals.css`): a 2px solid outline at 2px offset, in `var(--focus, var(--signal))`. On a signal-coloured control, override the colour with `[--focus:var(--ink)]`. Every custom interactive element carries it. `Button` and `Input` keep shadcn's own 3px `ring/50` focus ring.
- **`PageHero`** (`app/components/page-header.tsx`): the cream title band of the secondary pages. It has a signal bottom rule, a signal mono eyebrow, a display title ending in a signal `//`, a lead, and an optional side panel that moves beside the text at `@4xl`.
- **`StatusCard`** (same file): a lone cream card on ink, `max-w-md`, with an 8px signal shadow and an optional wordmark. It is used for sign-in, error and not-found, the pages outside the app shell.
- **`Tag`** (`app/components/tag.tsx`): a `#tag` chip, 10px mono, with a 1px border in `current/30`, so it works on paper, cream and ink alike.
- **must-card** (`MustReadCard` in `story-card.tsx`, `.must-card` in `globals.css`): a paper card with a 2px ink border and a `5px 5px 0` ink shadow. On a pointer device, hovering lifts it with `translate(-2px, -2px)` and an `8px 8px 0 var(--signal)` shadow, over 160ms. It shows a rank numeral (`01` to `03`, display 5xl, signal), a `score/100` chip and a text-2xl title. The Top 3 sit side by side from `@3xl` and are aligned: the old stagger (`nth-child` offsets) was removed on 2026-09-26.
- **story-card** (`StoryCard`, `.story-card`): a paper card with a 2px ink border, a 96px meta gutter from `lg`, and one row of actions at the bottom (Open, Later, to-do, and Read on the right). On hover it slides `translateX(3px)` and gets a `-6px 0 0` signal bar, over 160ms. A read card dims to 58% (`.story-read`). Cards take focus for j/k (`tabIndex={-1}` plus `focus-ring`).
- **Category chips** (`digest-dashboard.tsx`): a sticky, horizontally scrolling bar of 40px chips with a 2px ink border on paper, pressed in signal (`aria-pressed:bg-signal`).
- **Undo toast** (`app/components/undo-toast.tsx`): one fixed lane, centred, `max-w-md`, at `bottom: calc(4.75rem + env(safe-area-inset-bottom))` below `md`, which is above the bottom bar, and at `bottom: 1.5rem` from `md`. It is `z-[60]`, so it sits over open sheets. The toast is 48px tall, ink with a 5px signal shadow, and its Undo button uses the `signal` variant. A failed write turns it signal with a 5px ink shadow.
- **App shell** (`app-shell.tsx`, `desktop-nav.tsx`, `nav-parts.tsx`):
  - **Sidebar:** an ink column, sticky and full height, with a `border-paper/15` right rule. At the top sit the round signal logo badge and the stacked NEON / NEWS / RADAR wordmark, with RADAR in signal.
  - **Entries:** 40px mono rows at `text-paper/70`. The active one gets a 2px signal left border, a `bg-signal/10` wash and signal text. The coming views are listed at 40% opacity with a "soon" label.
  - **Rail:** only the icons stay. Each one shows its name in a `NavTooltip` (paper, 2px ink border, 3px ink shadow) on hover and keyboard focus. The rail's nav has no overflow, since a scroll container would clip the tooltips. On viewports under 32rem tall, the whole aside scrolls instead.
  - **Bottom bar** (below `md`): an ink bar with a 2px signal top rule and five 64px slots (icon plus 10px mono label). The active slot, or the open "Több", is signal.
  - **"Több":** a cream bottom Sheet (`max-h-[85dvh]`) with a display title and `//`, the language row, the coming views and the account row.
  - **Close buttons:** in the Sheet and in dialogs, the close button is a 40px square with a 2px ink border, paper turning signal on hover.
- **Image frame** (`ImageFrame` in `post-blocks.tsx`, `PostImage` in `post-image.tsx`): a paper `figure` with a 2px ink border, 8px padding and a `4px 4px 0` ink shadow. The caption goes inside the frame. The "image unavailable" box is the same frame with a dashed border. The image is `object-contain`, `max-h-[80dvh]` and centred, and it is never stretched to full width. A blurred placeholder sits behind it until it loads.
- **Reader panel and progress bar** (`app/components/reader-panel.tsx`):
  - **Progress card:** paper, with a 2px ink border and a 6px ink shadow. The percentage is in display 3xl signal.
  - **The bar:** a 12px square track in `bg-ink/15`, with the indicator painted signal through `[&_[data-slot=progress-indicator]]:bg-signal`.
  - **The to-do list:** a 40px field and a signal add button, then rows whose label is the 40px target.
  - **Opening it:** below `2xl`, a round outline pill in the Radar header (`NN%`, plus the open to-do count in signal) opens the panel.
- **Forms:** a field is `min-h-10 border-2 border-ink` on paper or cream, usually turning signal on focus (`focus-visible:border-signal`). A form sits on a paper card with a 2px ink border and a 6px ink shadow (the Library submit form).
- **Empty states** say what to do next. On cream, a dashed `border-ink/35` box shows centred mono text and, when a filter is on, a `brutal` "All stories" button. On ink, a mono line in `text-paper/55` is followed by a 40px signal link.

## Do's and Don'ts

Do:

- Use the tokens (`bg-ink`, `text-signal`, `border-paper/15`) and the shared controls above.
- Frame with 2px ink, lift with a hard offset shadow, and end a display title with a signal `//`.
- Give every control a 40px target, use container queries inside the main column, and use `dvh`.
- Check UI changes on `/dev/preview` at 360, 768 and 1280px.

Don't:

- Don't add a dark theme, `prefers-color-scheme` styles or `next-themes`.
- Don't use webfonts, blurred shadows, or rounded corners beyond the `rounded-full` cases above.
- Don't add hex values outside `:root`, or use `bg-accent` as a neutral fill.
- Don't use `vw` for widths inside the main column, `vh` for heights, or a bare `:hover` rule in `globals.css`.

> ⚠️ **Never run `npx shadcn add` in this repo.** `add sidebar` appends `--sidebar-*` variables and a `.dark` block to `app/globals.css`. They land after the existing `@theme inline`, so they win the cascade and the sidebar renders stock grey. The command would also overwrite `components/ui/button.tsx`, which carries an extended size set (`xs`, `icon-xs`, `icon-sm`, `icon-lg`) and the house variants `ink` / `signal` / `brutal` that the app depends on. And it would install individual `@radix-ui/react-*` packages, although this project deliberately uses the unified `radix-ui`. Instead, fetch read-only with `npx shadcn@4.17.0 view <name>` and place the code by hand.
