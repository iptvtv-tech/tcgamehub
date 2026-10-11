-- Quick Play Arcade · 3D upgrade (11 Oct 2026)
-- Matches the game titles in Supabase to the new 3D names.
-- Safe to run more than once. Run in Supabase → SQL Editor → Run.
-- (The site reads titles from assets/js/games.js, so nothing breaks if this isn't run.)

update public.games set title = 'Turbo Rush 3D'      where id = 'turbo-rush';
update public.games set title = 'Bubble Blitz 3D'    where id = 'bubble-blitz';
update public.games set title = 'Pinball Blast 3D'   where id = 'pinball-blast';
update public.games set title = 'Crypt of Crowns 3D' where id = 'crypt-of-crowns';
update public.games set title = 'TC Pixel Craft 3D'  where id = 'tc-pixel-craft';

-- Check: every Zone 3 and Zone 4 game should now end in "3D"
select id, title from public.games
where id in ('turbo-rush','bubble-blitz','pinball-blast','star-strike','eggspress','crypt-of-crowns','tc-pixel-craft','dungeon-escape')
order by id;
