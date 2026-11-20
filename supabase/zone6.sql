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
-- Points: skimming past trees (5 × run), crystals (10 × run), tricks (60 × run a spin), wolves
-- (40 × run), yetis (150 × run), the giant (500 × run), all but the giant in the x5 combo; 10 × run
-- per 100 m; and at the hut 5 × run for every metre ahead of the avalanche plus 300 × run for no
-- tumbles. A run 15 with a triple spin off every ramp pays about 2,000 points a second, so the
-- ceiling is 4,000 (it was 3,000 before tricks and creatures were in: run this file again).
insert into public.games (id, title, max_points_per_second)
values ('avalanche-run', 'Avalanche Run', 4000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: two rows should come back.
select id, title, max_points_per_second from public.games where id in ('magma-escape', 'avalanche-run');
