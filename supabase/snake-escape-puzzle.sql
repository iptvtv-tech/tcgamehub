-- Snake Escape Puzzle (game 7) — run once in Supabase → SQL Editor
insert into public.games (id, title, max_points_per_second)
values ('snake-escape-puzzle', 'Snake Escape Puzzle', 4000)
on conflict (id) do nothing;
