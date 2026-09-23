# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**Danzsu Research Hub** (app name: *NEON RADAR — Weekly AI Intelligence*) — a private, invite-only, bilingual (HU/EN) AI-research hub, hosted on **OpenAI ChatGPT Sites**.

It was reconstructed from a flat archive of 93 files with scrambled filenames. **Filenames now match contents**; see [docs/ARCHIVE-MAP.md](docs/ARCHIVE-MAP.md) for the provenance of every file. The original archive is preserved outside the repo under `Desktop/chatgpt-oldal/Danzsu-Research-Hub` and can be discarded once this tree is trusted.

## Runtime — read this before designing anything

The app runs as a **Cloudflare Worker** under `vinext` (Next.js 16 App Router + React 19 RSC compiled by Vite), hosted by ChatGPT Sites. Three constraints shape every decision:

1. **No git-based publish, no programmatic deploy.** Deploying means a human asks ChatGPT to redeploy the saved version. **Therefore content must never live in the bundle** — it is read from the database at request time. Anything that would require a redeploy per content change is wrong by construction.
2. **Hosted secrets exist** (Site settings, not code; a change requires a redeploy). **Outbound HTTP/HTTPS/WebSockets work; raw TCP does not.** So Postgres is reachable only over PostgREST/HTTPS from the Worker — no `pg`, `postgres.js`, Prisma or Hyperdrive. Bulk work and migrations run from GitHub Actions, which does have TCP.
3. **No cron and no `scheduled()` handler** — the Worker entry is `main: "vinext/server/fetch-handler"`. GitHub Actions cron is the only scheduler in the system.

### Reserved paths

`/signin-with-chatgpt`, `/signout-with-chatgpt` and `/callback` are owned by the platform's dispatch layer. **Never implement app routes for them.** `/callback` is bare and generic, so an OAuth redirect must go somewhere else (e.g. `/api/auth/callback`).

### Auth

A dispatch layer injects `oai-authenticated-user-id`, `-user-email`, `-user-full-name` (+ `-encoding`) headers; inbound headers with that prefix are stripped, so they cannot be forged. `app/chatgpt-auth.ts` reads them via `next/headers`; the module is server-only. Sign-in must start as a **top-level navigation** (`<a target="_top">`) — never `fetch`, XHR or a prefetching link. Pages that depend on identity need `export const dynamic = "force-dynamic"`.

`userId` is the durable per-site user key; email is display-only. SIWC establishes identity but **not** membership — the invite allowlist is the app's own responsibility.

> ⚠️ **Known auth bypass.** `app/lib/user.ts` returns a hard-coded preview user whenever `process.env.NODE_ENV !== "production"`. This must be removed before any real data is attached to identity. The dev server already injects genuine `local_seedy` headers, so the fallback is unnecessary as well as unsafe.

## Commands

```bash
# Install. DO NOT use `npm run install:ci` on Windows — see below.
# `corepack enable` fails with EPERM under nvm-for-windows (it cannot write
# shims into the Node install dir without elevation), so invoke pnpm through
# corepack directly instead of relying on a global shim.
export SITES_PNPM_SHARED_STORE="$PWD/.sites-runtime/pnpm-store"
corepack pnpm@11.25.0 install --frozen-lockfile

npm run dev           # vinext dev + HMR on :5173
npm run build         # produces dist/server/wrangler.json
npm start             # preview the built Worker via Wrangler on 127.0.0.1
npm run lint          # eslint . --ignore-pattern dist --ignore-pattern .next
npm run db:generate   # drizzle-kit generate, after editing db/schema.ts
npx tsc --noEmit      # type check
```

D1 migrations are applied by hand, in order, one file per command, after a build:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js \
  d1 execute DB --local --config dist/server/wrangler.json \
  --persist-to .wrangler/state --file drizzle/0000_cool_drax.sql
```

`.wrangler/state` (not `.wrangler/state/v3`) is shared between `dev` and `start`. Never replay an applied migration; to reset, delete `.wrangler/state` and re-run both. Requires Node `>=22.13.0`.

### Local sign-in

`npm run dev` prints `Sites local sign-in: seedy@sites.test`. If that line is missing, mock auth is off and nothing will work. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy`. Mock auth is gated on loopback — a LAN IP or tunnel gets a 403, and `/callback` deliberately returns 501 locally.

## Deviations from the pristine starter

Record any new ones here.

| Change | Why |
| --- | --- |
| `tsconfig.json` `exclude` gained `content`, `supabase`, `packages/*/dist`, `.github` | The `include` is greedy (`**/*.ts`). Deno source under `supabase/functions` would otherwise break `tsc --noEmit`. |
| `eslint.config.mjs` `globalIgnores` gained `content/**`, `supabase/**`, `drizzle/**`, `vendor/**` | Same reason, for `npm run lint`. |
| `.gitattributes` added | Without `eol=lf`, Windows checkouts rewrite `scripts/*.sh` to CRLF and bash fails on them. |

**`npm run install:ci` does not work on Windows.** It runs `scripts/install-pnpm.sh`, which requires `flock` (absent in Git Bash) and coreutils ≥ 9.3 for `mv --update=none` (Git Bash ships 8.32). Do **not** patch the script — the Sites tooling needs it intact on its own runtime. Use corepack + `pnpm install --frozen-lockfile` locally.

## Layout

The Sites app sits at the **repo root** — `vite.config.ts` imports `./.openai/hosting.json` and `./build/sites-vite-plugin` root-relative, `scripts/sites-env.mjs` does `process.chdir(projectRoot)`, and `pnpm-workspace.yaml` states that a copied Site cannot inherit a monorepo policy. Non-app siblings (`content/`, `supabase/`, `.github/`, `packages/`) are added at root and excluded from tsconfig/eslint.

