-- G1 (docs/superpowers/specs/2026-10-03-g1-ratings-github-collection-design.md): a reader's 👎 👍 ❤ on Radar
-- items, Library posts and GitHub repos; each repo's stars, language and score; the archive's GitHub tab.
-- Only adds. Run it BEFORE deploying the G1 code: the Radar's query reads the new github_top columns.

create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('item', 'post', 'repo')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  value smallint not null check (value in (-1, 1, 2)),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
alter table public.ratings enable row level security;
drop policy if exists "own ratings" on public.ratings;
create policy "own ratings" on public.ratings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.ratings to authenticated;

alter table public.github_top
  add column if not exists stars int,
  add column if not exists language text,
  add column if not exists score smallint check (score between 0 and 100);

-- One row per repo (by lowercase name) across every week: the latest week's details, the weeks it was up,
-- and the caller's own rating. security_invoker: the caller's RLS applies, and auth.uid() is theirs.
create or replace view public.github_repos with (security_invoker = true) as
with latest as (
  select distinct on (lower(repo)) lower(repo) as repo_key, repo, focus, url, stars, language, score
  from public.github_top
  order by lower(repo), issue_id desc, rank
), weeks as (
  select lower(repo) as repo_key, min(issue_id) as first_week, max(issue_id) as last_week,
    count(distinct issue_id)::int as week_count, min(rank)::int as best_rank
  from public.github_top
  group by lower(repo)
)
select l.repo_key, l.repo, l.focus, l.url, l.stars, l.language, l.score,
  w.first_week, w.last_week, w.week_count, w.best_rank,
  r.value as rating, coalesce(r.value = -1, false) as disliked
from latest l
join weeks w using (repo_key)
left join public.ratings r
  on r.user_id = (select auth.uid()) and r.target_kind = 'repo' and r.target_id = l.repo_key;
grant select on public.github_repos to authenticated;
