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

-- 2. (Audit, Oct 2026) This step used to re-create the OLD submit_score, which trusts the
--    game length the browser reports. Since update-2026-10.sql every score goes through
--    start_game + submit_score_v2 instead, so re-running this file must NOT re-open that door.
--    It now keeps the old function closed (a friendly "refresh the page" message).
create or replace function public.submit_score(
  p_game text, p_name text, p_score int, p_level int, p_duration_ms int, p_mode text default 'normal'
) returns json language plpgsql security definer set search_path = public as $$
begin
  raise exception 'The arcade has been updated - refresh the page (Ctrl+Shift+R) and play again to save scores.';
end;
$$;

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
