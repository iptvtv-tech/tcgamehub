-- ════════════════════════════════════════════════════════════════════
--  Quick Play Arcade — rewards update (26 Oct 2026). Re-runnable.
--  Run the whole file once in Supabase → SQL Editor.
--
--  Adds arcade tokens to the Legend-code progress sync: the lifetime total earned
--  (`tokens.earned`) and the cosmetics bought (`owned`, item → timestamp). Both only
--  ever grow, so they merge with the existing max-merge like plays and badges.
--  Balance is worked out in the browser (earned − price of everything owned).
--  Requires supabase/zone4-completion.sql (legend_progress, _max_merge) to have been run.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.sync_progress(p_code text, p_data jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_old jsonb; v_new jsonb; v_at timestamptz; v_saved boolean := false; k text;
begin
  if v_code !~ '^LEGEND-[A-Z0-9]{6}$'
     or not (exists (select 1 from public.legends where code = v_code) or exists (select 1 from public.legend_codes where code = v_code))
  then return null; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 80000 then raise exception 'Progress data is too large.'; end if;
  select data, updated_at into v_old, v_at from public.legend_progress where code = v_code;
  v_old := coalesce(v_old, '{}'::jsonb);
  -- a game whose scores were reset since the saved copy: drop its old best / level
  if jsonb_typeof(p_data -> 'resets') = 'object' then
    for k in select key from jsonb_each(p_data -> 'resets') where jsonb_typeof(value) = 'number' loop
      if (p_data -> 'resets' ->> k)::numeric > coalesce(case when jsonb_typeof(v_old -> 'resets' -> k) = 'number' then (v_old -> 'resets' ->> k)::numeric end, 0) then
        v_old := jsonb_set(v_old, '{best}', coalesce(v_old -> 'best', '{}'::jsonb) - k);
        v_old := jsonb_set(v_old, '{maxLevel}', coalesce(v_old -> 'maxLevel', '{}'::jsonb) - k);
      end if;
    end loop;
  end if;
  v_new := jsonb_build_object(
    'plays',    public._max_merge(v_old -> 'plays',    p_data -> 'plays'),
    'maxLevel', public._max_merge(v_old -> 'maxLevel', p_data -> 'maxLevel'),
    'best',     public._max_merge(v_old -> 'best',     p_data -> 'best'),
    'ach',      public._max_merge(v_old -> 'ach',      p_data -> 'ach'),
    'resets',   public._max_merge(v_old -> 'resets',   p_data -> 'resets'),
    -- arcade tokens (rewards, Oct 2026): lifetime total earned + items bought; both only grow
    'tokens',   public._max_merge(v_old -> 'tokens',   p_data -> 'tokens'),
    'owned',    public._max_merge(v_old -> 'owned',    p_data -> 'owned'));
  -- save at most once every 5 seconds per code (reading back always works)
  if v_at is null or v_at < now() - interval '5 seconds' then
    insert into public.legend_progress (code, data, updated_at) values (v_code, v_new, now())
    on conflict (code) do update set data = excluded.data, updated_at = now();
    v_saved := true;
  end if;
  return json_build_object('saved', v_saved, 'data', v_new);
end;
$$;
grant execute on function public.sync_progress(text, jsonb) to anon, authenticated;

-- check: should list sync_progress
select proname from pg_proc where proname = 'sync_progress';
