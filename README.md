# Danzsu Research Hub

A private, invite-only, bilingual (HU/EN) AI-research hub. Published as **NEON NEWS RADAR — Weekly AI Intelligence**.

It has two views:

- **Radar** — the weekly digest, refreshed daily and automatically: a curated issue, a top-3 must-read, a scored signal feed, a GitHub top-10, and a weekly archive.
- **Library** — links readers submit (YouTube videos, articles). The AI summarizes each one in both languages; article text is **mirrored** so it survives the original link going dead. The canonical source link is always shown.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 App Router + React 19 |
| Hosting | Vercel |
| Styling | Tailwind 4 (CSS-first) + vendored shadcn/ui, unified `radix-ui` package |
| Identity | Supabase Auth magic link; sign-ups disabled, members are invited |
| Database | Supabase Postgres with RLS |
| Scheduler | Vercel Cron, once a day |
| Models | Gemini Flash (Google AI Studio) for curation, summaries and video; Groq for the cheap shortlist pass |

## Setup

1. **Supabase** — create a project. *Authentication → Sign In / Providers*: turn off **Allow new users to sign up**. *URL Configuration*: set the Site URL to the Vercel domain and add `http://localhost:3000/**` to the redirect URLs. *Email Templates*: point Magic Link at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` and Invite user at the same with `type=invite`. Invite yourself under *Users → Invite user*.
2. **Schema** — `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Keys** — a Gemini API key from Google AI Studio, optionally a Groq key and a GitHub token. Every variable is listed in [.env.example](.env.example).
4. **Vercel** — import the repo, add the variables from `.env.example`, deploy. The cron in [vercel.json](vercel.json) starts on its own.
5. **First issue** — don't wait for the morning: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily`.

Local development, with Node `>=22.13.0`:

```bash
corepack pnpm@11.25.0 install --frozen-lockfile
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000
```

Architecture, auth, data contract and design rules: [CLAUDE.md](CLAUDE.md).

## Content and copyright

Mirroring third-party article bodies is a managed risk, not a solved problem. What keeps it defensible: access is private and invite-only, the canonical source and author are displayed on every mirrored page, a `noarchive` signal downgrades an article to summary-only, and deleting a source removes its post in one step. `noindex` and the auth gate are load-bearing, not cosmetic. This posture does not survive the site becoming public, ad-supported or search-indexed.
