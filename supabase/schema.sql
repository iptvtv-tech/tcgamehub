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
  ('crazy-putt',    'Crazy Putt',    8000)
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

-- ── Handy admin queries (run by hand when needed) ────────────────
-- Remove a bad name everywhere:      delete from public.scores where lower(name) = lower('BadName');
-- Remove one suspicious score:       delete from public.scores where id = 123;
-- Wipe a game's board:               delete from public.scores where game = 'neon-snake';
-- See the latest 50 submissions:     select * from public.scores order by created_at desc limit 50;
