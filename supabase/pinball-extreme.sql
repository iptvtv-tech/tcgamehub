-- Pinball Blast Extreme (game 15, Zone 3) joins the leaderboard — run once in Supabase → SQL Editor → Run.
-- (The old Pinball Blast scores were deleted when it was replaced, so this board starts fresh.)
insert into public.games (id, title, max_points_per_second)
values ('pinball-blast', 'Pinball Blast Extreme', 15000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;
-- check: should show one row
select id, title, max_points_per_second from public.games where id = 'pinball-blast';