```text
app/            Next.js App Router (page, archive, api/state, components, lib, chatgpt-auth)
components/ui/  39 vendored shadcn components (see gaps below)
db/             Drizzle schema + D1 access (index.ts typed, raw.ts prepared statements)
drizzle/        Two migrations + meta
build/          Vendored @openai/sites-vite-plugin
scripts/        Sites toolchain (sites-env, execution-profile, run-framework, installers)
vendor/         shadcn Tailwind 4 utility pack, imported by app/globals.css
examples/       Starter D1 sample, excluded from tsconfig
docs/           ARCHIVE-MAP.md, vinext-starter-README.md (authoritative runtime doc)
```

## Design language — do not erode it

`app/globals.css` is the whole theme (Tailwind 4, CSS-first, no `tailwind.config`). Five brand tokens — `--ink #141414`, `--paper #fbefca`, `--cream #f8e8b4`, `--signal #f15f22`, `--cyan #59e1e8` — with the full shadcn token set remapped onto them.

- **`--radius` and `--radius-sm/md/lg/xl` are all `0`.** Hard-cornered brutalism. This is why stock shadcn files can be dropped in unmodified: every `rounded-*` compiles to zero. `rounded-full` is *not* neutralized and is used intentionally (avatar, language pill, live dot).
- **System fonts only, no webfonts.** `.font-display` = Arial Black/Impact 900, `.font-mono` = Courier New.
- **Shadows are hard offsets with zero blur** (`5px 5px 0 var(--ink)` → hover `8px 8px 0 var(--signal)`). Transitions are **160ms ease**.
- **Single fixed theme.** No `.dark` block, no `prefers-color-scheme`, no `next-themes`. The contrast is spatial: `html` is ink, `body` is paper, the sidebar and hero are ink-on-paper, the content column is cream.

> ⚠️ **Never run `npx shadcn add` in this repo.** `add sidebar` appends `--sidebar-*` variables and a `.dark` block to `app/globals.css` — after the existing `@theme inline`, so it wins the cascade and the sidebar renders stock grey. It would also overwrite `components/ui/button.tsx`, which carries an extended size set (`xs`, `icon-xs`, `icon-sm`, `icon-lg`) the app depends on, and install individual `@radix-ui/react-*` packages although this project deliberately uses the unified `radix-ui`. Fetch read-only with `npx shadcn@4.17.0 view <name>` and hand-place instead.

## Hand-authored files (not from the archive, not vendored verbatim)

The archive was missing everything below; each was written to satisfy a contract the existing code already depended on.

- **`data/digest-types.ts`** + **`data/digest.ts`** — the content contract and 24 seed items. Every `url` was verified live (HTTP 200) at authoring time. Exactly 3 items set `mustRead`, enforced by a dev-only console warning.
- **`components/ui/progress.tsx`, `separator.tsx`, `skeleton.tsx`, `textarea.tsx`** — written in this project's house style (function components, `data-slot`, unified `radix-ui`). The registry still serves forwardRef-era source, so pasting it would have broken the convention *and* omitted `data-slot="progress-indicator"`, which the dashboard targets to paint the bar signal-orange.
- **`components/ui/sidebar.tsx`** — fetched read-only from the registry and hand-patched (import paths, `Slot.Root`). See the header comment in the file.

`skeleton.tsx` deliberately uses `bg-primary/10` rather than upstream's `bg-accent`, because `--accent` is the signal orange here and a stock skeleton would pulse bright orange.

## Platform: the local dev loop needs x64

**`workerd` has no `win32-arm64` build** — `@cloudflare/workerd-windows-arm64` does not exist on npm, and is absent from the optionalDependencies of every workerd release including current. Linux arm64 and macOS arm64 do exist.

On a Windows ARM machine (Snapdragon X and similar) this means:

| Task | Works on win32-arm64? |
| --- | --- |
| `tsc --noEmit`, `eslint`, all code authoring | ✅ yes, with `--ignore-scripts` on install |
| `npm run build` | ❌ no — `vite.config.ts` loads `@cloudflare/vite-plugin`, which requires workerd at config-load time |
| `npm run dev`, `npm start` | ❌ no |

To install at all on arm64, add `--ignore-scripts` (workerd's postinstall hard-fails and pnpm rolls back the bin links without it). To actually run the app, use a **Windows x64** machine, or WSL2 with a real Linux distro (arm64 Linux workerd exists, and that environment also satisfies the starter's own `install:ci`, which needs `flock` and coreutils ≥ 9.3).

## Data contract

`DigestItem`: `id` (≤120 chars, unique), `category`, `mustRead?`, `score` (0–100), `readMinutes`, `publishedLabel`, `source`, `url`, `tags[]`, and `title`/`summary`/`why` each as `{ hu, en }`. Only those three fields are bilingual; `tags`, `source`, `score` are not.

> ⚠️ **`item.id` is half the composite primary key of `item_states`.** Renaming an id silently orphans every reader's read/saved state. Ids are append-only forever.

`githubTop10` is an array of **positional 3-tuples** `[repo, focus, url]`, not objects. Exactly 3 items should have `mustRead: true` — the `nth-child(2)/(3)` stagger in `globals.css` only reads as deliberate at exactly three.

## Layer rules

- **Route handlers** are proven to work in the published Worker (`app/api/state/route.ts`). **Server Actions are unverified** under vinext beta — do not assume them.
- Complex reads belong in **Postgres functions called via RPC**, not in the Worker. Query logic then changes with a migration instead of a redeploy — which matters, because a redeploy is a human.
- The Worker never holds bulk-write credentials. Migrations and batch upserts run from GitHub Actions.
