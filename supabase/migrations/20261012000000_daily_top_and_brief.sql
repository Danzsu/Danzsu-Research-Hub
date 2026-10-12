-- Daily news (.claude/docs/specs/2026-10-12-daily-news-design.md): the day's Top 10 and each post's 2–3 minute brief.
-- Only adds. Run it BEFORE deploying the daily-news code: the daily run writes daily_top, the Radar's query
-- embeds it, and ingest writes posts.brief.

create table if not exists public.daily_top (
  day date not null,
  rank smallint not null check (rank between 1 and 10),
  item_id text not null references public.digest_items (id) on delete cascade,
  primary key (day, rank)
);
create index if not exists daily_top_item_id on public.daily_top (item_id);
alter table public.daily_top enable row level security;
drop policy if exists "readers see daily top" on public.daily_top;
create policy "readers see daily top" on public.daily_top for select to authenticated using (true);
grant select on public.daily_top to authenticated;

alter table public.posts add column if not exists brief jsonb;
