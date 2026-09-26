# Architecture

This is the map: what the parts are, where they live and what must stay true about them. The detail lives in CLAUDE.md. This file changes a few times a year and isn't kept in sync line by line.

## Bird's eye view

NEON NEWS RADAR is a private, invite-only AI-research hub in Hungarian and English. It does two jobs. It keeps its readers up with the week's AI news without asking them to read everything, and it keeps the articles, videos, papers and repositories that members find, in a form that survives the original going dead.

Each job has its own view, and each view is fed by a writer that runs on the server. Nothing runs on a personal machine. Vercel hosts the app and schedules its work, and Supabase holds the data, the auth and the mirrored images.

- **The Radar** is the weekly digest. Every morning Vercel Cron calls `GET /api/cron/daily`. `runDaily` collects candidates from RSS/Atom feeds, Hacker News and GitHub. A cheap model cuts a long list down, a stronger one scores the candidates and writes them up in both languages, and the result goes into the current ISO week's issue.
- **The Library** holds the members' links. A reader submits a URL on `/library`, and `POST /api/sources` stores it. After the response, `processSource` turns it into a post. A kind-specific extractor reads it, noise filtering cleans it, its images are mirrored, and a model writes a bilingual summary. A page that asks not to be archived gets notes in the model's own words instead. Every source becomes the same typed block model (`lib/blocks.ts`), and the post page renders nothing else.

Two Supabase keys split the trust. Pages and reader API routes act as the signed-in reader: they use the publishable key, so row-level security applies. The pipeline writes content with the secret key, which bypasses RLS. A reader writes only three things: their own read, saved and to-do rows, the `sources` row of a submission, and, as the submitter, a post's title, summary and hidden blocks, which go through one checked RPC. Models (Gemini and Groq) are plain `fetch` calls behind `generate()`. Which model runs which task is data in the `model_settings` table, not code.

## Codemap

`app/` is Next.js routing and UI. `lib/` is the logic, and it runs under plain `node --test`.

- `app/(app)/` holds the signed-in pages (`/`, `/archive`, `/archive/[week]`, `/library`, `/library/[id]`) under one layout, the app shell. The group name isn't part of the URL. `library/` has the list (`library-view`), the submit form and the post page. The post page's files are in `[id]/`: `post-article`, `post-toolbar`, `post-editor`, `post-notices` and `mark-post-read`. `archive/` has the archive list.
- The rest of `app/`, outside the group:
  - `login/` and `auth/` (login, callback, signout);
  - `api/`: state, sources, `posts/[id]` (PATCH, translate, reextract) and `cron/daily`;
  - `media/[...path]/`, which serves the mirrored images to signed-in readers;
  - `dev/preview/`, the offline preview on fixtures;
  - the error, not-found and manifest files;
  - `layout.tsx`, which sets `robots: noindex`;
  - `globals.css`, the theme (DESIGN.md).
- `app/components/` has the shared UI:
  - the shell: `app-shell` (with the mobile bottom bar), `desktop-nav`, `nav-parts`, `shell-dialogs`, `undo-toast`;
  - the language: `language-context`, `language-toggle`;
  - the Radar: `digest-dashboard`, `story-card`, `reader-panel`, `tag`;
  - the title bands: `page-header` (`PageHero`, `StatusCard`);
  - the post renderer: `post-blocks`, `post-image`;
  - the hooks: `use-reader-state`, `use-shortcuts`, `use-model-context-tools`.
- `components/ui/` holds vendored shadcn components on the unified `radix-ui` package. A few are hand-patched (CLAUDE.md → Hand-authored components). Most aren't used yet and are kept for the UI/UX milestones. `hooks/use-mobile.ts` is their `md` breakpoint hook, and the Radar's to-do panel still uses it.
- `lib/pipeline/` holds the two writers:
  - the Radar: `daily.ts`, `collect.ts`, `feeds.ts`;
  - the Library: `ingest.ts` (`processSource`, `retryPendingSources`), and `extract/` with one extractor per source kind, where `index.ts` holds the fallback chain;
  - HTML to blocks: `html-to-blocks.ts`, plus `html-noise.ts` and `cleanup.ts` for the three noise layers;
  - images: `html-images.ts` and `images.ts` (mirroring);
  - `summary.ts`, the summaries and notes;
  - `fetch.ts` (`safeFetch`, `apiFetch`) and `util.ts` (ids, URL parsing and small shared helpers).
- The rest of `lib/`:
  - the block model, `blocks.ts`;
  - `post-view.ts`, which turns a post row into the page's `Post`;
  - the submitter's edits: `post-edit.ts`, `overrides.ts`;
  - `translate.ts` and the model client, `llm.ts`;
  - `content.ts`, which turns DB rows into content types;
  - reader state: `reader-store.ts`, `state.ts`, `feed.ts`;
  - the shell's data: `nav.ts`, `nav-mode.ts`, `keymap.ts`, `undo-queue.ts`;
  - `media.ts` (the bucket and its key format), `public-paths.ts`, `api.ts` (`jsonError`, `postRoute`), `language.ts`;
  - `supabase/server.ts`, the Supabase clients;
  - `fixtures.ts`, the preview's data.
