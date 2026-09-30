-- Star Strike 3D (game 16, Zone 3) joins the leaderboard — run once in Supabase → SQL Editor → Run.
insert into public.games (id, title, max_points_per_second)
values ('star-strike', 'Star Strike 3D', 12000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;
select id, title, max_points_per_second from public.games where id = 'star-strike';
