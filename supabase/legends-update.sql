-- ════════════════════════════════════════════════════════════════
--  LEGENDS UPDATE — adds The Vault Job and the Hall of Legends.
--  Run ONCE in Supabase → SQL Editor. Safe to run again.
-- ════════════════════════════════════════════════════════════════

-- 1. Games can be "Legend games" (with a minimum believable run time for a legend claim)
alter table public.games add column if not exists has_legend boolean not null default false;
alter table public.games add column if not exists legend_min_ms integer not null default 90000;

insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms)
values ('the-vault-job', 'The Vault Job', 8000, true, 90000)
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

-- Admin: remove a name from the Hall:   delete from public.legends where lower(name) = lower('BadName');
-- Check: should list 5 tables, all rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