- `lib/test/`, `lib/pipeline/fake-db.ts` and `lib/pipeline/mock-fetch.ts` are the test harnesses and fakes (CLAUDE.md → Conventions → Tests).
- `data/digest-types.ts` is the Radar content contract and the tag vocabulary.
- `proxy.ts` refreshes the session and redirects signed-out requests to sign-in, on every request.
- `supabase/migrations/` has the schema, RLS, the RPCs, the `model_settings` seeds and the `media` bucket.
- `scripts/ingest-url.mts` is `npm run ingest`, which ingests one link without the UI.
- `vendor/` is the shadcn Tailwind 4 utility pack that `globals.css` imports.
- `.github/` has the CI workflow and Dependabot.
- `docs/` has the specs and plans (`superpowers/`) and `ARCHIVE-MAP.md`, the provenance record. The app was reconstructed from a flat archive that targeted OpenAI ChatGPT Sites / Cloudflare Workers via `vinext`, and then moved to Vercel so it can schedule its own work. The map still names files that no longer exist (`db/`, `drizzle/`, `build/`, and the old shell and `.mjs` scripts under `scripts/`).

## Invariants

Breaking one of these is a bug even when every test passes.

- **A Radar item's id never changes.** `item.id` is half the composite primary key of `item_states`, so renaming one silently orphans every reader's read and saved state. `itemId()` in `lib/pipeline/util.ts` derives it once, as `<category>-<yyyy>w<ww>-<slug>-<urlhash>`, from the category, the ISO week, the English title and the source URL. Inserts use `ignoreDuplicates` on `url`, so an existing row is never rewritten. `lib/pipeline/daily.test.ts` pins two literal ids.
- **An issue has three must-reads.** After every daily run, `refresh_must_read` marks the three highest scores of the issue (ties go to the earlier row). An issue with fewer than three items has fewer. The Top 3 grid is built for exactly three.
- **Block ids are content-addressed.** `assignIds` (`lib/blocks.ts`) derives each id from the block's type and normalized content, never from its position. That's why `hidden_blocks`, and later annotations, still point at the same block after a re-extraction.
- **No raw HTML reaches a page** (CLAUDE.md → Security).
- **No secret reaches the browser** (CLAUDE.md → Security).
- **The admin client runs only in the pipeline, or after a route has made its own check** (CLAUDE.md → Database).
- **Every user-supplied or page-derived URL is fetched through `safeFetch`** (CLAUDE.md → Security).
- **The offline preview never reaches real data.** Local dev points at the production project, so preview writes send nothing:
  - reader state goes through `memorySend`;
  - the Library form goes through an in-memory stub (`preview` on `LibraryView`);
  - the post page's `MarkPostRead` gets `preview`;
  - under `fail=1`, every write fails.

  The preview post ids in `lib/fixtures.ts` are negative. `parseId` rejects them, so Translate or a Library card link can't reach a real post. The preview isn't a sandbox, though: the app shell's own links and Sign out are the real ones, so with a local session they leave the preview for real pages, real data and a real sign-out.
- **`robots: noindex` and the invite gate are load-bearing, not cosmetic.** The Library mirrors other people's articles, and those two are what keep that defensible (README.md → Content and copyright). A `noarchive` page is never mirrored (CLAUDE.md → How content gets in, step 3).

## Boundaries

- **`lib/` and `app/`.** `lib/` never imports from `app/`, and it loads without Next.js, except for the three Next-only server modules `lib/content.ts`, `lib/language.ts` and `lib/supabase/server.ts`. `app/` is routes and components. It keeps its logic thin, so that the logic sits in a `lib/` function that a unit test can reach.
- **Server and client components.** Pages, the post article and the Library and Archive lists are server components. `"use client"` marks the interactive leaves, such as the shell, the Radar dashboard, the language toggle, the submit form, the editor and the toolbar. A presentational component that both sides render stays hook-free (`post-blocks.tsx`, `page-header.tsx`), and its one stateful piece is split out (`post-image.tsx`).
- **Reader and admin client.** `lib/supabase/server.ts` creates both. Which code may use the admin client is in CLAUDE.md → Database. The browser never talks to Supabase: data reaches it through server components and the API routes.
- **Pipeline and routes.** A route authenticates, parses, calls `lib/` and maps the result to JSON. Ingest (`processSource`, from the sources and reextract routes) runs in `after()`, once the response has been sent. The cron and translate routes do their work inside the request, because the result is their answer.

## Cross-cutting concerns

- **Auth.** A Supabase magic link, invite-only. `proxy.ts` sends a signed-out visitor to `/login`, and every page and API route still checks the session itself (CLAUDE.md → Auth).
- **Language.** The reader's choice is the `lang` cookie, read on the server by `getLanguage()` and on the client by `useLanguage()`.
  - Some pages switch language in place (`switchesLanguageInPlace()` in `lib/nav.ts`): the Radar, the Library list, the archive and an archived week. Their client components read `copy[language]`, and their server components hand both languages to `<LocalizedText value={…} />`.
  - Every other page, such as a post, renders in the server's language, and the toggle refreshes it.
  - The copy objects themselves are covered in CLAUDE.md → Conventions.
- **Errors.**
  - An API error is a status code plus a snake_case code, sent through `jsonError`, and the client maps the code to its copy.
  - A failed ingest ends up on its `sources` row (`error`, or `status: "failed"`). The Library list shows it, and so does the post page, to the submitter.
  - A failed reader write rolls back and shows the undo toast's failure message.
- **Testing layers** are unit tests on `lib/`, static component renders, route handlers under stubs, and the offline preview (CLAUDE.md → Conventions → Tests).
- **CI and supply chain.** CLAUDE.md → CI covers the workflow, and CLAUDE.md → Conventions → Supply chain covers the dependency rules.
