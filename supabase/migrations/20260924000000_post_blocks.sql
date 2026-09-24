-- M1 of the unified post template. Additive only: the running app still
-- reads posts.body, which is dropped in a later migration after deploy.

alter table public.posts
  add column blocks jsonb not null default '[]',
  add column blocks_hu jsonb,
  add column meta jsonb not null default '{}',
  add column source_site text,
  add column published_at date,
  add column overrides jsonb not null default '{}',
  add column hidden_blocks text[] not null default '{}',
  add column extracted_at timestamptz;

alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('article', 'youtube', 'arxiv', 'github', 'x', 'pdf'));

alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('article', 'youtube', 'arxiv', 'github', 'x', 'pdf'));

alter table public.model_settings drop constraint model_settings_task_check;
alter table public.model_settings add constraint model_settings_task_check
  check (task in ('daily_shortlist', 'daily_curate', 'ingest_article', 'ingest_video',
                  'ingest_pdf', 'ingest_cleanup', 'translate_post'));

insert into public.model_settings (task, provider, model, fallback_provider, fallback_model) values
  ('ingest_pdf',     'gemini', 'gemini-3.8-flash',        'gemini', 'gemini-3.7-flash'),
  ('ingest_cleanup', 'groq',   'llama-3.3-70b-versatile', 'gemini', 'gemini-3.5-flash-lite'),
  ('translate_post', 'gemini', 'gemini-3.5-flash-lite',   'gemini', 'gemini-3.8-flash');

-- Private: images are served by the app's /media route after a session check.
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

-- RLS cannot restrict columns, so edits to shared posts go through this check.
create function public.update_post_overrides(p_post bigint, p_overrides jsonb, p_hidden text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.posts p
    join public.sources s on s.id = p.source_id
    where p.id = p_post and s.submitted_by = (select auth.uid())
  ) then
    raise exception 'only the submitter can edit this post' using errcode = '42501';
  end if;
  update public.posts
  set overrides = coalesce(p_overrides, '{}'::jsonb), hidden_blocks = coalesce(p_hidden, '{}')
  where id = p_post;
end;
$$;
revoke execute on function public.update_post_overrides(bigint, jsonb, text[]) from public, anon;
grant execute on function public.update_post_overrides(bigint, jsonb, text[]) to authenticated;
