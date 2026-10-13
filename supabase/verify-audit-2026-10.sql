-- ════════════════════════════════════════════════════════════════
--  SECURITY CHECK (October 2026 audit) — paste into Supabase → SQL Editor and press Run.
--  READ-ONLY: it changes nothing. Every row should say ok = true.
--  If any row says false, the "fix" column says which file to run.
-- ════════════════════════════════════════════════════════════════
with checks as (
  -- 1. Row Level Security is on for every table in the public schema
  select 'RLS on: ' || tablename as item, rowsecurity as ok,
         'alter table public.' || tablename || ' enable row level security;' as fix
    from pg_tables where schemaname = 'public'

  union all
  -- 2. Visitors can only READ through table policies (no insert / update / delete policies)
  select 'No write policy on: ' || c.relname || ' (' || p.polname || ')', false,
         'drop policy "' || p.polname || '" on public.' || c.relname || ';'
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polcmd <> 'r'

  union all
  -- 3. The old score function (trusts the browser's game length) is closed
  select 'Old submit_score is closed',
         coalesce(bool_and(prosrc like '%arcade has been updated%'), true),
         'run supabase/update-2026-10.sql'
    from pg_proc where proname = 'submit_score' and pronamespace = 'public'::regnamespace

  union all
  -- 4. Every security-definer function pins its search_path (Security Advisor warning)
  select 'search_path pinned: ' || proname,
         exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%'),
         'add  set search_path = public  to ' || proname
    from pg_proc where pronamespace = 'public'::regnamespace and prosecdef

  union all
  -- 5. The functions the site calls all exist
  select 'Function exists: ' || f, exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace),
         'run supabase/zone4-completion.sql (or update-2026-10.sql for start_game / submit_score_v2)'
    from unnest(array['start_game', 'submit_score_v2', 'claim_legend_v2', 'restore_code', 'issue_code', 'sync_progress']) f

  union all
  -- 6. Internal helpers cannot be called by visitors
  select 'Not callable by visitors: ' || f,
         not coalesce((select has_function_privilege('anon', p.oid, 'execute') from pg_proc p
                        where p.proname = f and p.pronamespace = 'public'::regnamespace limit 1), false),
         'revoke all on function public.' || f || ' from public, anon, authenticated;'
    from unnest(array['_ip_hash', '_rate_limit', '_max_merge', 'cleanup_old_data']) f
)
select ok, item, case when ok then '' else fix end as fix from checks order by ok, item;
