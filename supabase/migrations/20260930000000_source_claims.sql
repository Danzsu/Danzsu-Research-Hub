-- A pipeline run claims a source before it works on it (lib/pipeline/ingest.ts → processSource). The
-- daily cron, the three mirror crons and a reader's "Olvasd itt" can reach the same source, and Vercel
-- may deliver one cron twice. Only adds a column: safe to run before the code that reads it is deployed.
alter table public.sources add column if not exists claimed_at timestamptz;

comment on column public.sources.claimed_at is
  'When a pipeline run claimed this source; null when none holds it. A claim older than 10 minutes belongs to a run that died, and the next run takes it over.';
