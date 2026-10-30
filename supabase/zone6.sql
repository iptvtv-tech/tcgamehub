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

-- Check: one row should come back.
select id, title, max_points_per_second from public.games where id in ('magma-escape');
