-- ════════════════════════════════════════════════════════════════
--  ARCADE LEADERBOARD — run this once in Supabase → SQL Editor → New query → Run.
--  Safe to run again later (e.g. after adding a game): it only creates what's missing
--  and updates the games list.
-- ════════════════════════════════════════════════════════════════

-- 1. Games that are allowed on the leaderboard, with an anti-cheat limit:
--    the highest *average* points-per-second a real player could plausibly score.
create table if not exists public.games (
  id                    text primary key,
  title                 text not null,
  max_points_per_second numeric not null default 3000
);

insert into public.games (id, title, max_points_per_second) values
  ('neon-snake',    'Neon Snake',    3000),
  ('feather-dash',  'Feather Dash',  3000),
  ('prism-breaker', 'Prism Breaker', 6000),
  ('astro-blaster', 'Astro Blaster', 6000),
  ('crazy-putt',    'Crazy Putt',    8000),
  ('snake-escape-puzzle', 'Snake Escape Puzzle', 4000),
  ('neon-beat', 'Neon Beat', 3000),
  ('tower-topple', 'Tower Topple', 3000),
  ('hyper-hex', 'Hyper Hex', 3000),
  ('galactic-alien-shooter', 'Galactic Alien Shooter', 8000),
  ('turbo-rush', 'Turbo Rush', 10000),
  ('bubble-blitz', 'Bubble Blitz', 8000),
  ('pinball-blast', 'Pinball Blast Extreme', 15000),
  ('star-strike', 'Star Strike 3D', 12000),
  ('dungeon-escape', 'Dungeon Escape 3D', 12000)
  -- ADD NEW GAMES HERE, e.g.  ,('my-game', 'My Game', 3000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- 2. The scores themselves. Only a name — no emails, no accounts.
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  game        text not null references public.games(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 12),
  score       integer not null check (score >= 0),
  level       integer not null default 1 check (level between 1 and 1000),
  duration_ms integer not null check (duration_ms >= 0),
  mode        text not null default 'normal' check (mode in ('normal', 'daily')),
  created_at  timestamptz not null default now()
);
create index if not exists scores_board_idx  on public.scores (game, mode, created_at desc, score desc);
create index if not exists scores_best_idx   on public.scores (game, mode, score desc);
create index if not exists scores_recent_idx on public.scores (created_at desc);

