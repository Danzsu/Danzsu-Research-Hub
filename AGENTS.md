# AGENTS.md

NEON NEWS RADAR (the repository is Danzsu Research Hub) is a private, invite-only, bilingual (HU/EN) AI-research hub: Next.js 16 (App Router, React 19) on Vercel, with its data in Supabase. It has two views. The **Radar** is a weekly digest that a daily cron curates, and the **Library** turns links that members submit into block-based posts.

## Read next

- [ARCHITECTURE.md](ARCHITECTURE.md): how the parts fit together, with the codemap, the invariants and the boundaries.
- [DESIGN.md](DESIGN.md): the design system, with tokens, layout, the UI kit, and do's and don'ts. Read it before any UI work.
- [TESTING.md](TESTING.md): the test layers, how to run tests, the helpers, the conventions and the pitfalls.
- [SECURITY.md](SECURITY.md): how to report a vulnerability, the security model, and the supply-chain rules.
- [CODE_STYLE.md](CODE_STYLE.md): naming, imports, TypeScript, React, the copy objects, error handling, the shared helpers and commits.
- [CLAUDE.md](CLAUDE.md): the deep reference for the pipeline, auth, the app shell, the database, the routes and the data contract.
- [README.md](README.md): onboarding for humans, covering setup, environment, deploy, recipes and troubleshooting.

## Commands

```bash
corepack pnpm@11.25.0 install --frozen-lockfile
cp .env.example .env.local   # or: vercel env pull --environment=production .env.local

npm run dev        # next dev on :3000
npm run build
npm run start
npm run lint       # eslint .
npm test           # node --experimental-strip-types --no-warnings --test "lib/**/*.test.ts" "app/**/*.test.ts"
npx tsc --noEmit
npm run dup        # jscpd app lib proxy.ts scripts --min-lines 6 --min-tokens 60 --threshold 1 --reporters console
```

Before every commit, all five checks must pass, in this order: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`.

- **Offline preview** (run `npm run dev` first): `/dev/preview?view=radar|radar-empty|library|library-empty|archive|archive-empty`, plus `&fail=1` to make every write fail as if offline. `/dev/preview/post` shows every block type and banner. It works in development only, needs no keys and no sign-in.
- **One cron run:** `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily`.
- **One link without the UI:** `npm run ingest -- <url>` submits and processes one URL against the Supabase project in `.env.local`, as the first user `auth.admin.listUsers()` returns. That project is production, since it is the only one, so this writes real rows, and so does the cron curl. Running the same URL twice fails, because `sources.url` is unique.
- **Node:** use Node 24 LTS. `engines` allows `>=22.13.0`, but the render harness is verified on 24.16 only. `corepack enable` fails with EPERM under nvm-for-windows, which is why pnpm runs as `corepack pnpm@…`. Newer Node releases don't bundle corepack, so install the version Node 24.16 ships with: `npm i -g corepack@0.35.0`.

## Hard rules

- **Never run `npx shadcn add`.** It rewrites `app/globals.css` and `components/ui/button.tsx`, which the theme and the house variants depend on (DESIGN.md → Do's and Don'ts).
- **Never run `supabase db push`.** It would apply `20260925000000_drop_post_body.sql` early, while production still reads `posts.body`. This holds until the TODO.md item "Csak az M1 deployja után" is done. The CLI isn't set up here anyway (there is no `supabase/config.toml`).
- **Migrations only add, and a person applies them by hand.** Each one is a new `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, run in the Supabase SQL Editor in filename order, one file at a time. While older code is deployed a migration may only add (columns, wider checks). A column is dropped only once no deployed code reads it. List each new migration in README.md → Migrations.
- **A Radar `item.id` is append-only forever.** It keys every reader's read/saved state (ARCHITECTURE.md → Invariants).
- **Dependencies:** pin exact versions, commit the lockfile, and never lower or bypass the 7-day release age (SECURITY.md → Supply chain).
- **Imports in `lib/` are relative `.ts` paths, never `@/`,** so `node --test` loads them without a bundler (CODE_STYLE.md → Imports).
- **UI text lives in one `{ hu, en }` copy object per component,** with both languages and no i18n library (CODE_STYLE.md → HU/EN copy).
- **Never add a `NEXT_PUBLIC_` variable or raw HTML (`dangerouslySetInnerHTML`), and fetch every user-supplied or page-derived URL through `safeFetch`.** The reasons are secrets, XSS and SSRF (SECURITY.md).
- **The preview never touches real data.** New fixtures get negative ids, and preview writes go to the in-memory senders (ARCHITECTURE.md → Invariants).
- **Never push.** The owner pushes.
- **Commits** use Conventional Commits with a lowercase, imperative subject, carry no attribution lines, and are made with an explicit pathspec (CODE_STYLE.md → Commits).

## Testing

`npm test` runs every test. TESTING.md has the layers, the helpers and the conventions. These are the three traps that bite most often:

- In a `node --test` path, write every `[` as `[[]` (`"app/(app)/library/[[]id]/post-editor.test.ts"`). Unescaped, the path runs 0 tests and still exits 0.
- Call `mockDns` at most once per test body. For a second answer, nest `t.test()` subtests.
- Never pass a linkedom node to `assert`. Compare an attribute, `textContent` or a count.

## Working agreements

- After every significant part, run a quick test and review your own diff very critically before you move on.
- For UI work, do a runtime smoke check on `/dev/preview` (TESTING.md → Test layers) before you call it done.
- No code duplication. Search before you write a helper, and reuse the shared homes (CODE_STYLE.md → No duplication). `npm run dup` must report no new clone.
- If the permission system blocks a command, stop and report it. Never run a variant.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
