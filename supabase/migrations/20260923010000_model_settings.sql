-- Which model runs which pipeline task. Edit a row in the Table Editor and the
-- next run uses it — no redeploy. API keys stay in env; only names live here.
-- Pin exact versions: `*-latest` aliases change behaviour without notice.

create table public.model_settings (
  task text primary key check (task in ('daily_shortlist', 'daily_curate', 'ingest_article', 'ingest_video')),
  provider text not null check (provider in ('gemini', 'groq')),
  model text not null,
  fallback_provider text check (fallback_provider in ('gemini', 'groq')),
  fallback_model text,
  updated_at timestamptz not null default now(),
  check ((fallback_provider is null) = (fallback_model is null)),
  -- Only Gemini can watch a YouTube URL.
  check (task <> 'ingest_video' or (provider = 'gemini' and coalesce(fallback_provider, 'gemini') = 'gemini'))
);

-- No policies: readers cannot see it; only the pipeline's secret key reads it.
alter table public.model_settings enable row level security;

insert into public.model_settings (task, provider, model, fallback_provider, fallback_model) values
  ('daily_shortlist', 'groq',   'llama-3.3-70b-versatile', 'gemini', 'gemini-3.5-flash-lite'),
  ('daily_curate',    'gemini', 'gemini-3.8-flash',        'gemini', 'gemini-3.7-flash'),
  ('ingest_article',  'gemini', 'gemini-3.5-flash-lite',   'gemini', 'gemini-3.8-flash'),
  ('ingest_video',    'gemini', 'gemini-3.8-flash',        'gemini', 'gemini-3.7-flash');
