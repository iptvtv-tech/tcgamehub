-- Bubble Blitz (game 14, Zone 3) joins the leaderboard — run once in Supabase → SQL Editor → Run.
insert into public.games (id, title, max_points_per_second)
values ('bubble-blitz', 'Bubble Blitz', 8000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;
-- check: should show one row
select id, title, max_points_per_second from public.games where id = 'bubble-blitz';
