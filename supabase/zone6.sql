-- ─────────────────────────────────────────────────────────────
--  Zone 6 · Inferno — one combined, re-runnable file.
--  Paste the whole thing into Supabase → SQL Editor → Run.
--  New Zone 6 games get added to this same file as they're built.
-- ─────────────────────────────────────────────────────────────

-- Game 31 · Magma Escape joins the leaderboard.
-- Points scale with the level and the x5 combo, and the bosses pay out in one go (the Volcano
-- Lord: 1,000 × level 15). Averaged over a whole game even a great run stays far below 1,000
-- points a second, so 3,000 leaves lots of room.
insert into public.games (id, title, max_points_per_second)
values ('magma-escape', 'Magma Escape', 3000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Game 32 · Avalanche Run joins the leaderboard.
-- (Rebuilt side-on on 21 Nov 2026.) Points: crystals (6 × run); tricks (80 × run a flip, a double
-- 240, a triple 480, plus 40 × run for a grab); a yeti cut down (150 × run) or flattened (200 × run);
-- a snowball cut out of the air (30 × run); a rock jumped (8 × run), all in the x5 combo; 10 × run
-- per 100 m; and at the hut 100 × run plus 300 × run for no tumbles. A run 15 with every kicker
-- flipped as many times as the air allows, a grab each time and every crystal pays about 6,800
-- points a second at x5, so the ceiling is 12,000 (it was 4,000: run this file again).
insert into public.games (id, title, max_points_per_second)
values ('avalanche-run', 'Avalanche Run', 12000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: two rows should come back.
select id, title, max_points_per_second from public.games where id in ('magma-escape', 'avalanche-run');
