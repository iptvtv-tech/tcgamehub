-- Crypt of Crowns (game 18) — Zone 3's Legends game. Run once in Supabase → SQL Editor → Run.
-- Adds it to the leaderboard and lets flawless runs sign the Hall of Legends.
-- legend_min_ms: a perfect run takes about 4 minutes, so a legend claim faster than 2.5 minutes is refused.
alter table public.games add column if not exists has_legend boolean not null default false;
alter table public.games add column if not exists legend_min_ms integer not null default 90000;

insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms)
values ('crypt-of-crowns', 'Crypt of Crowns', 6000, true, 150000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second,
  has_legend = excluded.has_legend, legend_min_ms = excluded.legend_min_ms;

select id, title, max_points_per_second, has_legend, legend_min_ms from public.games where id = 'crypt-of-crowns';