-- 3. Short-lived log for rate limiting (hashed connection address, auto-deleted after 1 hour).
create table if not exists public.submit_log (
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists submit_log_idx on public.submit_log (ip_hash, created_at);

-- 4. Blocked words for names (matched after lower-casing and undoing 0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
create table if not exists public.banned_words (word text primary key);
insert into public.banned_words (word) values
  ('fuck'),('shit'),('cunt'),('bitch'),('nigg'),('fag'),('slut'),('whore'),('twat'),('wank'),
  ('bastard'),('retard'),('penis'),('vagina'),('porn'),('rape'),('nazi'),('hitler'),('pussy'),
  ('asshole'),('arsehole'),('dildo'),('jizz'),('kkk'),('paki'),('spastic'),('bollock'),
  ('prick'),('bellend')
on conflict do nothing;

-- 5. Security: visitors can READ scores, but can't write to any table directly.
--    The only way in is the submit_score() function below, which checks everything.
alter table public.games        enable row level security;
alter table public.scores       enable row level security;
alter table public.submit_log   enable row level security;
alter table public.banned_words enable row level security;

drop policy if exists "anyone can read scores" on public.scores;
create policy "anyone can read scores" on public.scores for select to anon, authenticated using (true);
drop policy if exists "anyone can read games" on public.games;
create policy "anyone can read games" on public.games for select to anon, authenticated using (true);

-- Helper: start of a leaderboard period (UTC).
create or replace function public.period_start(p_period text)
returns timestamptz language sql stable as $$
  select case p_period
    when 'today' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    when 'week'  then now() - interval '7 days'
    else '-infinity'::timestamptz
  end;
$$;

-- 6. Submit a score (called by assets/js/scores.js).
create or replace function public.submit_score(
  p_game text, p_name text, p_score int, p_level int, p_duration_ms int, p_mode text default 'normal'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  g        public.games;
  v_name   text;
  v_norm   text;
  v_ip     text;
  v_hash   text;
  v_recent int;
  v_rank   int;
begin
  select * into g from public.games where id = p_game;
  if not found then raise exception 'Unknown game'; end if;

  -- Name rules
  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if v_name !~ '^[A-Za-z0-9 _.-]{1,12}$' then raise exception 'Letters and numbers only (max 12).'; end if;
  v_norm := regexp_replace(translate(lower(v_name), '013457@$', 'oieastas'), '[^a-z]', '', 'g');
  if exists (select 1 from public.banned_words b where position(b.word in v_norm) > 0) then
    raise exception 'Please choose a friendlier name.';
  end if;

  -- Sanity checks against cheating
  if p_mode not in ('normal', 'daily') then raise exception 'Invalid mode'; end if;
  if p_duration_ms is null or p_duration_ms < 3000 then raise exception 'That game was too short to count.'; end if;
  if p_duration_ms > 6 * 3600 * 1000 then raise exception 'Invalid game length'; end if;
  if p_score is null or p_score < 0 or p_score > g.max_points_per_second * (p_duration_ms / 1000.0) + 5000 then
    raise exception 'Score rejected.';
  end if;
  if p_level is null or p_level < 1 or p_level > 1000 then raise exception 'Invalid level'; end if;

  -- Rate limit: max 6 submissions per minute per connection
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), 'unknown');
  v_hash := md5(v_ip || ':arcade-salt');
  delete from public.submit_log where created_at < now() - interval '1 hour';
  select count(*) into v_recent from public.submit_log where ip_hash = v_hash and created_at > now() - interval '1 minute';
  if v_recent >= 6 then raise exception 'Slow down a little — try again in a minute.'; end if;
  insert into public.submit_log (ip_hash) values (v_hash);

  insert into public.scores (game, name, score, level, duration_ms, mode)
  values (p_game, v_name, p_score, p_level, p_duration_ms, p_mode);

  select 1 + count(*) into v_rank from (
    select lower(name) n, max(score) m from public.scores
    where game = p_game and mode = p_mode and created_at >= public.period_start('today')
    group by lower(name)
  ) b where b.m > p_score;

  return json_build_object('rank', v_rank);
end;
$$;

-- 7. Top scores — one row per name (their best), for a period.
create or replace function public.top_scores(p_game text, p_period text default 'today', p_mode text default 'normal', p_limit int default 20)
returns table (name text, score int, level int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.name, b.score, b.level, b.created_at from (
    select distinct on (lower(s.name)) s.name, s.score, s.level, s.created_at
    from public.scores s
    where s.game = p_game and s.mode = p_mode and s.created_at >= public.period_start(p_period)
    order by lower(s.name), s.score desc, s.created_at asc
  ) b
  order by b.score desc, b.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;

-- 8. Where would a score rank?
create or replace function public.score_rank(p_game text, p_score int, p_period text default 'today', p_mode text default 'normal')
returns int language sql stable security definer set search_path = public as $$
  select 1 + count(*)::int from (
    select max(score) m from public.scores
    where game = p_game and mode = p_mode and created_at >= public.period_start(p_period)
    group by lower(name)
  ) b where b.m > p_score;
$$;

-- 9. Latest scores across all games (home page ticker).
create or replace function public.recent_scores(p_limit int default 15)
returns table (game text, name text, score int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.game, s.name, s.score, s.created_at from public.scores s
  where s.mode = 'normal'
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.submit_score(text, text, int, int, int, text) to anon, authenticated;
grant execute on function public.top_scores(text, text, text, int)           to anon, authenticated;
grant execute on function public.score_rank(text, int, text, text)           to anon, authenticated;
grant execute on function public.recent_scores(int)                          to anon, authenticated;

-- 10. Security & privacy update (Sept 2026): hardened submit_score, search_path fix, data retention.
-- 1. Fix Supabase Security Advisor warning "function search_path mutable".
create or replace function public.period_start(p_period text)
returns timestamptz language sql stable set search_path = public as $$
  select case p_period
    when 'today' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    when 'week'  then now() - interval '7 days'
    else '-infinity'::timestamptz
  end;
$$;

-- 2. Harder-to-fool spam protection:
--    • reads the connection address from Cloudflare's header (which visitors can't fake),
--    • adds a site-wide limit of 120 submissions a minute as a backstop,
--    • rejects "games" claiming to last longer than 3 hours.
create or replace function public.submit_score(
  p_game text, p_name text, p_score int, p_level int, p_duration_ms int, p_mode text default 'normal'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  g        public.games;
  v_name   text;
  v_norm   text;
  v_hdrs   json;
  v_xff    text;
  v_ip     text;
  v_hash   text;
  v_recent int;
  v_global int;
  v_rank   int;
begin
  select * into g from public.games where id = p_game;
  if not found then raise exception 'Unknown game'; end if;

  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if v_name !~ '^[A-Za-z0-9 _.-]{1,12}$' then raise exception 'Letters and numbers only (max 12).'; end if;
  v_norm := regexp_replace(translate(lower(v_name), '013457@$', 'oieastas'), '[^a-z]', '', 'g');
  if exists (select 1 from public.banned_words b where position(b.word in v_norm) > 0) then
    raise exception 'Please choose a friendlier name.';
  end if;

  if p_mode not in ('normal', 'daily') then raise exception 'Invalid mode'; end if;
  if p_duration_ms is null or p_duration_ms < 3000 then raise exception 'That game was too short to count.'; end if;
  if p_duration_ms > 3 * 3600 * 1000 then raise exception 'Invalid game length'; end if;
  if p_score is null or p_score < 0 or p_score > g.max_points_per_second * (p_duration_ms / 1000.0) + 5000 then
    raise exception 'Score rejected.';
  end if;
  if p_level is null or p_level < 1 or p_level > 1000 then raise exception 'Invalid level'; end if;

  -- Real connection address: Cloudflare's header first, then the proxy-added (last) forwarded address.
  v_hdrs := coalesce(current_setting('request.headers', true), '{}')::json;
  v_xff  := coalesce(v_hdrs ->> 'x-forwarded-for', '');
  v_ip   := coalesce(nullif(v_hdrs ->> 'cf-connecting-ip', ''), nullif(v_hdrs ->> 'x-real-ip', ''),
                     nullif(trim(split_part(v_xff, ',', greatest(1, array_length(string_to_array(v_xff, ','), 1)))), ''),
                     'unknown');
  v_hash := md5(v_ip || ':arcade-salt');

  delete from public.submit_log where created_at < now() - interval '1 hour';
  select count(*) into v_global from public.submit_log where created_at > now() - interval '1 minute';
  if v_global >= 120 then raise exception 'The leaderboard is very busy — try again in a minute.'; end if;
  select count(*) into v_recent from public.submit_log where ip_hash = v_hash and created_at > now() - interval '1 minute';
  if v_recent >= 6 then raise exception 'Slow down a little — try again in a minute.'; end if;
  insert into public.submit_log (ip_hash) values (v_hash);

  insert into public.scores (game, name, score, level, duration_ms, mode)
  values (p_game, v_name, p_score, p_level, p_duration_ms, p_mode);

  select 1 + count(*) into v_rank from (
    select lower(name) n, max(score) m from public.scores
    where game = p_game and mode = p_mode and created_at >= public.period_start('today')
    group by lower(name)
  ) b where b.m > p_score;

  return json_build_object('rank', v_rank);
end;
$$;
grant execute on function public.submit_score(text, text, int, int, int, text) to anon, authenticated;

-- 3. Data retention (privacy): delete scores older than 90 days unless they are in a game's
--    all-time top 20, and clear any left-over spam-protection records.
--    Only you (the project owner) can run this — visitors cannot.
create or replace function public.cleanup_old_data()
returns int language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from public.submit_log where created_at < now() - interval '1 hour';
  with keep as (
    select id from (
      select id, row_number() over (partition by game, mode order by score desc, created_at asc) rn
      from public.scores
    ) r where rn <= 20
  )
  delete from public.scores s
  where s.created_at < now() - interval '90 days' and s.id not in (select id from keep);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;

-- Run it by hand any time:      select public.cleanup_old_data();
--
-- Or run it automatically every night at 3am (optional):
--   1. Supabase → Database → Extensions → enable "pg_cron"
--   2. then run:  select cron.schedule('arcade-cleanup', '0 3 * * *', 'select public.cleanup_old_data()');


-- 11. Legends (Sept 2026): Legend games + Hall of Legends.
-- 1. Games can be "Legend games" (with a minimum believable run time for a legend claim)
alter table public.games add column if not exists has_legend boolean not null default false;
alter table public.games add column if not exists legend_min_ms integer not null default 90000;

insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms)
values ('the-vault-job', 'The Vault Job', 8000, true, 90000),
       ('heist-planner', 'Heist Planner', 3000, true, 240000),
       ('crypt-of-crowns', 'Crypt of Crowns', 6000, true, 150000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second,
  has_legend = excluded.has_legend, legend_min_ms = excluded.legend_min_ms;
-- FUTURE LEGEND GAMES: add them the same way with has_legend = true.

-- 2. The Hall of Legends
create table if not exists public.legends (
  id          bigint generated always as identity primary key,
  game        text not null references public.games(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 12),
  code        text not null unique,
  duration_ms integer not null,
  created_at  timestamptz not null default now()
);
alter table public.legends enable row level security;
-- No read policy on purpose: Legend codes stay private. The page reads names through hall_of_legends().

-- 3. Shared spam protection (same rules as score saving)
create or replace function public._rate_limit()
returns void language plpgsql security definer set search_path = public as $$
declare v_hdrs json; v_xff text; v_ip text; v_hash text; v_recent int; v_global int;
begin
  v_hdrs := coalesce(current_setting('request.headers', true), '{}')::json;
  v_xff  := coalesce(v_hdrs ->> 'x-forwarded-for', '');
  v_ip   := coalesce(nullif(v_hdrs ->> 'cf-connecting-ip', ''), nullif(v_hdrs ->> 'x-real-ip', ''),
                     nullif(trim(split_part(v_xff, ',', greatest(1, array_length(string_to_array(v_xff, ','), 1)))), ''),
                     'unknown');
  v_hash := md5(v_ip || ':arcade-salt');
  delete from public.submit_log where created_at < now() - interval '1 hour';
  select count(*) into v_global from public.submit_log where created_at > now() - interval '1 minute';
  if v_global >= 120 then raise exception 'Very busy right now - try again in a minute.'; end if;
  select count(*) into v_recent from public.submit_log where ip_hash = v_hash and created_at > now() - interval '1 minute';
  if v_recent >= 6 then raise exception 'Slow down a little - try again in a minute.'; end if;
  insert into public.submit_log (ip_hash) values (v_hash);
end;
$$;
revoke all on function public._rate_limit() from public, anon, authenticated;

-- 4. Sign the Hall → returns a private Legend code
create or replace function public.claim_legend(p_game text, p_name text, p_duration_ms int)
returns json language plpgsql security definer set search_path = public as $$
declare
  g public.games; v_name text; v_norm text; v_code text; i int;
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into g from public.games where id = p_game;
  if not found or not g.has_legend then raise exception 'Unknown game'; end if;
  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if v_name !~ '^[A-Za-z0-9 _.-]{1,12}$' then raise exception 'Letters and numbers only (max 12).'; end if;
  v_norm := regexp_replace(translate(lower(v_name), '013457@$', 'oieastas'), '[^a-z]', '', 'g');
  if exists (select 1 from public.banned_words b where position(b.word in v_norm) > 0) then
    raise exception 'Please choose a friendlier name.';
  end if;
  if p_duration_ms is null or p_duration_ms < g.legend_min_ms or p_duration_ms > 6 * 3600 * 1000 then
    raise exception 'That run could not be verified.';
  end if;
  perform public._rate_limit();
  loop
    v_code := 'LEGEND-';
    for i in 1..6 loop v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.legends where code = v_code);
  end loop;
  insert into public.legends (game, name, code, duration_ms) values (p_game, v_name, v_code, p_duration_ms);
  return json_build_object('code', v_code);
end;
$$;

-- 5. Restore Legend status on another device
create or replace function public.restore_legend(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public._rate_limit();
  select name, game, created_at into r from public.legends where code = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found then return null; end if;
  return json_build_object('name', r.name, 'game', r.game, 'created_at', r.created_at);
end;
$$;

-- 6. The names in the Hall (first finders first)
create or replace function public.hall_of_legends()
returns table (name text, game text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.name, l.game, l.created_at from public.legends l order by l.created_at asc limit 500;
$$;

grant execute on function public.claim_legend(text, text, int) to anon, authenticated;
grant execute on function public.restore_legend(text)          to anon, authenticated;
grant execute on function public.hall_of_legends()             to anon, authenticated;


-- ── Handy admin queries (run by hand when needed) ────────────────
-- Remove a bad name everywhere:      delete from public.scores where lower(name) = lower('BadName');
-- Remove one suspicious score:       delete from public.scores where id = 123;
-- Wipe a game's board:               delete from public.scores where game = 'neon-snake';
-- See the latest 50 submissions:     select * from public.scores order by created_at desc limit 50;

-- ═══ Included from update-2026-10.sql (score checks) ═══
-- ════════════════════════════════════════════════════════════════
--  SCORE CHECK UPDATE (October 2026) — run ONCE in Supabase → SQL Editor.
--  Safe to run more than once. Does not delete any scores.
--
--  Before: the game told the server how long it had been played, so a cheater
--  could claim a long game and post a huge score.
--  Now:   every game starts with a one-time "game ticket". The server notes the
--         start time on ITS OWN clock, and a score is only accepted with a valid,
--         unused ticket and within the game's points-per-second limit for the time
--         that really passed.
-- ════════════════════════════════════════════════════════════════

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

