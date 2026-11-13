-- Search over the Radar's items, the Library's posts (their full text) and the GitHub repos. Additive only.
-- Words by full text ('simple': no stemming, so Hungarian and English mix), typos by trigram similarity.
-- search_all is security invoker: the caller's RLS applies, and every member may read all three.

create extension if not exists pg_trgm;

alter table public.digest_items add column if not exists search_text text;
alter table public.posts add column if not exists search_text text;

create or replace function public.digest_items_set_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := concat_ws(' ',
    new.title ->> 'en', new.title ->> 'hu', new.summary ->> 'en', new.summary ->> 'hu',
    new.why ->> 'en', new.why ->> 'hu', new.source, array_to_string(new.tags, ' '));
  return new;
end $$;

-- A post's own words: its title, summary, tags and every `text` of its blocks (the inline spans' included).
create or replace function public.posts_set_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := concat_ws(' ',
    new.title ->> 'en', new.title ->> 'hu', new.summary ->> 'en', new.summary ->> 'hu',
    new.author, new.source_site, array_to_string(new.tags, ' '),
    (select string_agg(t #>> '{}', ' ') from jsonb_path_query(coalesce(new.blocks, '[]'::jsonb), '$.**.text ? (@.type() == "string")') t));
  return new;
end $$;

drop trigger if exists digest_items_search_text on public.digest_items;
create trigger digest_items_search_text before insert or update on public.digest_items
  for each row execute function public.digest_items_set_search_text();
drop trigger if exists posts_search_text on public.posts;
create trigger posts_search_text before insert or update on public.posts
  for each row execute function public.posts_set_search_text();

-- Backfill: touching a row runs its trigger.
update public.digest_items set score = score;
update public.posts set title = title;

create index if not exists digest_items_search_idx on public.digest_items using gin (to_tsvector('simple', coalesce(search_text, '')));
create index if not exists posts_search_idx on public.posts using gin (to_tsvector('simple', coalesce(search_text, '')));

-- kind: item | post | repo. href: the page in this app; url: the original (an item's, a repo's), else null.
create or replace function public.search_all(q text, lim int default 40)
returns table (kind text, id text, title text, snippet text, href text, url text, meta text, rank real)
language sql stable security invoker set search_path = public, extensions as $$
  with p as (select websearch_to_tsquery('simple', q) as tsq, lower(q) as needle)
  select * from (
    select 'item'::text as kind, i.id::text as id, coalesce(i.title ->> 'en', i.title ->> 'hu') as title,
      left(coalesce(i.summary ->> 'en', i.summary ->> 'hu'), 240) as snippet, '/archive/' || i.issue_id as href, i.url as url,
      i.issue_id || ' · ' || i.source as meta,
      (ts_rank(to_tsvector('simple', coalesce(i.search_text, '')), p.tsq) * 2
        + word_similarity(p.needle, lower(coalesce(i.title ->> 'en', i.title ->> 'hu', ''))))::real as rank
    from public.digest_items i, p
    where to_tsvector('simple', coalesce(i.search_text, '')) @@ p.tsq
       or word_similarity(p.needle, lower(coalesce(i.title ->> 'en', i.title ->> 'hu', ''))) > 0.45
    union all
    select 'post'::text, s.id::text, coalesce(s.title ->> 'en', s.title ->> 'hu'),
      left(coalesce(s.summary ->> 'en', s.summary ->> 'hu'), 240), '/library/' || s.id, null::text,
      coalesce(s.source_site, s.kind),
      (ts_rank(to_tsvector('simple', coalesce(s.search_text, '')), p.tsq) * 2
        + word_similarity(p.needle, lower(coalesce(s.title ->> 'en', s.title ->> 'hu', ''))))::real
    from public.posts s, p
    where to_tsvector('simple', coalesce(s.search_text, '')) @@ p.tsq
       or word_similarity(p.needle, lower(coalesce(s.title ->> 'en', s.title ->> 'hu', ''))) > 0.45
    union all
    select 'repo'::text, g.repo_key, g.repo, g.focus, '/github', g.url,
      concat_ws(' · ', g.language, g.last_week),
      (ts_rank(to_tsvector('simple', g.repo || ' ' || coalesce(g.focus, '') || ' ' || coalesce(g.language, '')), p.tsq) * 2
        + word_similarity(p.needle, lower(g.repo)))::real
    from public.github_repos g, p
    where to_tsvector('simple', g.repo || ' ' || coalesce(g.focus, '') || ' ' || coalesce(g.language, '')) @@ p.tsq
       or word_similarity(p.needle, lower(g.repo)) > 0.45
  ) r
  order by r.rank desc
  limit least(greatest(lim, 1), 100);
$$;
grant execute on function public.search_all(text, int) to authenticated;
