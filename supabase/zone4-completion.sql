-- ─────────────────────────────────────────────────────────────
--  Zone 4 completion — ONE combined file for the last Zone 4 games.
--  Run once in Supabase → SQL Editor → Run (safe to run again).
--  Games are added to this file as they are built:
--    21 Neon Drift 3D       ✔
--    22 Crystal Cascade 3D  ✔
--    23 Void Breaker 3D     ✔
--    24 Crown Heist: The Deep Vaults (Legends, vault codes) (to come)
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

select id, title, max_points_per_second from public.games where id in ('neon-drift', 'crystal-cascade', 'void-breaker');
