-- ─────────────────────────────────────────────────────────────
--  Zone 5 · Beyond — one combined, re-runnable file.
--  Paste the whole thing into Supabase → SQL Editor → Run.
--  New Zone 5 games get added to this same file as they're built.
-- ─────────────────────────────────────────────────────────────

-- Game 25 · Lunar Delivery 3D joins the leaderboard
-- (8,000 points/second averaged over a whole game is far above what a great player scores,
--  even with the x5 combo through a Stardust Storm.)
insert into public.games (id, title, max_points_per_second)
values ('lunar-delivery', 'Lunar Delivery 3D', 8000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: one row should come back.
select id, title, max_points_per_second from public.games where id in ('lunar-delivery');
