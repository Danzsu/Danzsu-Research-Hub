# Configuration: where every setting lives

This folder holds what the app reads at run time that isn't code: the daily sources, the env template, and this note. The values themselves live in Vercel and Supabase, never in the repository.

## Environment variables

Every variable is server-only (none is `NEXT_PUBLIC_`, SECURITY.md → Secrets). All of them are set in **Vercel → Settings → Environment Variables**, for Production and Preview; locally, `vercel env pull --environment=production .env.local` fills `.env.local` from Production (the file stays in the repository root, where Next reads it; [.env.example](.env.example) is its template).

| Variable | Read by | Needed |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `lib/supabase/server.ts` (the reader client), `proxy.ts` (the session refresh) | yes |
| `SUPABASE_SECRET_KEY` | `lib/supabase/server.ts` (the admin client: the pipeline, and the translate, re-extract and `/media` routes after their own checks) | yes |
| `GEMINI_API_KEY` | `lib/llm.ts` | yes |
| `GROQ_API_KEY` | `lib/llm.ts` | no: the tasks seeded on Groq run on their Gemini fallback |
| `CRON_SECRET` | `lib/api.ts` (`isCronRequest`, the two cron routes) | yes |
| `GITHUB_TOKEN` | `lib/pipeline/fetch.ts` (`githubHeaders`: the daily repo search and the GitHub extractor) | no: raises the API rate limit |
| `RADAR_MIRROR_USER_ID` | `lib/pipeline/mirror.ts` | no: unset, the Library mirror queues nothing |

GitHub Actions gets none of them: the CI runs the five checks without a database or a model, and the deploy is Vercel's Git integration.

## What is not an env variable

| Setting | Where | Notes |
| --- | --- | --- |
| Which model runs which task | the `model_settings` table (Supabase → SQL Editor) | one row per task with a fallback; a change takes effect on the next run, no redeploy (CLAUDE.md → How content gets in) |
| The daily sources | [sources.ts](sources.ts), documented in `.claude/docs/truthful_sites.md` | `lib/truthful-sites.test.ts` keeps the two equal |
| The cron schedule | `vercel.json` (`crons`), 05:00 UTC daily, the mirror at 07, 08 and 09 UTC | |
| Sign-in | Supabase → Authentication: sign-ups **off** (the invite gate), the Email and Google providers on, the Site URL and the Redirect URLs | SECURITY.md → Auth and the invite gate |
| The Google consent screen | Google Auth Platform: the home page `https://<domain>/about`, the privacy policy `https://<domain>/privacy`, the redirect URI `https://<ref>.supabase.co/auth/v1/callback` | `.claude/docs/TODO.md` → A Google-belépés beállítása |
| The function region and compute | `vercel.json` (`regions`, `fluid`) | README.md → Deploy |

## How to change something

- **A new env variable:** add it to [.env.example](.env.example) with a comment, to the table above, and to Vercel (Production and Preview). A variable the code reads but Vercel lacks fails only at run time, so check the deploy's logs after the first request.
- **A new source:** README.md → Recipes, "Add a news feed" (`sources.ts` + `truthful_sites.md`).
- **A model:** an `update public.model_settings …` in the SQL Editor; pin exact versions, never `*-latest`.
