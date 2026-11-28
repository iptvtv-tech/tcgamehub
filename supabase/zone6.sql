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
-- (Rebuilt side-on on 21 Nov 2026.) Points: crystals (6 × run, a golden one 60); tricks (80 × run
-- a flip, a double 240, a triple 480, plus 40 for a grab or 90 for a superman, plus 50 for a sword
-- spin); a yeti cut down (150 × run) or flattened (200 × run); a snowball cut out of the air (30);
-- a rocket (20); a letter (50, and 500 for all four); a rock jumped (8), all in the x5 combo; a
-- rush 200 × run; 10 × run per 100 m; and at the hut 100 × run plus 300 × run for no tumbles.
-- A run 15 with every kicker flipped as many times as the air allows, a superman and a sword spin
-- each time and everything collected pays about 13,000 points a second at x5, so the ceiling is
-- 25,000 (it was 4,000, then 12,000: run this file again).
insert into public.games (id, title, max_points_per_second)
values ('avalanche-run', 'Avalanche Run', 25000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Game 36 · Inferno Vault joins the leaderboard (Zone 6's Legends game).
-- Points scale with the level: a fire opal 40 × level, a frost shard 25 × level, a guard put out
-- 150 × level, a fireball smashed 20 × level (all in the x5 combo); every opal on a level 150 ×
-- level; at the vault door 100 × level, plus 250 × level for the Ghost bonus (never seen) and
-- 2 × level per point of ice left. A perfect level 15 pays about 60,000 points at x5 in well
-- under ten seconds, but averaged over a game it is far less, so 12,000 leaves lots of room.
insert into public.games (id, title, max_points_per_second)
values ('inferno-vault', 'Inferno Vault', 12000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: three rows should come back.
select id, title, max_points_per_second from public.games where id in ('magma-escape', 'avalanche-run', 'inferno-vault');
