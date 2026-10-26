-- ─────────────────────────────────────────────────────────────
--  NAME FLAIR (Token Shop) — run once in the Supabase SQL Editor.
--  A player who buys flair in /shop/ gets a small mark (✨ ⚡ ⭐ …) beside
--  their name on every leaderboard. The flair id rides along with the score;
--  the server only stores ids it knows, so nothing arbitrary reaches a page.
--  Safe to run more than once. Players who never touch flair are unaffected,
--  and old cached game pages (which call submit_score_v2 without flair) keep
--  working because the new argument has a default.
-- ─────────────────────────────────────────────────────────────

-- 1. The allowlist. Adding a flair to the shop later = one insert here.
create table if not exists public.flair_catalog (id text primary key);
alter table public.flair_catalog enable row level security;
insert into public.flair_catalog (id) values
  ('flair-spark'), ('flair-bolt'), ('flair-star'), ('flair-heart'),
  ('flair-fire'), ('flair-rocket'), ('flair-rainbow'), ('flair-gem')
on conflict (id) do nothing;

-- 2. The column.
alter table public.scores add column if not exists flair text;

-- 3. submit_score_v2 learns an optional 5th argument. The old 4-argument
--    function must be DROPPED first: PostgREST refuses to choose between two
--    overloads, which would break score saving entirely.
drop function if exists public.submit_score_v2(uuid, text, int, int);

create or replace function public.submit_score_v2(p_session uuid, p_name text, p_score int, p_level int, p_flair text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  s        public.game_sessions;
  g        public.games;
  v_name   text;
  v_norm   text;
  v_ms     int;
  v_rank   int;
  v_flair  text;
begin
  select * into s from public.game_sessions where id = p_session for update;
  if not found then raise exception 'This game has expired - play again to save a score.'; end if;
  if s.used then raise exception 'This score has already been saved.'; end if;
  select * into g from public.games where id = s.game;

  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if v_name !~ '^[A-Za-z0-9 _.-]{1,12}$' then raise exception 'Letters and numbers only (max 12).'; end if;
  v_norm := regexp_replace(translate(lower(v_name), '013457@$', 'oieastas'), '[^a-z]', '', 'g');
  if exists (select 1 from public.banned_words b where position(b.word in v_norm) > 0) then
    raise exception 'Please choose a friendlier name.';
  end if;

  v_ms := floor(extract(epoch from (now() - s.started_at)) * 1000);
  if v_ms < 3000 then raise exception 'That game was too short to count.'; end if;
  if v_ms > 3 * 3600 * 1000 then raise exception 'This game has expired - play again to save a score.'; end if;
  if p_score is null or p_score < 0 or p_score > g.max_points_per_second * (v_ms / 1000.0) + 5000 then
    raise exception 'Score rejected.';
  end if;
  if p_level is null or p_level < 1 or p_level > 1000 then raise exception 'Invalid level'; end if;

  -- an unknown flair id is simply dropped (an out-of-date shop, or someone poking the API)
  select id into v_flair from public.flair_catalog where id = p_flair;

  perform public._rate_limit();                 -- max 6 saves a minute per connection
  update public.game_sessions set used = true where id = s.id;

  insert into public.scores (game, name, score, level, duration_ms, mode, flair)
  values (s.game, v_name, p_score, p_level, v_ms, s.mode, v_flair);

  select 1 + count(*) into v_rank from (
    select lower(name) n, max(score) m from public.scores
    where game = s.game and mode = s.mode and created_at >= public.period_start('today')
    group by lower(name)
  ) b where b.m > p_score;

  return json_build_object('rank', v_rank);
end;
$$;
grant execute on function public.submit_score_v2(uuid, text, int, int, text) to anon, authenticated;

-- 4. The boards return the flair. A function's row type can't change in place,
--    so these two are dropped and recreated (same bodies as before + flair).
drop function if exists public.top_scores(text, text, text, int);
create function public.top_scores(p_game text, p_period text default 'today', p_mode text default 'normal', p_limit int default 20)
returns table (name text, score int, level int, flair text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.name, b.score, b.level, b.flair, b.created_at from (
    select distinct on (lower(s.name)) s.name, s.score, s.level, s.flair, s.created_at
    from public.scores s
    where s.game = p_game and s.mode = p_mode and s.created_at >= public.period_start(p_period)
    order by lower(s.name), s.score desc, s.created_at asc
  ) b
  order by b.score desc, b.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.top_scores(text, text, text, int) to anon, authenticated;

drop function if exists public.recent_scores(int);
create function public.recent_scores(p_limit int default 15)
returns table (game text, name text, score int, flair text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.game, s.name, s.score, s.flair, s.created_at from public.scores s
  where s.mode = 'normal'
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.recent_scores(int) to anon, authenticated;

-- Check: should list exactly one submit_score_v2 (5 arguments) and the flair column.
select p.proname, pg_get_function_identity_arguments(p.oid) args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('submit_score_v2', 'top_scores', 'recent_scores');
select count(*) as flair_ids from public.flair_catalog;
