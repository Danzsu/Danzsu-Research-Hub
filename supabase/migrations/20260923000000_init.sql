-- NEON RADAR initial schema.
-- Content tables are written only with the secret key (cron + ingest, which
-- bypass RLS); signed-in readers get select. Per-reader tables are own-rows only.
-- Sign-ups are disabled in Supabase Auth, so `authenticated` == invited.

-- Weekly issue, keyed by ISO week: '2026-W39'.
create table public.issues (
  id text primary key,
  period text not null,            -- '2026 / 09'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.digest_items (
  -- ⚠️ Stable forever: half of item_states' primary key. Never rewrite.
  id text primary key check (char_length(id) <= 120),
  issue_id text not null references public.issues (id) on delete cascade,
  category text not null check (category in ('local', 'research', 'companies', 'github')),
  must_read boolean not null default false,
  score smallint not null check (score between 0 and 100),
  read_minutes smallint not null check (read_minutes > 0),
  published_at date not null,
  source text not null,
  url text not null unique,
  tags text[] not null default '{}',
  title jsonb not null,            -- { hu, en }
  summary jsonb not null,
  why jsonb not null,
  created_at timestamptz not null default now()
);
create index digest_items_issue_score_idx on public.digest_items (issue_id, score desc);

create table public.github_top (
  issue_id text not null references public.issues (id) on delete cascade,
  rank smallint not null check (rank between 1 and 10),
  repo text not null,
  focus text not null,
  url text not null,
  primary key (issue_id, rank)
);

-- Links submitted by readers; processed into posts.
create table public.sources (
  id bigint generated always as identity primary key,
  url text not null unique,
  kind text not null check (kind in ('youtube', 'article')),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error text,
  attempts smallint not null default 0,
  submitted_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index sources_status_idx on public.sources (status) where status <> 'done';
create index sources_submitted_by_idx on public.sources (submitted_by);

-- The Library: mirrored copies of submitted sources.
create table public.posts (
  id bigint generated always as identity primary key,
  source_id bigint not null unique references public.sources (id) on delete cascade,
  kind text not null check (kind in ('youtube', 'article')),
  url text not null,
  author text,
  title jsonb not null,            -- { hu, en }
  summary jsonb not null,
  key_points jsonb not null default '{"hu": [], "en": []}',
  body text,                       -- mirrored article text; null for videos
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);

create table public.item_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null check (char_length(item_id) <= 120),
  is_read boolean not null default false,
  is_saved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.todos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text,
  text text not null check (char_length(text) between 1 and 180),
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index todos_user_status_created_idx on public.todos (user_id, is_done, created_at desc);

-- Archive cards: one row per issue except the current one.
create view public.archive_issues with (security_invoker = true) as
select
  i.id,
  i.period,
  count(d.id)::int as item_count,
  coalesce(sum(d.read_minutes), 0)::int as read_minutes,
  (array_agg(d.title order by d.score desc))[1] as top_title
from public.issues i
left join public.digest_items d on d.issue_id = i.id
group by i.id, i.period;

-- Exactly three must-reads per issue: the top scores. Called by the pipeline after each run.
create function public.refresh_must_read(p_issue text) returns void
language sql security invoker set search_path = '' as $$
  update public.digest_items d
  set must_read = d.id in (
    select id from public.digest_items
    where issue_id = p_issue
    order by score desc, created_at
    limit 3
  )
  where d.issue_id = p_issue;
$$;
revoke execute on function public.refresh_must_read(text) from public, anon, authenticated;
grant execute on function public.refresh_must_read(text) to service_role;

alter table public.issues enable row level security;
alter table public.digest_items enable row level security;
alter table public.github_top enable row level security;
alter table public.sources enable row level security;
alter table public.posts enable row level security;
alter table public.item_states enable row level security;
alter table public.todos enable row level security;

create policy "readers see issues" on public.issues for select to authenticated using (true);
create policy "readers see items" on public.digest_items for select to authenticated using (true);
create policy "readers see github top" on public.github_top for select to authenticated using (true);
create policy "readers see posts" on public.posts for select to authenticated using (true);

create policy "readers see sources" on public.sources for select to authenticated using (true);
create policy "readers submit sources" on public.sources for insert to authenticated
  with check (submitted_by = (select auth.uid()));

create policy "own item states" on public.item_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own todos" on public.todos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
