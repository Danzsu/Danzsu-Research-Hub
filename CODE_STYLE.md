# Code style

This is how code is written here. Styling and CSS are covered in DESIGN.md, and tests in TESTING.md. `npm run lint` (eslint-config-next's core-web-vitals and TypeScript rules) and `npx tsc --noEmit` (`strict`) enforce part of it. The rest is on the author.

## Naming

- **Names say what a thing is, and comments say why.** Prefer a descriptive name over a short one.
- **Files** are kebab-case (`digest-dashboard.tsx`, `post-view.ts`). Hooks live in `use-*.ts` files and export `useX` (`use-reader-state.ts` exports `useReaderState`).
- **In code:**
  - components and types are PascalCase (`StoryCard`, `DigestItem`);
  - functions and values are camelCase;
  - fixed values and shared tables are SCREAMING_SNAKE_CASE (`TITLE_MAX`, `REEXTRACT_COOLDOWN_MINUTES`, `NAV_ITEMS`, `SHORTCUTS`, `POST_ERRORS`, `MEDIA_BUCKET`).
- **String codes are snake_case:** JSON error codes (`invalid_url`, `translation_stale`) and model tasks (`daily_curate`).
- **Code identifiers, comments and model prompts are in English.** Only the UI copy is bilingual.

## File structure

- **One file holds one component, or a small family of components that belong together.** For example, `story-card.tsx` holds `StoryCard` and `MustReadCard`, `page-header.tsx` holds `PageHero` and `StatusCard`, and `nav-parts.tsx` holds the parts every nav variant shares. Unrelated components get separate files.
- **Where a component lives:**
  - a route's own component sits beside the route (`app/(app)/library/[id]/post-editor.tsx`);
  - a component used in several places goes in `app/components/`;
  - vendored shadcn components go in `components/ui/`.
- **Logic goes in `lib/`, not in a component or a route** (ARCHITECTURE.md → Boundaries).
- **Tests sit next to their module,** as `x.test.ts` (TESTING.md → Where tests live).

## Imports

- **`lib/` uses relative imports with the `.ts` extension** (`../blocks.ts`), never `@/`. That way `node --test` loads it without a bundler, and the client editor can import `lib/post-edit.ts` without pulling in server-only code.
- **The exceptions** are the three Next-only server modules, `lib/content.ts`, `lib/language.ts` and `lib/supabase/server.ts`. They import with `@/`, and each starts with `import "server-only"`.
- **`app/`, `components/` and `hooks/`** import across directories with `@/` (tsconfig `paths`), and siblings with an extensionless `./x`.
- **Type-only imports** use `import type`, or an inline `type` specifier (`import { readNavMode, type NavMode }`).

## TypeScript

- **No `any`.** `npm run lint` rejects it: `@typescript-eslint/no-explicit-any` is an error in typescript-eslint's recommended set, which `eslint-config-next/typescript` extends, and no override turns it off. Take `unknown` and narrow it.
- **Parse untrusted input at the boundary** into a typed value or an explicit error, never a cast:
  - structured data goes through a `zod/v4` schema (import from `"zod/v4"`): model answers in `generate()`, stored JSON in `parseBlocks` and `readOverrides`, and the state action in `parseStateAction`;
  - everything else goes through a small parser: `parseSubmittedUrl`, `parseId`, `readNavMode`.
- **Make a result map exhaustive by type,** so a new variant is a `tsc` error rather than a silent default. For example, `RESULT_STATUS: Record<Exclude<TranslateResult, "ok">, ErrorAnswer>` in the translate route.

## React

- **Components are server components by default,** and `"use client"` goes only on an interactive leaf. ARCHITECTURE.md → Boundaries shows where that line runs today.
- **Never call `setState` during render without a guard that makes it converge.** `undo-toast.tsx` does it safely, by comparing `prevToastId` first. Without a guard, the render loops ("Too many re-renders"), which `app/components/shell.test.ts` catches.
- **External stores go through `useSyncExternalStore`:** the toast queue, the reader store and the opened posts. An event handler that an effect needs, but shouldn't re-subscribe for, goes through `useEffectEvent` (`use-shortcuts.ts`).
- **Never `eslint-disable` a `react-hooks` rule.** Fix the code. The one disable in app code is `@next/next/no-img-element` in `post-image.tsx`, and it states its reason. `eslint.config.mjs` turns two `react-hooks` rules and `@typescript-eslint/no-unused-vars` off for the vendored `components/ui/` files and `hooks/use-mobile.ts` only.

## HU/EN copy

- **One colocated object per component,** `{ hu: {…}, en: {…} }`, read as `copy[language]`.
- **Every string in both languages.** No English-only labels, no inline `language === "hu" ? … : …`, and no i18n library.
- **The names in use:** `copy` in most components (`digest-dashboard` included), `labels` in `post-blocks`, and `notices` in `app/(app)/library/[id]/post-notices.tsx`, which `post-article.tsx` also reads.
- **Server components on pages that switch language in place** keep `{ hu, en }` per key instead (`library-view.tsx`, `archive-view.tsx`), and render it through `<LocalizedText>` (ARCHITECTURE.md → Cross-cutting concerns).
- **Data lists that several components share** keep `Localized` values in `lib/` (`NAV_ITEMS` in `lib/nav.ts`, `SHORTCUTS` in `lib/keymap.ts`).

## Comments

- **Keep them short, and say why rather than what.** Document complex logic and non-obvious decisions, not what the code already says.
- **Doc comments** go on exported functions and types whose contract isn't obvious from the signature.
- **Mark a deliberate simplification with a `ponytail:` note** that names its ceiling and the upgrade path: DNS rebinding in `safeFetch`, the ~12,000-word cut in `extract/pdf.ts`, the polling cap in `refresh-while-processing.tsx`.
- **When a comment points at a spec, name the section** ("spec 1.4.12").

## Error handling

- **An API error goes through `jsonError(status, code)`** (`lib/api.ts`), with a snake_case code that the client maps to its copy. CLAUDE.md → Routes lists every route's codes.
- **`errorMessage(error)`** (`lib/pipeline/util.ts`) turns any caught value into a string for logs and `sources.error`.
- **A network failure in the pipeline is a `FetchError`** (`lib/pipeline/fetch.ts`). `ensureOk` turns a non-ok response into one.
- **No silent failure.** A `catch` does one of four things:
  - returns a defined fallback (`safeHref` → `undefined`, `safeNext` → `"/"`);
  - rethrows with context (`FetchError`);
  - logs it (`console.error` or `console.warn`, with the id);
  - shows it (the undo toast's failure message, a `role="status"` line).

  An empty `catch` carries a comment that says why nothing is lost, as in `cancelBody` and `createClient`'s cookie write.

## No duplication

- **Search before you write a helper or a class list** (`grep -rn`). `npm run dup` (jscpd, 6 lines / 60 tokens) is the gate: at most 1% duplication, and no new clone.
- **Reuse the shared homes:**
  - `lib/media.ts`: image paths;
  - `lib/api.ts`: `jsonError`, `postRoute`;
  - `lib/supabase/server.ts`: `getReader` / `getViewer`;
  - `lib/pipeline/util.ts`: `hostOf`, `parseId`, `detectSource`, `errorMessage`, `settledValues`, `publishedDate`…;
  - `lib/pipeline/fetch.ts`: `safeFetch`, `apiFetch`, `ensureOk`, `readText`;
  - `lib/blocks.ts`: `localizedSchema`, `parseBlocks`;
  - `readPageMeta` in `extract/article.ts`;
  - in the UI, the shared controls in DESIGN.md → Components.

## Commits

- **Follow Conventional Commits,** with a lowercase, imperative subject (`docs: add testing.md`, `fix: report the progress value to assistive tech`).
- **The message says what changed and why,** not how it was implemented. Make one logical change per commit.
- **No attribution lines,** such as `Co-Authored-By`.
- **Commit with an explicit pathspec:** `git add <files>`, then `git commit -m`. Never `git add -A` or `git add .`.
