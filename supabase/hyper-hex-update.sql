-- Replace Pinball Blast with Hyper Hex — run once in Supabase → SQL Editor → Run.
-- 1) remove every Pinball Blast score, then the game itself
delete from public.scores where game = 'pinball-blast';
delete from public.games  where id   = 'pinball-blast';
-- 2) add Hyper Hex to the leaderboard
insert into public.games (id, title, max_points_per_second)
values ('hyper-hex', 'Hyper Hex', 3000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;
-- check: pinball-blast should be gone and hyper-hex listed
select id, title from public.games order by id;
