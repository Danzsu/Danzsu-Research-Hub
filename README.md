# Danzsu Research Hub

A private, invite-only, bilingual (HU/EN) AI-research hub, published as **NEON NEWS RADAR — Weekly AI Intelligence**. This README is the onboarding guide. The deep reference, with every rule an agent or a reviewer checks, is [CLAUDE.md](CLAUDE.md).

## What it is

**Radar** is the weekly digest. Every morning a cron job collects AI news from RSS feeds, Hacker News and GitHub, lets a model pick and score what matters, and writes it into the current ISO week's issue. Readers see a top-3 must-read, a scored feed in four categories (local models, research, companies, GitHub), a GitHub top-10 and an archive of past weeks. Each reader's read, saved and to-do state is their own.

**Library** is where members save links: articles, YouTube videos, arXiv papers, PDFs, GitHub repositories and X posts. Each link becomes a post. Its content is converted into typed blocks and its images are mirrored, so the post survives the original going dead. A model writes the title, summary and key points in both languages. The submitter can edit the title and summary, hide blocks, and re-extract the post; any reader can ask for a Hungarian translation of the body. The canonical source link is always shown.

| Layer | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19 |
| Hosting and scheduler | Vercel, with Vercel Cron once a day |
| Database, auth, files | Supabase: Postgres with RLS, magic-link auth, a private Storage bucket |
| Styling | Tailwind 4 (CSS-first) and vendored shadcn/ui on the unified `radix-ui` package |
| Models | Gemini (Google AI Studio) for curation, summaries, video, PDF transcription and translation; Groq for the cheap shortlist and cleanup passes. Plain `fetch`, no SDKs |

## How it works

Two server-side writers put content in; both use the Supabase secret key. Nothing runs on a personal machine.

```mermaid
flowchart TD
  subgraph daily["Writer 1: the daily cron, 05:00 UTC"]
    cron["Vercel Cron"] --> cronRoute["GET /api/cron/daily"]
    cronRoute --> runDaily["runDaily: feeds, Hacker News, GitHub search"]
    runDaily --> shortlist["daily_shortlist"] --> curate["daily_curate"]
    curate --> radar[("issues, digest_items, github_top")]
    cronRoute --> retry["retryPendingSources"]
  end
  subgraph submit["Writer 2: a link submission"]
    form["/library form"] --> sourcesRoute["POST /api/sources"]
    sourcesRoute --> sources[("sources")]
  end
  sourcesRoute -.->|"after()"| ingest["processSource"]
  retry --> ingest
  ingest --> extract["extract: the kind's extractor, with noise layers 1 and 2"]
  extract --> noarchive{"noarchive?"}
  noarchive -->|yes| notes["writeNotes: notes in the model's own words"]
  noarchive -->|no| limit["limitBlocks"] --> cleanup["aiCleanup: noise layer 3"] --> images["mirrorImages: media bucket"]
  notes --> summarize["summarize, unless the extractor already did"]
  images --> summarize
  summarize --> posts[("posts")]
```

