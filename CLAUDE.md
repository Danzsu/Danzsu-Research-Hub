# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**Danzsu Research Hub** (app name: *NEON NEWS RADAR — Weekly AI Intelligence*) — a private, invite-only, bilingual (HU/EN) AI-research hub. Plain **Next.js 16** (App Router, React 19) on **Vercel**, data in **Supabase**.

It was reconstructed from a flat archive (see [docs/ARCHIVE-MAP.md](docs/ARCHIVE-MAP.md)) that targeted OpenAI ChatGPT Sites / Cloudflare Workers via `vinext`. It was then moved to Vercel so the site can schedule its own work. The archive map still describes files that no longer exist (`db/`, `drizzle/`, `scripts/`, `build/`); it is kept as a provenance record.

## How content gets in

Nothing runs on a personal machine. Two writers, both server-side with the Supabase **secret key**:

1. **Daily pipeline** — Vercel Cron (`vercel.json`, 05:00 UTC) → `app/api/cron/daily` → `lib/pipeline/daily.ts`: collects RSS + Hacker News + GitHub search (`lib/pipeline/collect.ts`, sources in `feeds.ts`), shortlists with **Groq** (optional), curates with **Gemini** into the current ISO-week issue, refreshes the top-3 via the `refresh_must_read` RPC, and retries unfinished link submissions.
2. **Link submissions** — `/library` form → `app/api/sources` inserts a `sources` row as the reader, then `after()` runs `lib/pipeline/ingest.ts`: YouTube goes to Gemini as a video (`file_data.file_uri`), articles are extracted with linkedom + Readability, mirrored into `posts.body`, and summarized.

Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily`.

`lib/llm.ts` is two `fetch` wrappers (no SDKs) behind `generate(db, task, schema, prompt)`; every model response is validated with a zod schema (`zod/v4`, which also produces the JSON Schema sent to the model). **Which model runs which task lives in the `model_settings` table** (`daily_shortlist`, `daily_curate`, `ingest_article`, `ingest_video`), each with a fallback; editing a row takes effect on the next run, no redeploy. Pin exact versions there, not `*-latest` aliases. A route whose API key is unset is skipped.

## Auth

Supabase Auth, magic link. **Sign-ups are disabled in the Supabase dashboard** — that is the invite allowlist; members are added with *Authentication → Invite user*. `app/auth/login` calls `signInWithOtp({ shouldCreateUser: false })` and always answers the same, so it cannot enumerate members.

`proxy.ts` refreshes the session on every request and redirects signed-out page views to `/login` (`/api/*` routes return 401 themselves). Pages that read identity use `getViewer()` from `lib/supabase/server.ts` and `export const dynamic = "force-dynamic"`.

Email templates (Supabase → Authentication → Email Templates) should link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (Magic Link) and `…&type=invite` (Invite user). `app/auth/callback` handles both that and the default `?code=` form; the token-hash form also works when the link is opened on another device.

## Database

Schema lives in `supabase/migrations/` and is applied with `supabase db push` (Supabase CLI). RLS is on for every table:

- Content (`issues`, `digest_items`, `github_top`, `posts`): readers `select`; only the secret key writes.
- `sources`: readers `select` and `insert` (stamped with `auth.uid()`).
- `item_states`, `todos`: own rows only; `user_id` defaults to `auth.uid()`, so app code never names the user.
- `model_settings`: RLS on with no policies — only the secret key reads it.

`lib/supabase/server.ts`: `createClient()` acts as the reader (RLS applies) — use it everywhere except the pipeline; `createAdminClient()` bypasses RLS — pipeline only.

## Commands

```bash
corepack pnpm@11.25.0 install --frozen-lockfile
cp .env.example .env.local   # or: vercel env pull .env.local

npm run dev        # next dev on :3000
npm run build
npm run lint
npm test           # node --test lib/pipeline/*.test.ts (pure helpers)
npx tsc --noEmit
```

`corepack enable` fails with EPERM under nvm-for-windows, so pnpm is invoked through corepack directly. Requires Node `>=22.13.0`. Files under `lib/pipeline/` and `lib/llm.ts` use relative `.ts` imports (no `@/`) so `node --test` can load them without a bundler.

## Layout

```text
app/              pages (/, /archive, /archive/[week], /library, /library/[id], /login),
                  loading/error/not-found, manifest, auth routes, API routes
app/components/   digest-dashboard, page-header, language-toggle
app/api/          state (read/saved/todos), sources (link submit), cron/daily
lib/pipeline/     collect, daily, ingest, feeds, util (+ util.test.ts)
lib/llm.ts        Gemini + Groq
lib/content.ts    DB rows → the UI's content types
lib/language.ts   getLanguage() — the `lang` cookie (hu | en)
lib/supabase/     server + admin clients, getViewer, safeNext
data/             digest-types.ts — the content contract and tag vocabulary
components/ui/    39 vendored shadcn components
supabase/         migrations
vendor/           shadcn Tailwind 4 utility pack, imported by app/globals.css
```

## Design language — do not erode it

`app/globals.css` is the whole theme (Tailwind 4, CSS-first, no `tailwind.config`). Five brand tokens — `--ink #141414`, `--paper #fbefca`, `--cream #f8e8b4`, `--signal #f15f22`, `--cyan #59e1e8` — with the full shadcn token set remapped onto them.

- **`--radius` and `--radius-sm/md/lg/xl` are all `0`.** Hard-cornered brutalism. This is why stock shadcn files can be dropped in unmodified: every `rounded-*` compiles to zero. `rounded-full` is *not* neutralized and is used intentionally (avatar, language pill, live dot).
- **System fonts only, no webfonts.** `.font-display` = Arial Black/Impact 900, `.font-mono` = Courier New.
- **Shadows are hard offsets with zero blur** (`5px 5px 0 var(--ink)` → hover `8px 8px 0 var(--signal)`). Transitions are **160ms ease**.
- **Single fixed theme.** No `.dark` block, no `prefers-color-scheme`, no `next-themes`. The contrast is spatial: `html` is ink, `body` is paper, the sidebar and hero are ink-on-paper, the content column is cream.
- **Responsive rules.** Everything must fit 360px with no horizontal scroll. Display headings use `clamp(2.6rem, 11vw, …)` or smaller minimums. Below `md` the dashboard's categories are a sticky chip bar and the sidebar is a Sheet; below `2xl` the progress/to-do panel opens as a right Sheet from the header. Widths inside the main column use container queries (`@container`, `cqi`, `@3xl:`), not `vw`: the sidebar and panel make that column far narrower than the viewport. Touch targets are at least 40px (`min-h-10`, `size-10 sm:size-8`). Custom `:hover` effects in `globals.css` sit inside `@media (hover: hover)`; Tailwind's `hover:` already does that. Use `dvh`, not `vh`.
- **Közös vezérlők:** `Button` `ink` / `signal` / `brutal` variáns, `focus-ring` utility, `PageHeader` és `PageHero`. Ezeket használd, ne ismételd az osztálylistákat.

> ⚠️ **Never run `npx shadcn add` in this repo.** `add sidebar` appends `--sidebar-*` variables and a `.dark` block to `app/globals.css` — after the existing `@theme inline`, so it wins the cascade and the sidebar renders stock grey. It would also overwrite `components/ui/button.tsx`, which carries an extended size set (`xs`, `icon-xs`, `icon-sm`, `icon-lg`) and the house variants `ink` / `signal` / `brutal` the app depends on, and install individual `@radix-ui/react-*` packages although this project deliberately uses the unified `radix-ui`. Fetch read-only with `npx shadcn@4.17.0 view <name>` and hand-place instead.

## Hand-authored components

- **`components/ui/progress.tsx`, `separator.tsx`, `skeleton.tsx`, `textarea.tsx`** — written in this project's house style (function components, `data-slot`, unified `radix-ui`). The registry still serves forwardRef-era source, so pasting it would have broken the convention *and* omitted `data-slot="progress-indicator"`, which the dashboard targets to paint the bar signal-orange.
- **`components/ui/sidebar.tsx`** — fetched read-only from the registry and hand-patched (import paths, `Slot.Root`, Tailwind 4 `w-(--sidebar-width)` instead of the v3 square-bracket variable form, which compiles to invalid CSS). See the header comment in the file.

`skeleton.tsx` deliberately uses `bg-primary/10` rather than upstream's `bg-accent`, because `--accent` is the signal orange here and a stock skeleton would pulse bright orange.

## Data contract

`DigestItem`: `id` (≤120 chars, unique), `category`, `mustRead?`, `score` (0–100), `readMinutes`, `publishedLabel`, `source`, `url`, `tags[]`, and `title`/`summary`/`why` each as `{ hu, en }`. Only those three fields are bilingual; `tags`, `source`, `score` are not. Tags come from `digestTags` in `data/digest-types.ts`; the model output schema enforces it.

> ⚠️ **`item.id` is half the composite primary key of `item_states`.** Renaming an id silently orphans every reader's read/saved state. Ids are append-only forever: `itemId()` in `lib/pipeline/util.ts` derives them as `<category>-<isoweek>-<slug>-<urlhash>`, and inserts use `ignoreDuplicates` on `url`, so an existing row is never rewritten.

`githubTop10` is an array of **positional 3-tuples** `[repo, focus, url]`, not objects. Exactly 3 items per issue have `must_read` — enforced by `refresh_must_read`; the `nth-child(2)/(3)` stagger in `globals.css` only reads as deliberate at exactly three.

## Content and copyright

`robots: noindex` in `app/layout.tsx` and the invite gate are load-bearing, not cosmetic — the Library mirrors article text. A `noarchive` robots signal downgrades an article to summary-only (`posts.body = null`). Deleting a `sources` row cascades to its post.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
