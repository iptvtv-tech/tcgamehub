-- TC Pixel Craft (game 19, Zone 4) joins the leaderboard — run once in Supabase → SQL Editor → Run.
insert into public.games (id, title, max_points_per_second)
values ('tc-pixel-craft', 'TC Pixel Craft', 15000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;
select id, title, max_points_per_second from public.games where id = 'tc-pixel-craft';