**The daily cron** ([`lib/pipeline/daily.ts`](lib/pipeline/daily.ts)) takes the last two days of candidates, drops anything stored in the last 14 days, shortlists them to 40 with a cheap model when there are more, and curates up to 25 items plus a GitHub top-10 with a stronger one. Every item gets a permanent id (see [Data contract](CLAUDE.md#data-contract)), and a database function marks the top 3 as must-reads. The same run then retries link submissions that never finished.

**The block pipeline** ([`lib/pipeline/ingest.ts`](lib/pipeline/ingest.ts)) turns a submitted link into a post:

1. **Extractors**, one per source kind in [`lib/pipeline/extract/`](lib/pipeline/extract/). When one fails, the fallback is the generic article extractor (for arXiv and GitHub only) and then a metadata-only post. When the page itself can't be fetched (an article, an X post, or a YouTube video that doesn't exist), the submission fails instead.
2. **Noise filtering in three layers.** Layer 1 strips page chrome from the DOM (nav, ads, share widgets, cookie banners), and layer 2 drops leftover blocks (share links, newsletter prompts, duplicates). Both live in [`html-noise.ts`](lib/pipeline/html-noise.ts). Layer 3 asks a cheap model which blocks are not part of the article ([`cleanup.ts`](lib/pipeline/cleanup.ts)), for articles, GitHub READMEs and arXiv papers only.
3. **Image mirroring** ([`images.ts`](lib/pipeline/images.ts)). Up to 30 images are downloaded and re-encoded to AVIF, or animated WebP, at 640 and 1280 px. They go into a private Storage bucket and are served by the `/media` route to signed-in readers only.
4. **Summary or notes.** A model writes the bilingual title, summary, key points and tags. A page that asks not to be archived (`noarchive`) gets no mirrored text at all, only notes in the model's own words.

Every source ends up as the same block model ([`lib/blocks.ts`](lib/blocks.ts)): headings, paragraphs, lists, quotes, code, images, videos, chapters, repo cards and dividers. The page renders only these blocks, never raw HTML. Block ids come from their content, so a hidden block stays hidden after re-extraction as long as its content is unchanged.

**Translation** ([`lib/translate.ts`](lib/translate.ts)) runs on demand from the post page. Only the text of the blocks goes to the model, in chunks; links, images and structure are copied from the original. A translation that finishes after the post was re-extracted is refused, and the reader is asked to retry.

**Auth, RLS and the one reader write to posts.** Sign-in is a Supabase magic link, and sign-ups are disabled, so the member list is whoever was invited. Every table has row-level security: readers may read content, insert sources, and touch only their own read, saved and to-do rows. The pipeline writes content with the secret key. The one exception is the submitter's edits: the `update_post_overrides` database function checks that the caller submitted the post and then writes only its `overrides` and `hidden_blocks` columns.

**`model_settings`** is a table with one row per model task (seven today): a provider and model, plus an optional fallback. Editing a row changes the model on the next run, with no redeploy. API keys stay in environment variables. The task list and the seeded models are in [CLAUDE.md](CLAUDE.md#how-content-gets-in).

## Quick start (local)

> ⚠️ **There is one Supabase project, and it is production.** If your `.env.local` points at it, then local cron runs, Library submissions and `npm run ingest` all write real rows that every member sees. Use your own Supabase project to experiment.

**Prerequisites:** Node `>=22.13.0` (with corepack, which ships with Node), a Supabase project, and a Gemini API key from [Google AI Studio](https://aistudio.google.com). Optional: a [Groq](https://console.groq.com) key and a GitHub fine-grained token with no scopes.

**1. Install.**

```bash
corepack pnpm@11.25.0 install --frozen-lockfile
```

pnpm is called through corepack directly, because `corepack enable` fails with EPERM under nvm-for-windows. pnpm won't resolve a package version published less than 7 days ago (see [Conventions](#conventions)).

**2. Environment.** Copy [.env.example](.env.example) to `.env.local` and fill it in, or run `vercel env pull .env.local` once the Vercel project exists. Every variable is server-only.

| Variable | Needed | What for |
| --- | --- | --- |
| `SUPABASE_URL` | yes | The project URL |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Acts as the signed-in reader; RLS applies |
| `SUPABASE_SECRET_KEY` | yes | Bypasses RLS: the pipeline, and a few routes after their own checks |
| `GEMINI_API_KEY` | yes | Every Gemini task |
| `GROQ_API_KEY` | no | Without it, the Groq tasks run on their Gemini fallback |
| `CRON_SECRET` | yes | A long random string (`openssl rand -hex 32`); the cron route's bearer token |
| `GITHUB_TOKEN` | no | Raises the GitHub search rate limit |

**3. Supabase.**

- *Authentication → Sign In / Providers:* turn off **Allow new users to sign up**. That is the invite list.
- *Authentication → URL Configuration:* set the Site URL to the address you sign in on, and add `http://localhost:3000/**` (plus the deployed domain) to the Redirect URLs.
- *Authentication → Email Templates:* point Magic Link at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`, and Invite user at the same link with `type=invite`.
- Apply the migrations in filename order, with the CLI (`npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`) or by pasting each file into the SQL Editor:

  | # | File | What it adds |
  | --- | --- | --- |
  | 1 | `20260923000000_init.sql` | The Radar, Library and reader-state tables, RLS, the `archive_issues` view, `refresh_must_read` |
  | 2 | `20260923010000_model_settings.sql` | `model_settings` and its first four tasks |
  | 3 | `20260924000000_post_blocks.sql` | The block columns on `posts`, six source kinds, three more tasks, the `media` bucket, `update_post_overrides` |
  | 4 | `20260925000000_drop_post_body.sql` | Drops the old `posts.body` column. Safe on a fresh project; on production, only after the block-based code is deployed |

- Check the *Table Editor*: 8 tables and the `archive_issues` view, each table with RLS enabled.
- *Authentication → Users → Invite user:* invite yourself.

**4. Run it.** `npm run dev`, open `http://localhost:3000/login`, and sign in with the invited address.

**5. The first issue.** Don't wait for 05:00 UTC:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
```

It answers with JSON such as `{ "issue": "2026-W39", "candidates": …, "shortlisted": …, "inserted": …, "repos": …, "retriedSources": … }`, and the Radar fills up.

**6. One link.** Submit it on `/library`, or from the terminal:

```bash
npm run ingest -- https://example.com/some-article
```

> ⚠️ `npm run ingest` writes a **real** source and post into the project in `.env.local`, visible to every member. It submits as the first user in the project (invite one first), and running the same URL twice fails, because a URL can be submitted only once.

## Deploy

1. **Vercel:** *Add New → Project*, import the repository. Next.js and pnpm are detected automatically.
2. **Environment variables:** everything from the table above, for Production and Preview. Environment changes take effect on the next deploy.
3. **Cron:** [`vercel.json`](vercel.json) schedules `/api/cron/daily` at `0 5 * * *` (05:00 UTC). With `CRON_SECRET` set, Vercel sends it as the bearer token itself. The cron, submission, translation and re-extraction routes may run for up to 300 s.
4. **Install command:** check that Vercel installs from `pnpm-lock.yaml` in frozen mode with pnpm 11, so the 7-day age gate applies. This is an open item in [TODO.md](TODO.md).
5. **Supabase:** set the Site URL and Redirect URLs to the Vercel domain, and send a new invite after changing them.
6. **First run:** the same `curl` against `https://<domain>/api/cron/daily`. The next morning, check *Vercel → Logs* and *Cron Jobs*.

Schema changes go in before the code that needs them, and a migration may only add while older code is still deployed. A column is dropped only after no deployed code reads it, as `drop_post_body` does.

## Project tour

| Path | What is there |
| --- | --- |
| [`app/`](app/) | Pages: the Radar (`/`), `/archive`, `/archive/[week]`, `/library`, `/library/[id]` and `/login`, plus loading, error and 404 pages |
| [`app/components/`](app/components/) | The Radar dashboard, the page header, the language toggle, and `post-blocks`, the block renderer |
| [`app/library/`](app/library/) | The submit form, and the post page with its toolbar (translate, edit link) and editor (edit, hide, re-extract) |
| [`app/api/`](app/api/) | JSON routes: reader state, link submission, post edit, translate, re-extract, and the daily cron |
| [`app/auth/`](app/auth/), [`proxy.ts`](proxy.ts) | Magic-link login, callback and sign-out; the proxy refreshes the session and sends signed-out visitors to `/login` |
| [`app/media/`](app/media/) | Serves mirrored images to signed-in readers |
| [`lib/pipeline/`](lib/pipeline/) | The daily run, the feed list, the ingest pipeline, safe fetching, HTML to blocks, noise filtering, image mirroring, summaries |
| [`lib/pipeline/extract/`](lib/pipeline/extract/) | One extractor per source kind, and the fallback chain |
| [`lib/`](lib/) | The block model, the post view, post edits, translation, the model client, content queries, the language cookie, Supabase clients |
| [`lib/test/`](lib/test/) | The offline render harness for component tests |
| [`data/digest-types.ts`](data/digest-types.ts) | The Radar content contract and the tag vocabulary |
| [`components/ui/`](components/ui/) | Vendored shadcn components (never `npx shadcn add`; see [CLAUDE.md](CLAUDE.md#design-language--do-not-erode-it)) |
| [`supabase/migrations/`](supabase/migrations/) | Schema, RLS, database functions, model seeds |
| [`scripts/ingest-url.mts`](scripts/ingest-url.mts) | `npm run ingest` |
| [`docs/`](docs/) | Specs and plans, and the provenance map of the original archive |

**Where to start reading**, in this order:

1. [`data/digest-types.ts`](data/digest-types.ts) and [`lib/blocks.ts`](lib/blocks.ts): the two content models, Radar items and Library blocks.
2. [`supabase/migrations/`](supabase/migrations/): the tables, what RLS lets a reader do, and the two database functions.
3. [`app/api/cron/daily/route.ts`](app/api/cron/daily/route.ts) → [`lib/pipeline/daily.ts`](lib/pipeline/daily.ts) → [`collect.ts`](lib/pipeline/collect.ts): the Radar writer.
4. [`app/api/sources/route.ts`](app/api/sources/route.ts) → [`lib/pipeline/ingest.ts`](lib/pipeline/ingest.ts) → [`extract/index.ts`](lib/pipeline/extract/index.ts) → [`extract/article.ts`](lib/pipeline/extract/article.ts) → [`html-to-blocks.ts`](lib/pipeline/html-to-blocks.ts): the Library writer.
5. [`lib/llm.ts`](lib/llm.ts): how a task finds its model.
6. [`app/library/[id]/page.tsx`](<app/library/[id]/page.tsx>) → [`lib/post-view.ts`](lib/post-view.ts) → [`app/components/post-blocks.tsx`](app/components/post-blocks.tsx): how a post is read and rendered.
7. [`proxy.ts`](proxy.ts) and [`lib/supabase/server.ts`](lib/supabase/server.ts): sessions and the two Supabase clients.

## Recipes

**Add a news feed.** Add an entry to `feeds` in [`lib/pipeline/feeds.ts`](lib/pipeline/feeds.ts): `{ name, url, hint, limit? }`. `hint` is the category the model starts from; `limit` caps a high-volume feed (25 by default). The parser reads RSS 2.0 and Atom. A dead feed only logs a warning. Hacker News queries and GitHub topics are the two lists below it. If the feed has an unusual shape, add a case to [`collect.test.ts`](lib/pipeline/collect.test.ts).

**Add a source extractor.**

1. Add the kind to `SourceKind` and teach `detectSource` to recognize it, both in [`lib/pipeline/util.ts`](lib/pipeline/util.ts). The order of the checks matters.
2. Write `lib/pipeline/extract/<kind>.ts`, exporting an `Extractor`: `(db, url, note) => Promise<Extracted>`. Build `BlockDraft`s, give them ids with `assignIds`, and fill `text` for the summarizer. Fetch the user's URL with `safeFetch`, and a fixed API host with `apiFetch`.
3. Register it in `extractors` in [`extract/index.ts`](lib/pipeline/extract/index.ts), and decide whether the kind belongs in `RETHROW_FETCH_ERROR` and `NO_ARTICLE_FALLBACK`, and in `AI_CLEANUP_KINDS` in `ingest.ts`.
4. Add a migration that widens `sources_kind_check` and `posts_kind_check`.
5. Add the kind's label and icon on the post page and the Library page; `tsc` reports the missing entry.
6. Test it offline with `mockFetch` and `mockDns` (see [Testing](#testing)).

**Change a model, or add a model task.** To change a model, edit the task's row in `model_settings` in the Supabase Table Editor. Pin an exact version, not a `*-latest` alias. To add a task:

1. Add it to the `Task` union in [`lib/llm.ts`](lib/llm.ts).
2. Add a migration that widens `model_settings_task_check` and inserts the seed row.
3. Call `generate(db, "<task>", zodSchema, prompt)`. A task that sends a YouTube URL or a PDF runs only on Gemini.

**Add a migration.** Create `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Keep it additive while older code is deployed; drop things in a later migration, once no deployed code reads them. Enable RLS on every new table. Apply it with `npx supabase db push`, or paste it into the SQL Editor. Then update the Database section of [CLAUDE.md](CLAUDE.md).

**Add a UI string.** Put it in the component's own copy object, in both languages, and read it through the reader's language:

```tsx
const copy = {
  hu: { retry: "Újra" },
  en: { retry: "Retry" },
};
// in the component
const t = copy[language];
```

Server pages get `language` from `getLanguage()` ([`lib/language.ts`](lib/language.ts)); client components receive it as a prop. There is no i18n library.

**Run the checks.** All five must pass before a commit:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup
```

## Testing

`npm test` runs `node --experimental-strip-types --no-warnings --test "lib/**/*.test.ts" "app/**/*.test.ts"`. There is no test framework: tests use `node:test` and `node:assert`, and TypeScript runs through Node's type stripping. Nothing touches the network or Supabase.

- **Pipeline wiring without a database:** `fakeDb()` in [`lib/pipeline/fake-db.ts`](lib/pipeline/fake-db.ts) stands in for Supabase and records every write, so a test can assert what `processSource`, `runDaily` or `translatePost` wrote, and in what order.
- **Network without a network:** [`lib/pipeline/mock-fetch.ts`](lib/pipeline/mock-fetch.ts) has `mockFetch(t, handler)`, `mockDns(t)`, `withGeminiKey(t)` and `withEnv(t, …)`, which undo themselves when the test ends. It also has `geminiResponse(…)` for model answers, `endlessBody()` to prove a response body was never read, and `TEST_IP`, a public IP literal that `safeFetch` accepts offline.
- **Components:** [`lib/test/render.ts`](lib/test/render.ts) compiles `.tsx` with the project's TypeScript and renders it to static HTML, with `next/link` and `next/navigation` stubbed. A component test looks like this:

  ```ts
  import { createElement } from "react";
  import { render } from "../../../lib/test/render.ts"; // first: it registers the .tsx loader
  const { PostToolbar } = await import("./post-toolbar.tsx");

  const doc = render(createElement(PostToolbar, { postId: 7, language: "en" /* … */ }));
  ```

  A static render runs hooks once and no effects, so it cannot see clicks or state changes. It is verified on Node 24.16; Node 22.13 is untested.
- **A path with `[id]` in it** is read as a glob character class: `node --test "app/library/[id]/post-editor.test.ts"` runs 0 tests and still exits 0. Use `npm test`, or escape it as `[[]id]`.

**What the tests don't cover:** the interactive UI, real RLS policies, live model calls and live websites. Those are checked by hand in a browser (Playwright) against a deployment: sign in, the Radar's read, saved and to-do state, an archived week, one link per source kind, the post page (blocks, images, video and chapters), translation, editing, hiding, re-extraction and its 10-minute cooldown, a `noarchive` page, and no horizontal scroll at 360 and 1280 px.

## Conventions

- **Design language.** Hard corners (`--radius` is 0), system fonts only, hard offset shadows, one fixed theme, and everything fits 360 px with at least 40 px touch targets. The full rules: [CLAUDE.md](CLAUDE.md#design-language--do-not-erode-it).
- **Bilingual.** Every UI string exists in Hungarian and English, in the component's copy object; the reader's choice is the `lang` cookie. Model output that readers see (titles, summaries, key points) is written in both languages. Code, comments and prompts are English.
- **No duplication.** Search before writing a helper, and reuse the shared ones listed in [CLAUDE.md](CLAUDE.md#conventions). `npm run dup` (jscpd) fails above 1% duplication.
- **Relative imports in `lib/`,** with the `.ts` extension, so `node --test` can load the files without a bundler.
- **Commits** follow Conventional Commits, with lowercase, imperative subjects.
- **Dependencies** are pinned to exact versions, and `pnpm-lock.yaml` is committed. `pnpm-workspace.yaml` refuses any package published less than 7 days ago (`minimumReleaseAge: 10080`); never lower it. The lockfile is marked `-diff` in `.gitattributes`, so review its changes with `git diff --text`.

## Content and copyright

Mirroring other people's articles is a managed risk, not a solved problem. What keeps it defensible:

- **Not indexed.** `robots: noindex` in [`app/layout.tsx`](app/layout.tsx).
- **Invite-only.** Every page except `/login` and every API route needs a signed-in member (the cron needs its secret instead), and so do the mirrored images.
- **`noarchive` is honoured.** A page whose robots meta tag or `X-Robots-Tag` header says `noarchive` is not mirrored. The post holds AI-written notes in the model's own words instead, with a link to the original.
- **Attribution.** Every post shows its canonical source link, the author or site, and a © line.
- **Takedown.** Deleting a `sources` row deletes its post. The mirrored images are not deleted with it; remove them with `removeUnusedMedia(db, sourceId, [])`. There is no takedown button yet (see [TODO.md](TODO.md)).

`noindex` and the auth gate are load-bearing, not cosmetic. This posture does not survive the site becoming public, ad-supported or search-indexed.

## Troubleshooting

**The magic link opens the wrong address.** The email templates build the link from `{{ .SiteURL }}`, so it always points at *Authentication → URL Configuration → Site URL*, whichever site you requested it from. Set the Site URL to the address you sign in on, keep that address in the Redirect URLs, and request a new link: old emails keep the old address. A link that fails to verify (expired or already used) lands on `/login?error=1`. If no email arrives, the address may not be invited (the form answers the same either way), or the built-in mailer's hourly limit may be used up; a custom SMTP server fixes that.

**The cron answers 401.** The route rejects every request when `CRON_SECRET` is unset in that environment, and any request whose header isn't exactly `Authorization: Bearer <CRON_SECRET>`. On Vercel, redeploy after setting the variable; locally, compare the value in `.env.local` with the one in your `curl`.

**The Gemini quota runs out.** The Vercel logs show lines like `daily_curate: gemini/<model>: generativelanguage.googleapis.com 429: …`. The fallback route runs next; if that fails too, the cron answers `500 daily_failed` and Library submissions fail with the task's error. Wait for the quota to reset, point the task at another model in `model_settings`, or enable billing in Google AI Studio.

**Migrations fail.**

- `model_settings has no row for "<task>" — apply supabase/migrations`: a migration is missing. The last three tasks come from `20260924000000_post_blocks.sql`.
- `violates check constraint "sources_kind_check"`, or `column posts.blocks does not exist`: `20260924000000_post_blocks.sql` hasn't run.
- `relation "…" already exists`: the file already ran. The migrations are not idempotent; `supabase db push` tracks what ran, but in the SQL Editor you have to.
- Old pages break after `20260925000000_drop_post_body.sql`: that deployment still read `posts.body`. Deploy the block-based code first.

**The GitHub token expired.** GitHub answers 401 to every request carrying an expired token. The daily run then gets no repositories: the cron answer shows `"repos": 0` and the issue has no GitHub top-10, without a warning in the log. GitHub links in the Library fall back to the article extractor (`github extractor failed for <url>: github 401`). Create a new fine-grained token and update `GITHUB_TOKEN`, or remove the variable: GitHub still answers without it, at a lower rate limit. An expiry warning is planned in [TODO.md](TODO.md).

**Submissions are stuck after three failed attempts.** A source gets 3 attempts, counting the one right after submission; the daily cron retries the rest. During an outage that hits every source (a bad key, a used-up quota), each daily run spends one attempt, so after about three days those sources are no longer retried. There is no button to reset them yet (the TODO item "Hibás beküldések kezelése" in [TODO.md](TODO.md)). Once the cause is fixed, reset them in the SQL Editor, and the next cron run picks them up, 10 at a time:

```sql
update public.sources set attempts = 0 where status <> 'done' and attempts >= 3;
```

## Roadmap

[TODO.md](TODO.md) (in Hungarian) holds the setup checklist, the deferred live checks and the prioritized feature list. Designs and plans live in [`docs/superpowers/`](docs/superpowers/):

- [Unified post template and reading tools](docs/superpowers/specs/2026-09-24-unified-post-template-design.md) (spec) and its [M1 plan](docs/superpowers/plans/2026-09-24-unified-post-template-m1.md)
- [UI/UX, reading signals and search](docs/superpowers/specs/2026-09-24-ux-signals-search-design.md) (spec) and its [milestone A plan](docs/superpowers/plans/2026-09-24-ux-a-app-shell.md)
