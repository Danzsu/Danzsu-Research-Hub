# Danzsu Research Hub

A private, invite-only, bilingual (HU/EN) AI-research hub. Published as **NEON RADAR — Weekly AI Intelligence**.

It has two views over one corpus:

- **Radar** — the weekly digest: a curated issue, a top-3 must-read, a scored signal feed, a GitHub top-10, and a weekly archive.
- **Library** — a searchable knowledge base of **mirrored** articles: the full text and figures are copied to this hub so the material survives the original link going dead. The canonical source link is always shown, and source-link health is tracked over time.

Content is authored as an Obsidian markdown vault in this repository and synced into the database by CI. The site reads from the database at request time, never from the bundle.

## Status

Reconstructed from a flat archive; **not yet runnable**. Two things are missing and the app will not build without them:

- `data/digest.ts` — the content module (`currentIssue`, `digestItems`, `githubTop10`, `archiveIssues`)
- five shadcn components — `sidebar`, `progress`, `separator`, `skeleton`, `textarea`

See [CLAUDE.md](CLAUDE.md) for the data contract and the constraints these must satisfy.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | `vinext` (Next.js 16 App Router + React 19 RSC via Vite) on a Cloudflare Worker |
| Hosting | OpenAI ChatGPT Sites |
| Styling | Tailwind 4 (CSS-first) + vendored shadcn/ui, unified `radix-ui` package |
| Identity | Sign in with ChatGPT (dispatch-injected headers) + email/password, both behind an invite allowlist |
| Database | Supabase Postgres over PostgREST (the Worker has no raw TCP) |
| Scheduler | GitHub Actions cron — the Worker has no `scheduled()` handler |

## Getting started

Requires Node `>=22.13.0`.

```bash
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
npm run dev
```

Then open <http://localhost:5173/signin-with-chatgpt?return_to=/> to sign in as the local mock user.

> On Windows, do **not** use `npm run install:ci` — it requires `flock` and coreutils ≥ 9.3, neither of which Git Bash provides. See [CLAUDE.md](CLAUDE.md).

Full command reference, runtime constraints and design rules: [CLAUDE.md](CLAUDE.md).
Provenance of every file in this tree: [docs/ARCHIVE-MAP.md](docs/ARCHIVE-MAP.md).
Upstream starter documentation: [docs/vinext-starter-README.md](docs/vinext-starter-README.md).

## Content and copyright

Mirroring third-party article bodies is a managed risk, not a solved problem. What keeps it defensible: access is private and invite-only, the canonical source and author are displayed on every mirrored page, `noarchive` and paywall signals downgrade an article to metadata-only, and every article has a stable id so a takedown removes body, media and rows in one run. `noindex` and the auth gate are load-bearing, not cosmetic. This posture does not survive the site becoming public, ad-supported or search-indexed.
