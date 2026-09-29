-- ─────────────────────────────────────────────────────────────
--  ZONE 2 UPDATE — run once in Supabase → SQL Editor → Run.
--  Adds the Zone 2 games to the leaderboard and makes Heist Planner
--  a Legends game (Hall of Legends / Zone 2 crown). Safe to run twice.
--  It does NOT delete any scores.
-- ─────────────────────────────────────────────────────────────
alter table public.games add column if not exists has_legend boolean not null default false;
alter table public.games add column if not exists legend_min_ms integer not null default 90000;

insert into public.games (id, title, max_points_per_second, has_legend, legend_min_ms) values
  ('snake-escape-puzzle',    'Snake Escape Puzzle',    4000, false, 90000),
  ('neon-beat',              'Neon Beat',              3000, false, 90000),
  ('tower-topple',           'Tower Topple',           3000, false, 90000),
  ('pinball-blast',          'Pinball Blast',          6000, false, 90000),
  ('galactic-alien-shooter', 'Galactic Alien Shooter', 8000, false, 90000),
  ('heist-planner',          'Heist Planner',          3000, true,  240000)
on conflict (id) do update set
  title = excluded.title,
  max_points_per_second = excluded.max_points_per_second,
  has_legend = excluded.has_legend,
  legend_min_ms = excluded.legend_min_ms;

-- Check: you should see 12 games, with the-vault-job and heist-planner marked has_legend = true
select id, title, max_points_per_second, has_legend from public.games order by id;
