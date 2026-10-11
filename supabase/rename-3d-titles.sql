-- Optional tidy-up (Oct 2026): match the Supabase game titles to the new 3D names.
-- The site shows titles from assets/js/games.js, so nothing breaks if this isn't run.
update public.games set title = 'Turbo Rush 3D'      where id = 'turbo-rush';
update public.games set title = 'Crypt of Crowns 3D' where id = 'crypt-of-crowns';
update public.games set title = 'TC Pixel Craft 3D'  where id = 'tc-pixel-craft';
update public.games set title = 'Bubble Blitz 3D'    where id = 'bubble-blitz';
update public.games set title = 'Pinball Blast 3D'   where id = 'pinball-blast';
