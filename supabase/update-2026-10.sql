-- ════════════════════════════════════════════════════════════════
--  OCTOBER 2026 UPDATE — run ONCE in Supabase → SQL Editor (right after uploading the site files).
--  Safe to run more than once. Does not delete any scores.
--    • adds Turbo Rush (game 13, Zone 3) to the leaderboard
--    • server-timed "game tickets" so scores can't be faked (details below)
--
--  Before: the game told the server how long it had been played, so a cheater
--  could claim a long game and post a huge score.
--  Now:   every game starts with a one-time "game ticket". The server notes the
--         start time on ITS OWN clock, and a score is only accepted with a valid,
--         unused ticket and within the game's points-per-second limit for the time
--         that really passed.
-- ════════════════════════════════════════════════════════════════

-- 0. Turbo Rush joins the leaderboard
insert into public.games (id, title, max_points_per_second)
values ('turbo-rush', 'Turbo Rush', 10000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- 1. Game tickets (no personal data: a one-way hash of the connection address, deleted after 6 hours)
create table if not exists public.game_sessions (
  id         uuid primary key default gen_random_uuid(),
  game       text not null references public.games(id) on delete cascade,
  mode       text not null,
  ip_hash    text not null,
  started_at timestamptz not null default now(),
  used       boolean not null default false
);
create index if not exists game_sessions_started_idx on public.game_sessions (started_at);
create index if not exists game_sessions_ip_idx on public.game_sessions (ip_hash, started_at);
alter table public.game_sessions enable row level security;   -- no policies: only the functions below can touch it

-- 2. Shared helper: hashed connection address (same method as the spam protection)
create or replace function public._ip_hash()
returns text language plpgsql stable security definer set search_path = public as $$
declare v_hdrs json; v_xff text; v_ip text;
begin
  v_hdrs := coalesce(current_setting('request.headers', true), '{}')::json;
  v_xff  := coalesce(v_hdrs ->> 'x-forwarded-for', '');
  v_ip   := coalesce(nullif(v_hdrs ->> 'cf-connecting-ip', ''), nullif(v_hdrs ->> 'x-real-ip', ''),
                     nullif(trim(split_part(v_xff, ',', greatest(1, array_length(string_to_array(v_xff, ','), 1)))), ''),
                     'unknown');
  return md5(v_ip || ':arcade-salt');
end;
$$;
revoke all on function public._ip_hash() from public, anon, authenticated;

-- 3. Start a game → returns a one-time ticket
create or replace function public.start_game(p_game text, p_mode text default 'normal')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hash text; v_id uuid; v_recent int; v_global int;
begin
  if not exists (select 1 from public.games where id = p_game) then raise exception 'Unknown game'; end if;
  if p_mode not in ('normal', 'daily') then raise exception 'Invalid mode'; end if;
  v_hash := public._ip_hash();
  delete from public.game_sessions where started_at < now() - interval '6 hours';
  select count(*) into v_global from public.game_sessions where started_at > now() - interval '1 minute';
  if v_global >= 1500 then raise exception 'Very busy right now - try again in a minute.'; end if;
  select count(*) into v_recent from public.game_sessions where ip_hash = v_hash and started_at > now() - interval '1 minute';
  if v_recent >= 30 then raise exception 'Slow down a little - try again in a minute.'; end if;
  insert into public.game_sessions (game, mode, ip_hash) values (p_game, p_mode, v_hash) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.start_game(text, text) to anon, authenticated;

-- 4. Save a score with its ticket (time is measured by the server)
create or replace function public.submit_score_v2(p_session uuid, p_name text, p_score int, p_level int)
returns json language plpgsql security definer set search_path = public as $$
declare
  s        public.game_sessions;
  g        public.games;
  v_name   text;
  v_norm   text;
  v_ms     int;
  v_rank   int;
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

  perform public._rate_limit();                 -- max 6 saves a minute per connection
  update public.game_sessions set used = true where id = s.id;

  insert into public.scores (game, name, score, level, duration_ms, mode)
  values (s.game, v_name, p_score, p_level, v_ms, s.mode);

  select 1 + count(*) into v_rank from (
    select lower(name) n, max(score) m from public.scores
    where game = s.game and mode = s.mode and created_at >= public.period_start('today')
    group by lower(name)
  ) b where b.m > p_score;

  return json_build_object('rank', v_rank);
end;
$$;
grant execute on function public.submit_score_v2(uuid, text, int, int) to anon, authenticated;

-- 5. Close the old door: out-of-date copies of the games (still cached in someone's browser)
--    get a friendly message instead of saving an unchecked score.
create or replace function public.submit_score(
  p_game text, p_name text, p_score int, p_level int, p_duration_ms int, p_mode text default 'normal'
) returns json language plpgsql security definer set search_path = public as $$
begin
  raise exception 'The arcade has been updated - refresh the page (Ctrl+Shift+R) and play again to save scores.';
end;
$$;

-- Check it worked (should show 3 rows: start_game, submit_score_v2 and turbo-rush):
select 'function' as what, routine_name as name from information_schema.routines
where routine_schema = 'public' and routine_name in ('start_game', 'submit_score_v2')
union all select 'game', id from public.games where id = 'turbo-rush';
