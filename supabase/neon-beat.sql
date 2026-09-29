-- Neon Beat (game 8) — run once in Supabase → SQL Editor
insert into public.games (id, title, max_points_per_second)
values ('neon-beat', 'Neon Beat', 3000)
on conflict (id) do nothing;
