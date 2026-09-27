-- ════════════════════════════════════════════════════════════════
--  SECURITY & PRIVACY UPDATE (September 2026) — run ONCE in Supabase → SQL Editor.
--  Safe to run more than once. Does not delete any current scores.
--  (supabase/schema.sql already contains these changes for fresh installs.)
-- ════════════════════════════════════════════════════════════════

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

-- 4. Check your security settings (all four tables should say rowsecurity = true):
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
