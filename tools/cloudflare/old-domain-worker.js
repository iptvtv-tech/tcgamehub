// Cloudflare Worker for the OLD address, tcgamehub.win, after the move to tcarcade.com.
// Not part of the site: paste it into Cloudflare (Workers & Pages → Create → Worker) on moving
// day and add these routes on the tcgamehub.win zone:
//     tcgamehub.win/carry*            tcgamehub.win/assets/js/carry-out.js            tcgamehub.win/sw.js
// Everything else on tcgamehub.win is a plain 301 to the same page on tcarcade.com (a Cloudflare
// Redirect Rule, which skips these three paths).
//
// Why: saved progress lives in each player's browser under the address it was made on. These
// three files must still be served FROM tcgamehub.win so they can read it:
//   /carry/        the "Bring my progress" page (carry/index.html + assets/js/carry-out.js)
//   /sw.js         lets browsers that still run an old service worker update to the one that
//                  carries progress over on the next visit
// GitHub Pages only answers for one address (tcarcade.com), so this worker fetches the files
// from there and serves them here.
const NEW = 'https://tcarcade.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path === '/carry') path = '/carry/';
    if (!['/carry/', '/assets/js/carry-out.js', '/sw.js'].includes(path)) {
      return Response.redirect(NEW + url.pathname + url.search, 301);
    }
    const res = await fetch(NEW + path, { cf: { cacheTtl: 300 } });
    if (!res.ok) return Response.redirect(NEW + '/', 302);
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'no-cache');
    headers.delete('Location');
    return new Response(res.body, { status: 200, headers });
  },
};
