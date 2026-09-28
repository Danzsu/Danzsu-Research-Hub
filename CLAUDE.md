@AGENTS.md

# CLAUDE.md

The deep reference. AGENTS.md, imported above, has the overview, the commands and the hard rules.

These sections used to live here:

- What this repository is: AGENTS.md (the overview) and ARCHITECTURE.md → Bird's eye view. The provenance note is under ARCHITECTURE.md → Codemap, `docs/`.
- Commands: AGENTS.md → Commands.
- Layout: ARCHITECTURE.md → Codemap.
- UI text (HU/EN): CODE_STYLE.md → HU/EN copy, and ARCHITECTURE.md → Cross-cutting concerns.
- Security: SECURITY.md. Which code may use the admin client: SECURITY.md → Reader vs admin client.
- CI: TESTING.md → Test layers.
- Conventions: CODE_STYLE.md. Its Tests part moved to TESTING.md, and its Supply chain part to SECURITY.md → Supply chain.
- Design language: DESIGN.md.
- Content and copyright: ARCHITECTURE.md → Invariants.

## How content gets in

These are the two writers from ARCHITECTURE.md → Bird's eye view, step by step:

1. **Daily pipeline** — Vercel Cron (`vercel.json`, `0 5 * * *`, 05:00 UTC) → `app/api/cron/daily` → `runDaily` in `lib/pipeline/daily.ts`:
   - upserts the current ISO-week `issues` row;
   - collects candidates from the last 2 days (`collect.ts`, sources in `feeds.ts`): RSS/Atom feeds (25 per feed, `DEFAULT_FEED_LIMIT`, unless the feed sets `limit`; a feed's `exclude` drops, by title or link, its own promotions and pages that repeat its articles), Hacker News via Algolia (stories over 80 points), and GitHub repo search (repos created in the last 7 days, top 25 by stars); URLs already stored in the last 14 days are dropped;
   - shortlists to 40 with `daily_shortlist`, only when there are more than 40 (if every route fails, it keeps the first 40);
   - curates with `daily_curate`: the prompt asks for at most 25 items (not enforced in code) plus a GitHub top-10, which `toDigestRows` caps at 10 (`curatePrompt`, `toDigestRows`);
   - inserts `digest_items` (`ignoreDuplicates` on `url`), upserts `github_top`, then calls the `refresh_must_read` RPC.

   The route catches a `runDaily` failure, logs it, and still runs `retryPendingSources`: up to 10 sources that are not `done` and have fewer than 3 attempts, and it stops starting new ones when less than 120 s of the route's 300 s remain. It answers `200 { issue, candidates, shortlisted, inserted, repos, retriedSources }`, or `500 { error: "daily_failed", retriedSources }`.
2. **Link submissions** — two front doors lead to it, the `/library` form and the taiyaki link chat (see App shell and navigation). `POST /api/sources` inserts a `sources` row as the reader (`detectSource` sets `kind`), answers 202, then `after()` runs `processSource` in `lib/pipeline/ingest.ts` with the admin client:
   1. Bumps `attempts`, then `extract()` (`lib/pipeline/extract/index.ts`) runs the kind's own extractor. On failure the fallback depends on two sets:
      - `RETHROW_FETCH_ERROR` = `{article, x, youtube}`: a `FetchError` from the kind's own extractor is rethrown, with no fallback, and the run fails.
      - `NO_ARTICLE_FALLBACK` = `{pdf, youtube, x}`: any other failure goes straight to metadata-only.
      - Only `arxiv` and `github` go own → article → metadata-only. `article` goes own → metadata-only.
      - `metadataOnly` keeps the title and description (`meta.extractionFailed`) and throws `FetchError` itself when the page is unreachable.
   2. Noise layers 1 and 2 run inside the extractors: `cleanDocument` (DOM chrome) and `filterNoise` (blocks) in `html-noise.ts`, called from `htmlToDrafts` in `html-to-blocks.ts`.
   3. A `noarchive` page (robots meta or `X-Robots-Tag`, which the extractor records as `meta.noarchive`) gets `writeNotes` (`lib/pipeline/summary.ts`) instead: AI-written notes in its own words, `meta.mirrored = false`, nothing mirrored. Otherwise: `limitBlocks` (400 blocks / 200,000 chars, `meta.clipped`) → `aiCleanup` (layer 3, `ingest_cleanup`) for `article`, `github` and `arxiv` only, skipped under 4 blocks, and ignored when it would keep fewer than half + 1 of the blocks → `mirrorImages`.
   4. `mirrorImages` (`images.ts`) downloads up to 30 images (5 MB each, 4 at a time, a 90 s budget) through `safeFetch`, re-encodes them to AVIF, or animated WebP for animated images, at 640 and 1280 px, drops images under 64 px, and uploads them to the private `media` bucket (see Database → Storage). An image already mirrored for the same `originalUrl` is reused; a failed download, or an image none of whose variants encodes, keeps the block with `path: null`.
   5. `summarize` (`ingest_article`) writes the bilingual title, summary, key points and tags, unless the extractor already did (YouTube).
   6. Upserts `posts` on `source_id` with `blocks_hu: null` and `extracted_at: now`, deletes Storage objects the new blocks no longer reference (`removeUnusedMedia`), and marks the source `done`.

   On failure, `failureUpdate` writes only `error` when a post already exists (it stays published, and the post page shows that error to the submitter; the next good run clears it), otherwise `status: "failed"`. The pipeline never writes `overrides` or `hidden_blocks`.

   `POST /api/sources/[id]/retry` sends the submitter's own `failed` source back to `pending` with `attempts` reset to 0 (`retrySource` in `lib/my-sources.ts`), so a retry killed at 300 s is still picked up by the daily cron, and runs `processSource` in `after()`.

The extractors, one per `SourceKind` (`lib/pipeline/util.ts`):

| Kind | Extractor | What it does |
| --- | --- | --- |
| `article` | `extract/article.ts` | `safeFetch` (8 MB), a PDF content type goes to the PDF path; `readPageMeta` → `cleanDocument` → Readability → `htmlToBlocks`; throws under 200 characters of text |
| `youtube` | `extract/youtube.ts` | oEmbed (400/404 → `FetchError`), then one `ingest_video` call for the summary and chapters; the video is embedded, not mirrored; a Gemini failure leaves a video-only post (`meta.extractionFailed`) |
| `arxiv` | `extract/arxiv.ts` | export.arxiv.org metadata, then `arxiv.org/html/<id>` parsed like an article; without HTML, the abstract plus a PDF transcription; either path keeps its page's or PDF's `noarchive` |
| `github` | `extract/github.ts` | REST repo info and the README as HTML (404 = no README, anything else throws); a `repo` block, then README blocks with repo-relative image URLs rewritten to raw.githubusercontent.com |
| `x` | `extract/x.ts` | publish.twitter.com oEmbed: one post's text, no thread or images (`meta.truncated`); every failure is a `FetchError` |
| `pdf` | `extract/pdf.ts` | `safeFetch` (20 MB) → `ingest_pdf` transcription into at most 400 blocks; the prompt stops at roughly 12,000 words |

`lib/llm.ts` is two `fetch` wrappers (no SDKs) behind `generate(db, task, schema, prompt, options?)`. `options` is `{ youtubeUrl?, pdfBase64? }`; with either set, only Gemini routes run. Every response is validated with a zod schema (`zod/v4`, which also produces the JSON Schema sent to the model), each call has a 120 s timeout, a route whose API key is unset is skipped, and when every route fails the error names each one, including why a route was skipped (its key unset, or a non-Gemini route given video or PDF input). **Which model runs which task lives in the `model_settings` table**, one row per task with an optional fallback; editing a row takes effect on the next run, no redeploy. Pin exact versions there, not `*-latest` aliases. A task with no row throws `model_settings has no row for "<task>"`.

| Task | Called by | Seeded route → fallback |
| --- | --- | --- |
| `daily_shortlist` | `shortlist()` in `daily.ts` | groq `llama-3.3-70b-versatile` → gemini `gemini-3.5-flash-lite` |
| `daily_curate` | `runDaily` | gemini `gemini-3.8-flash` → `gemini-3.7-flash` |
| `ingest_article` | `summarize` and `writeNotes` in `summary.ts` | gemini `gemini-3.5-flash-lite` → `gemini-3.8-flash` |
| `ingest_video` | `extractYoutube` (Gemini only, enforced by a check constraint) | gemini `gemini-3.8-flash` → `gemini-3.7-flash` |
| `ingest_pdf` | `extractPdfResponse` | gemini `gemini-3.8-flash` → `gemini-3.7-flash` |
| `ingest_cleanup` | `aiCleanup` in `cleanup.ts` | groq `llama-3.3-70b-versatile` → gemini `gemini-3.5-flash-lite` |
| `translate_post` | `translatePost` in `lib/translate.ts` | gemini `gemini-3.5-flash-lite` → `gemini-3.8-flash` |

The seeds are in `supabase/migrations/20260923010000_model_settings.sql` and `20260924000000_post_blocks.sql`; the live table is the truth. The `Task` union in `lib/llm.ts` and the `model_settings_task_check` constraint are kept in sync by hand.

## Auth

Supabase Auth, magic link. **Sign-ups are disabled in the Supabase dashboard** — that is the invite allowlist; members are added with *Authentication → Invite user*. `app/auth/login` calls `signInWithOtp({ shouldCreateUser: false })` and always answers the same, so it cannot enumerate members.

`proxy.ts` refreshes the session on every request and redirects signed-out requests to `/login?next=…`, except under `/login`, `/auth/`, `/api/` and `/media/` (`isPublicPath` in `lib/public-paths.ts`; the `/api/*` and `/media` routes return 401 themselves). `/dev/*` passes without a session in development only (`lib/public-paths.ts`). Pages and API routes that act as the reader call `getReader()` from `lib/supabase/server.ts`, which returns the RLS-scoped client and the viewer together, or null; `getViewer()` is the identity-only form (the `/media` route and `app/(app)/layout.tsx`). `getReader()` is wrapped in React's `cache()`, so within one server render the layout's `getViewer()` and the page share one client and one `getClaims()`; `proxy.ts` runs in its own request and makes its own. The five identity pages (`/`, `/archive`, `/archive/[week]`, `/library`, `/library/[id]`) declare `export const dynamic = "force-dynamic"`.

Email templates (Supabase → Authentication → Email Templates) should link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (Magic Link) and `…&type=invite` (Invite user). `app/auth/callback` handles both that and the default `?code=` form; the token-hash form also works when the link is opened on another device. The post-login target always goes through `safeNext`.

The shared project's Site URL is the production domain. Never change it: every member's magic link follows it. To sign in locally against the shared project, replace the emailed link's origin with `http://localhost:3000`; the token-hash callback verifies on any origin.

## Server path

What each signed-in page asks Supabase for, on a warm instance (the ECC key verifies `getClaims()` locally):

| Page | Queries |
| --- | --- |
| `/` | `getRadar` (one query: the latest issue with its `digest_items` and `github_top` embedded), then `getReaderSeed` (2 in parallel): 3, two in a row, because the latest week's id comes from the first answer |
| `/archive/[week]` | `archivedWeek` ∥ `getReaderSeed`: 3, one deep; a closed week from the cache: 2 |
| `/archive` | `archiveList`: 1, or 0 from the cache |
| `GET /api/state?issue=` | `getReaderState`: 2 in parallel |

- **The reader state narrows to one week.** `item_states` has no issue column, so `getReaderState(db, issueId)` filters with `.like("item_id", weekItemPattern(issueId))`, `'2026-W38'` → `'%-2026w38-%'` (`lib/pipeline/util.ts`), and leaves the `post:<id>` keys and other weeks out. The to-dos stay whole. The Radar pages seed the store with `getReaderSeed`, which adds the week and the render's time (Reader state, below).
- **The two caches** (`lib/content.ts`, `unstable_cache` from `next/cache`):
  - `closedWeek(week)`, key `["closed-week", "v1"]` plus the week, `{ revalidate: 86400 }`, no tag, since a closed week never changes;
  - the archive list, key `["archive-list", "v1"]`, `{ revalidate: 86400, tags: ["archive"] }` (`ARCHIVE_TAG`);
  - both read with the admin client, and both are reached only through `archivedWeek(reader, week, now?)`, which sends a week before the current ISO week to the cache and every other week to the reader's own client, and `archiveList(reader)`;
  - the daily cron calls `revalidateTag("archive", { expire: 0 })` after every run, good or failed, because the `issues` upsert can't say whether it opened a new week; `{ expire: 0 }` makes the next `/archive` refill the list instead of serving it stale. It's best-effort: Next only applies a queued revalidation once the route returns a response, so a crash in `retryPendingSources` or the route hitting its own time limit drops it (`app/api/cron/daily/route.ts`); the list's own one-day `revalidate` is the backstop;
  - `getRadar` and the list's loader throw on a failed query, so a failure is never cached, and the page shows `app/error.tsx`.
- **The rules** the caches keep are in ARCHITECTURE.md → Invariants, why they may use the admin client in SECURITY.md → Reader vs admin client, and the functions' region in README.md → Deploy. Next 16 replaces `unstable_cache` with `use cache`, which needs Cache Components (TODO.md).

## App shell and navigation

Every signed-in page lives under `app/(app)/` and gets `app/(app)/layout.tsx` → `AppShell`. `/login`, `/auth/*`, `/api/*`, `/media` and `/dev/*` stay outside. Pages still check the session themselves: a layout cannot read the path for `?next=`. How the shell looks: DESIGN.md → Components.

- **One list:** `lib/nav.ts` holds the items (Radar, Library, Keresés, Archívum, and the dimmed "hamarosan" views) and `activeNavId()`. Both navigations render from it.
- **Mobile, below `md`:** the bottom bar in `app-shell.tsx`, five slots: Radar, Library, the taiyaki (raised 16px out of the bar), Search, Több. `lib/nav.ts` says where each item goes: `MOBILE_BAR_NAV` (the three page slots, the taiyaki after the first `MOBILE_CHAT_SLOT` of them) and `MOBILE_MORE_NAV` (the items marked `mobileMore`, today Archívum). "Több" opens a bottom Sheet with Archívum, the language toggle, the coming views and sign-out, and focuses Archívum. On an Archívum page the "Több" slot carries the active mark (`inMobileMore`, `data-active`), and following the link closes the Sheet (`NavEntry`'s `onClick`).
- **Desktop:** `app/components/desktop-nav.tsx`, variant A (sidebar), collapsible to an icon rail via a toggle button at its foot (`aria-expanded`, localized "Collapse sidebar" / "Expand sidebar"). In rail mode every entry shrinks to an icon with its accessible name kept (`aria-label` or sr-only text; the logo link carries `aria-label="NEON NEWS RADAR"`), and every icon (the menu entries, language, help, sign-out and expand) shows its name as a hover/focus tooltip (`NavTooltip` in `nav-parts.tsx`). The choice persists in the `nav` cookie (`full` | `rail`, same shape as `lang`); `getNavMode()` (`lib/language.ts`) reads it server-side through `readNavMode()` (`lib/nav-mode.ts`), for `app/(app)/layout.tsx` and the preview, so the width is correct on first render. Variants B (top bar) and C (icon rail as the default) are a new `DesktopNav` with the same props that reuses `nav-parts.tsx`; no other file changes.
- **Search** is a placeholder dialog until milestone C (`SearchSoon`); `⌘K` / `Ctrl K` and `/` already open it.
- **Loading skeletons:** each page shape has its own `loading.tsx`, rendering `RadarSkeleton` (`/`, `/archive/[week]`), `ListSkeleton` (`/library` with the form's block, `/archive`) or `PostSkeleton` (`/library/[id]`) from `app/components/page-skeletons.tsx`. A `loading.tsx` wraps its folder's page and every segment under it, so `/`, `/library` and `/archive` sit in the route groups `(radar)`, `library/(list)` and `archive/(list)`: the list's skeleton never flashes before a post, nor the ink archive's before a cream week. The surface paints at once and the placeholders fade in after 150ms (DESIGN.md → Components → Loading and pending feedback). The post page's own query links (Original / Hungarian, Edit, Cancel) re-render its segment, so they show the post's skeleton too. On a hard load the `(app)` layout reads cookies first, so the skeleton comes with the shell.
- **Pending dot:** `PendingDot` (`nav-parts.tsx`) reads `useLinkStatus()`, so it sits inside a `<Link>`: in every `NavEntry` link (at the row's end, or on the icon with `dotOnIcon` in the rail and the bottom bar), and on the archive's week cards and the Library's post cards. A prefetched link skips the pending state and shows its skeleton instead; when two links are clicked in quick succession, only the last one's dot shows.
- **Refresh bar:** the five refreshes a reader starts go through `useRefresh()` (`refresh-bar.tsx`), one `useTransition` in the `RefreshProvider` the shell mounts inside its `LanguageProvider`: Save (`post-editor.tsx`, with a push), Translate (`post-toolbar.tsx`, with a push to `?text=hu`), the language toggle on a page that doesn't switch in place, a Library submission and the link chat's send. The bar shows while any of them runs; the Library's background refresh (`refresh-while-processing.tsx`) calls `router.refresh()` itself and never lights it. `useRefresh` throws outside the provider, like `useLanguage`.
- **Prefetch:** the "Több" sheet is closed, so Next never prefetches its links. `MobileNav` calls `prefetchWhenIdle` (`lib/idle-prefetch.ts`) for every `MOBILE_MORE_NAV` href once the browser is idle (`requestIdleCallback`, or 1 s on), and again on each `onInvalidate`, because a `router.refresh()` clears the segment cache. Production only: in development it would fetch the real pages from the preview (Next 16.3.4 skips dev prefetches itself too). A prefetch that throws is logged and skipped.
- **Link chat (taiyaki):** `link-chat.tsx`, `chat-thread.tsx` and the framework-free logic in `lib/link-chat.ts`; how it looks is in DESIGN.md → Components → Link chat. `TaiyakiButton` is both the desktop corner button and the mobile bar's centre slot, each with `aria-expanded` and `aria-controls` on the one panel (`CHAT_PANEL_ID`).
  - **The panel:** `LinkChat` is one Radix Dialog: non-modal on desktop, where only Esc and its close button close it, so a link can be copied from the page behind; a modal bottom Sheet on mobile. On desktop it sits right after its opener in tab order (`tabPastPanel`): Shift+Tab off its first stop goes to the opener, and Tab off its last to the first stop after the opener (or back to the opener when there is none); the key is cancelled only once the focus has really moved.
  - **Focus and keys:** the field gets the focus on open, and closing hands it back to the button that opened it, or to the taiyaki that is showing if that one is hidden now (`shownOpener`). Enter sends; Shift+Enter, an IME composition and keyCode 229 don't (`isSendKey` in `lib/keymap.ts`), and the field has `enterKeyHint="send"`. While a send is on its way the field and Send are `aria-disabled`, not `disabled`, so the focus stays, and so is ÚJRA, reading "ÚJRA…", while its retry is on its way; a tap on Send never leaves the field, and the focus returns to the field after a send. On `/library` a sent link also refreshes the page through `useRefresh()` (Refresh bar, above), so the Library list shows it too; the preview, one path for all its views, refreshes on each.
  - **The logic:** `parseLinkMessage` takes the first http(s) word as the link, with sentence punctuation stripped unless the link opened the bracket itself; the rest is the note, and `moreLinks` says whether there were more links. `toThread` turns the sources into thread entries, every href through `safeHref`. `createLinkChat` loads `GET /api/sources/mine` on `open()` and polls it every 4 s (`POLL_MS`) while the panel is open, the tab is visible, and a source is pending or the last load was out of reach, for at most `MAX_POLLS` (150) fetching ticks. A send's 202, or a retry's 202 or 409, clears the stale local replies and reloads at once, which restarts the count. A 401 on the list stops the polling and says `signed_out`, once: the dedupe is in `say`, so it also covers a send's or a retry's own 401. `open()` and `close()` both drop the local replies and `unreachable`.
  - **The thread:** the greeting, a loading line until the first answer, the reader's 10 latest submissions (oldest first) with a reply per status, then the local replies, which live only while the panel is open. A refused ÚJRA is the exception: its reply goes into its own entry, right under the button, because a reader who scrolled up to click it can't see the thread's end (`retryNotices`). It scrolls just far enough to show if it lands out of view, the entry's next ÚJRA clears it, and a 401 also puts the one `signed_out` at the end. Each bubble starts with an sr-only speaker ("Te:" / "You:", "Taiyaki:"), and the list is keyed on its first load, so the loaded list mounts as a fresh live region. It keeps its end in view only for a reader within 40px of it: a `ResizeObserver` re-pins it with an instant scroll whenever the scroller or its content changes size (a new reply, a reply that grows in place, the field growing, the keyboard or the window). Only the reader's own send forces the pin: directly, in the frame after it settles, so a send that changed no size leaves nothing armed for a later resize. A retry doesn't.
- **Undo toast:** `toasts.show({ kind, undo?, commit? })` from `undo-toast.tsx`. One at a time, 5 s, `aria-live="polite"`; a new toast makes the previous action final, and `pagehide` does too. Read, delete and (milestone B) rating use it, and so does every failed write.
- **Reader state:** `lib/reader-store.ts` (optimistic, writes per key in click order, rollback to the last value the server confirmed) behind `use-reader-state.ts`. The Radar and archived-week pages seed it on the server with `getReaderSeed` (`lib/content.ts`): the week's flags and every to-do (`getReaderState`, which `GET /api/state` also answers from), the week's id and the render's `Date.now()`, so the first paint already has the final unread-first order. `seedNeedsLoad` (`lib/reader-store.ts`) decides whether the mount GETs `/api/state?issue=`: a seed's first mount in the tab comes from a fresh render and doesn't; a seed the tab has mounted before is Back restoring it from the router cache, and does; a null seed (the server's query failed) always does. There is no clock threshold, because the server's and the phone's clocks can disagree. `revalidateSeed` records the mount from an effect, so a server render never does. A GET refreshes flags and to-dos, never `loadedStates`, which the feed sorts by. Library posts use `item_states` too, keyed `post:<id>` (`postStateKey`); opening a post marks it read (`mark-post-read.tsx`) and dims its Library card. Back restores the Library's cached list, so `opened-posts.tsx` also dims a card whose post was opened in this tab.
- **WebMCP:** `use-model-context-tools.ts` registers two `document.modelContext` tools for in-browser agents; a no-op elsewhere.

## Keyboard (desktop)

`lib/keymap.ts`'s `SHORTCUTS` maps keys to actions: `j`/`k` next/previous card, `o` open (marks read), `r` toggle read, `l` toggle later, `z` undo, `⌘K`/`Ctrl K`/`/` search, `[` collapse/expand the sidebar, `?` help. `use-shortcuts.ts` binds it. Nothing fires in an input, textarea, select or contenteditable, or mid-composition; inside an open dialog only `z` does, so Undo works while the non-modal reader panel is open. A held key repeats only `j`/`k`: the toggles ignore key repeat. Letters fire only with no Ctrl/⌘/Alt held (Ctrl/⌘+K is search); a non-letter key (`/`, `?`, `[`) also fires with Alt or AltGr (Ctrl+Alt), never with ⌘, because the Hungarian layout types `[` as AltGr+F. Card scrolling honours `prefers-reduced-motion`. A new shortcut is one `SHORTCUTS` row plus a handler; the help dialog lists it by itself.

## Offline preview

AGENTS.md → Commands lists the URLs. The preview renders the real view components on `lib/fixtures.ts`, with no Supabase keys and no sign-in. `/dev/preview/post` is a separate path because it renders in the server's language, so the language toggle refreshes it. `proxy.ts` lets `/dev/` through only when `NODE_ENV` is `development`, and both pages call `notFound()` otherwise. `&slow=1` (`previewDelayMs`) makes the link chat's `memoryTransport` hold every answer 800 ms, so its in-flight states show; every preview link keeps it, and the view links keep `&fail=1`. ARCHITECTURE.md → Invariants covers how the preview stays away from real data, and where it doesn't. What to check there: TESTING.md → Test layers.

## Database

The schema lives in `supabase/migrations/`. [README.md → Migrations](README.md#migrations) lists the files and what each one adds. README.md → Recipes says how to add and apply one. `20260925000000_drop_post_body.sql` runs only after the block-based code is live. It drops `posts.body`, which the current code no longer reads or writes.

RLS is on for every table:

- Content (`issues`, `digest_items`, `github_top`, `posts`): readers `select`; only the secret key writes. The one exception: `update_post_overrides(p_post, p_overrides, p_hidden)`, a `security definer` RPC that checks the caller submitted the post's source (else `42501`) before writing its `overrides` / `hidden_blocks` columns — RLS can't restrict individual columns, so this RPC is the only way a reader writes to `posts` (`savePostEdits` in `lib/post-edit.ts`).
- `sources`: readers `select` (every row: code that lists "my" sources filters on `submitted_by` itself, `listMySources`) and `insert` (stamped with `auth.uid()`); no reader updates, so the retry's claim runs with the admin client.
- `item_states`, `todos`: own rows only; `user_id` defaults to `auth.uid()`, so app code never names the user.
- `model_settings`: RLS on with no policies — only the secret key reads it.
- `archive_issues`: a `security_invoker` view, one row per issue with its item count, reading minutes and top title.
- `refresh_must_read(p_issue)`: sets an issue's `must_read` flags (ARCHITECTURE.md → Invariants); executable by `service_role` only.

**Storage:** a private `media` bucket holds mirrored images, keyed `<source_id>/<sha1-16>-<width>.<avif|webp>` — only the pipeline's admin client writes to it. Reads go through the session-checked `app/media/[...path]/route.ts`, never a signed URL. Deleting a `sources` row cascades to its post in Postgres, but not to its Storage objects — those are removed separately with `removeUnusedMedia(db, sourceId, [])`, which a future takedown feature must call.

## Routes

| Route | Auth | Behaviour |
| --- | --- | --- |
| `GET /api/state` | `getReader()` | `?issue=<week id>`: `{ states, todos }` for the caller, the flags narrowed to that week's items (`getReaderState`, also the Radar pages' server-side seed); 400 `invalid_issue` for a missing or malformed week, 500 `db_error` |
| `POST /api/state` | `getReader()` | `parseStateAction` (`lib/state.ts`): `set_read`, `set_saved`, `add_todo`, `set_todo`, `delete_todo`. 400 `missing_item` (missing, empty or null `itemId`), `invalid_item` (a non-string one), `missing_text`, `invalid_id`, `unknown_action`. Item ids are cut to 120 chars, todo text to 180; a flag other than `true` counts as false |
| `POST /api/sources` | `getReader()` | 400 `invalid_url`, 409 `already_submitted` (with `postId` when the link already has a post), 500 `insert_failed`, else 202 `{ ok, id }` and `processSource` in `after()` |
| `GET /api/sources/mine` | `getReader()` | `listMySources`: `{ sources }`, the caller's 10 latest (`MINE_LIMIT`), newest first, each with `post: { id, title }` or null (the submitter's title override wins, `shownTitle`); 500 `db_error` |
| `POST /api/sources/[id]/retry` | `getReader()`, then admin | `retrySource`: 404, 403 `forbidden` (not the submitter), 409 `not_failed` (not `failed`, or a concurrent retry won the compare-and-swap on `id` + `submitted_by` + `status = 'failed'`, which writes `status = 'pending'`, `error = null`, `attempts = 0`), 500 `db_error`, else 202 and `processSource` in `after()`. No cooldown; `retrySource`'s `ponytail:` note names the race it leaves with a daily cron run of the same source |
| `PATCH /api/posts/[id]` | `getReader()` | `savePostEdits`: 400 `invalid` (the body), 403 `forbidden` (not the submitter), 404, 500 `db_error` |
| `POST /api/posts/[id]/translate` | `getReader()`, then admin | 404, 409 `translation_stale`, 502 `translation_shape` / `translation_failed`, else `{ ok: true }` |
| `POST /api/posts/[id]/reextract` | `getReader()`, then admin | 403 unless the submitter, 429 `cooldown` with `retryAfter` (seconds), 404, 500 `db_error`, else 202 and `processSource` in `after()` |
| `GET /api/cron/daily` | `Authorization: Bearer $CRON_SECRET` | 401 `unauthorized` when the secret is unset or doesn't match; see How content gets in. After every run it drops the archive list's cache (Server path) |
| `GET /media/[...path]` | `getViewer()` | See SECURITY.md → `/media` |

Error bodies follow CODE_STYLE.md → Error handling; `/media` answers plain text. The three `posts/[id]` routes and `sources/[id]/retry` are wrapped in `postRoute` (`lib/api.ts`): 401 `unauthorized` when signed out and 404 `not_found` for an id that isn't a positive integer, the same answer as a missing row; their result maps share `POST_ERRORS`. The cron, sources, `sources/[id]/retry`, translate and reextract routes set `maxDuration = 300`.

**Edit, translate and re-extract** (the submitter's tools on `/library/[id]`):

- **Save** (`?edit=1`, `PostEditor`): the fields and buttons sit in a `<form>`, so Enter in a title field saves and the browser enforces `required` / `maxLength`; Save is its only submit button. `editPayload` sends `title` / `summary` only when the draft differs, trimmed, from the model's own text (`generatedTitle` / `generatedSummary`), so an unchanged field never freezes the model's text as an override. An omitted field clears its override: the RPC replaces `overrides` wholesale. `savePostEdits` drops hidden ids that aren't among the post's blocks. Caps: `TITLE_MAX` 300, `SUMMARY_MAX` 2000 (`lib/overrides.ts`), 400 hidden ids.
- **Re-extract**: `requestReextract` enforces a 10-minute cooldown from `extracted_at` (`REEXTRACT_COOLDOWN_MINUTES` in `lib/pipeline/util.ts`) and claims it with a compare-and-swap update on `posts.extracted_at`, guarded by the value just read (`.is(null)` for a never-extracted post). The loser of two overlapping requests gets 429 too. The claim itself counts as extraction time, so a failed re-extraction also waits 10 minutes.
- **Translate** (`translatePost`): a no-op when `blocks_hu` already holds a translation or nothing is translatable. It sends only text to the model, in chunks of about 15,000 characters with at most 3 in flight, and rejects an answer whose shape doesn't match the blocks. The `blocks_hu` write is the same compare-and-swap on `extracted_at`: if a re-extraction landed meanwhile, 0 rows match and the route answers 409 `translation_stale`.

## Hand-authored components

- **`components/ui/progress.tsx`, `separator.tsx`, `skeleton.tsx`, `textarea.tsx`** — written in this project's house style (function components, `data-slot`, unified `radix-ui`). The registry still serves forwardRef-era source, so pasting it would have broken the convention *and* omitted `data-slot="progress-indicator"`, which the reader panel targets to paint the bar signal-orange.
  `progress.tsx` also forwards `value` to Radix's Root. The registry's version keeps it back, which leaves every bar `data-state="indeterminate"` with no `aria-valuenow`; `app/components/shell.test.ts` pins it.
- **`components/ui/sheet.tsx`, `dialog.tsx`**: the close button is patched to the house 40px square (DESIGN.md → Components); the stock one is a ~16px target. Both content components also take an optional `closeLabel` (default `"Close"`), the button's sr-only name, so a caller passes its localized `copy.close`.
- **`components/ui/sidebar.tsx`** — fetched read-only from the registry and hand-patched (import paths, `Slot.Root`, Tailwind 4 `w-(--sidebar-width)` instead of the v3 square-bracket variable form, which compiles to invalid CSS). See the header comment in the file. The app no longer renders it (the app shell has its own nav); it stays until the unused-component cleanup.

`skeleton.tsx` deliberately uses `bg-primary/10` rather than upstream's `bg-accent`, because `--accent` is the signal orange here and a stock skeleton would pulse bright orange.

## Data contract

`DigestItem`: `id` (≤120 chars, unique, and append-only: ARCHITECTURE.md → Invariants), `category`, `mustRead?`, `score` (0–100), `readMinutes`, `publishedAt`, `publishedLabel`, `source`, `url`, `tags[]`, and `title`/`summary`/`why` each as `{ hu, en }`. Only those three fields are bilingual; `tags`, `source`, `score` are not. Tags come from `digestTags` in `data/digest-types.ts`; the model output schema enforces it.

`githubTop10` is an array of **positional 3-tuples** `[repo, focus, url]`, not objects. `must_read` is set by `refresh_must_read` (ARCHITECTURE.md → Invariants). `CurrentIssue.id` is the week's id (`'2026-W38'`): the issue's, or the current ISO week's before its first issue. The reader state's week filter and the client's reload use it.

**Library posts use a separate block model, not `DigestItem`.** `lib/blocks.ts`'s `blockSchema` — a `zod/v4` discriminated union (`heading`, `paragraph`, `list`, `quote`, `code`, `image`, `video`, `chapters`, `repo`, `divider`) — is the one shape every source is converted into and the one shape `app/components/post-blocks.tsx` renders from. Inline text is a list of spans with optional `href`, `bold`, `italic` and `code`. Extractors build `BlockDraft`s and call `assignIds`, which gives each block its content-addressed id (ARCHITECTURE.md → Invariants). `posts.blocks` holds the original-language blocks, `posts.blocks_hu` the on-demand Hungarian translation; both are read through `parseBlocks`, which drops any individual block that fails validation rather than failing the whole page (an empty or unparseable `blocks_hu` means "not translated"). `overrides` and `hidden_blocks` are read through `readOverrides` / `readHiddenBlocks`, which validate each field on its own. `posts.meta` carries the page's notices: `mirrored`, `noarchive`, `extractionFailed`, `truncated` and `clipped`. `toPost` (`lib/post-row.ts`, server-only because it parses the row's jsonb) turns a row into the page's `Post` (`lib/post-view.ts`), where a submitter's override wins over the model's title (`shownTitle`, shared with the link chat) and summary, and `lastError` is the `sources.error` of the single-post embed.
