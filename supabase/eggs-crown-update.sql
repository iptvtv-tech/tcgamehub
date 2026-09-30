-- ─────────────────────────────────────────────────────────────
--  GOLDEN EGGS & THE GOLDEN CROWN — run once in Supabase → SQL Editor → Run.
--  Safe to run twice. It does NOT delete anything.
--
--  One Legend code can now hold several Legends games (one Golden Egg each):
--   • claim_legend_v2  — signing the Hall again with the SAME name and your code
--                        adds the new egg to that code instead of making a new one
--   • restore_legend_v2 — restoring a code brings back EVERY egg on it
--  (The old claim_legend / restore_legend keep working for anyone on an old page.)
-- ─────────────────────────────────────────────────────────────

-- 1. A code may now appear on several rows (one per Legends game).
alter table public.legends drop constraint if exists legends_code_key;
create unique index if not exists legends_code_game_idx on public.legends (code, game);
create index if not exists legends_code_idx on public.legends (code);

-- 2. Sign the Hall, keeping your existing code when the name matches.
create or replace function public.claim_legend_v2(p_game text, p_name text, p_duration_ms int, p_code text default null)
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

  -- reuse the code you already have, if it's yours (same name)
  if p_code is not null then
    select l.code into v_code from public.legends l
     where l.code = upper(trim(p_code)) and lower(l.name) = lower(v_name) limit 1;
  end if;
  if v_code is not null then
    if exists (select 1 from public.legends where code = v_code and game = p_game) then
      return json_build_object('code', v_code);          -- this egg is already on the code
    end if;
  else
    loop
      v_code := 'LEGEND-';
      for i in 1..6 loop v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
      exit when not exists (select 1 from public.legends where code = v_code);
    end loop;
  end if;
  insert into public.legends (game, name, code, duration_ms) values (p_game, v_name, v_code, p_duration_ms);
  return json_build_object('code', v_code);
end;
$$;

-- 3. Restore every egg on a code.
create or replace function public.restore_legend_v2(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  perform public._rate_limit();
  select json_build_object('name', (array_agg(name order by created_at))[1],
                           'games', json_agg(distinct game),
                           'created_at', min(created_at))
    into v
    from public.legends where code = upper(trim(coalesce(p_code, '')));
  if v is null or v ->> 'name' is null then return null; end if;
  return v;
end;
$$;

grant execute on function public.claim_legend_v2(text, text, int, text) to anon, authenticated;
grant execute on function public.restore_legend_v2(text)                to anon, authenticated;

-- 4. Make sure Crypt of Crowns is a Legends game (in case its own SQL wasn't run yet).
insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms)
values ('crypt-of-crowns', 'Crypt of Crowns', 6000, true, 150000)
on conflict (id) do update set has_legend = true, legend_min_ms = excluded.legend_min_ms;

-- Check: should list both new functions.
select proname from pg_proc where proname in ('claim_legend_v2', 'restore_legend_v2');
