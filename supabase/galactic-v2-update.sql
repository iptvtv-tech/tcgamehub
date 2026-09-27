-- Galactic Alien Shooter v2 — run once in Supabase → SQL Editor
-- 1) wipe every saved score for this game (all-time, weekly, daily)
delete from public.scores where game = 'galactic-alien-shooter';
-- 2) new weapons + boss score faster, so raise the anti-cheat ceiling a little
update public.games set max_points_per_second = 8000 where id = 'galactic-alien-shooter';
-- 3) (only if the game row is missing)
insert into public.games (id, title, max_points_per_second)
values ('galactic-alien-shooter', 'Galactic Alien Shooter', 8000)
on conflict (id) do nothing;
