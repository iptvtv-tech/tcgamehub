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

-- Game 30 · Vault of Stars — Zone 5's Legends game. Joins the leaderboard and lets
-- a flawless run sign the Hall of Legends (claim_legend_v2 checks has_legend).
-- legend_min_ms: the fastest possible run through all 16 vaults is about 2 minutes of play
-- (vaults/check.mjs), so a Legend claim faster than 90 seconds is refused.
alter table public.games add column if not exists has_legend boolean not null default false;
alter table public.games add column if not exists legend_min_ms integer not null default 90000;
insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms)
values ('vault-of-stars', 'Vault of Stars', 3000, true, 90000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second,
  has_legend = excluded.has_legend, legend_min_ms = excluded.legend_min_ms;

-- Check: two rows should come back.
select id, title, max_points_per_second, has_legend, legend_min_ms from public.games where id in ('lunar-delivery', 'vault-of-stars');

-- Orbit Hopper (Zone 5, slot 26). Hop + star scoring scales with level and the
-- x8 multiplier, so allow a high points-per-second ceiling like Lunar Delivery's.
insert into public.games (id, title, max_points_per_second)
values ('orbit-hopper', 'Orbit Hopper', 6000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: three rows should come back.
select id, title, max_points_per_second from public.games where id in ('lunar-delivery', 'vault-of-stars', 'orbit-hopper');

-- Station Defense (Zone 5, slot 27). Kill points scale with level and the x6 combo;
-- even a strong run averages under 2,000 points a second, so 8,000 leaves lots of room.
insert into public.games (id, title, max_points_per_second)
values ('station-defense', 'Station Defense', 8000)
on conflict (id) do update set title = excluded.title, max_points_per_second = excluded.max_points_per_second;

-- Check: four rows should come back.
select id, title, max_points_per_second from public.games where id in ('lunar-delivery', 'vault-of-stars', 'orbit-hopper', 'station-defense');
