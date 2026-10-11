-- ─────────────────────────────────────────────────────────────
--  Zone 4 completion — ONE combined file for the last Zone 4 games.
--  Run once in Supabase → SQL Editor → Run (safe to run again).
--  Games are added to this file as they are built:
--    21 Neon Drift 3D       ✔
--    22 Crystal Cascade 3D  ✔
--    23 Void Breaker 3D     ✔
--    24 Crown Heist: The Deep Vaults (Legends, vault codes) (to come)
--    + Legend codes carry your game progress between browsers   ✔
-- ─────────────────────────────────────────────────────────────

-- Game 21 · Neon Drift 3D joins the leaderboard
insert into public.games (id, title, max_points_per_second)
values ('neon-drift', 'Neon Drift 3D', 12000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Game 22 · Crystal Cascade 3D joins the leaderboard
insert into public.games (id, title, max_points_per_second)
values ('crystal-cascade', 'Crystal Cascade 3D', 9000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Game 23 · Void Breaker 3D joins the leaderboard
insert into public.games (id, title, max_points_per_second)
values ('void-breaker', 'Void Breaker 3D', 15000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- ─────────────────────────────────────────────────────────────
--  Legend codes carry your progress
--  Games played (which opens each zone), levels reached, best scores and badges are saved
--  against your Legend code and come back when the code is entered on another browser.
--  Numbers only ever go up when two browsers are merged, so nothing is lost.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.legend_progress (
  code       text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.legend_progress enable row level security;   -- no policies on purpose: only sync_progress() touches it

-- merge two { key: number } maps, keeping the higher number for every key
create or replace function public._max_merge(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, max(v) as v from (
      select key as k, (value #>> '{}')::numeric as v
        from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) where jsonb_typeof(value) = 'number'
      union all
      select key, (value #>> '{}')::numeric
        from jsonb_each(case when jsonb_typeof(b) = 'object' then b else '{}'::jsonb end) where jsonb_typeof(value) = 'number'
    ) s
    where length(k) <= 80 and v >= 0
    group by k
    limit 3000
  ) m;
$$;

create or replace function public.sync_progress(p_code text, p_data jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_old jsonb; v_new jsonb; v_at timestamptz; v_saved boolean := false; k text;
begin
  if v_code !~ '^LEGEND-[A-Z0-9]{6}$' or not exists (select 1 from public.legends where code = v_code) then return null; end if;
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
    'resets',   public._max_merge(v_old -> 'resets',   p_data -> 'resets'));
  -- save at most once every 5 seconds per code (reading back always works)
  if v_at is null or v_at < now() - interval '5 seconds' then
    insert into public.legend_progress (code, data, updated_at) values (v_code, v_new, now())
    on conflict (code) do update set data = excluded.data, updated_at = now();
    v_saved := true;
  end if;
  return json_build_object('saved', v_saved, 'data', v_new);
end;
$$;
revoke all on function public._max_merge(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_progress(text, jsonb) to anon, authenticated;

select id, title, max_points_per_second from public.games where id in ('neon-drift', 'crystal-cascade', 'void-breaker');
select proname from pg_proc where proname = 'sync_progress';
