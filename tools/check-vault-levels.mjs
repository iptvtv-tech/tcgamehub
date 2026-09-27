// Proves every Vault Job level can be finished without being seen.
// Run from this folder:  node check-vault-levels.mjs
import { LEVELS, giftShop } from '../games/the-vault-job/levels.js';
import { parseLevel, solve, walkable, period, caught } from '../games/the-vault-job/sim.js';
let ok = true;
for (const [n, def] of Object.entries(LEVELS)) {
  try {
    const L = parseLevel(def);
    // guard paths must be on walkable, non-hiding tiles
    for (const w of L.watchers) if (w.type !== 'camera') for (const st of w.timeline) {
      if (!walkable(L, st.x, st.y) || L.grid[st.y][st.x] === 'H') { console.log(`L${n}: guard on bad tile ${st.x},${st.y} (${L.grid[st.y][st.x]})`); ok = false; break; }
    }
    const t = solve(L); const slow = solve(L, 8000, 3); const slower = solve(L, 8000, 4);
    // treasure reachability without detection (optional, informational)
    const tres = L.treasures.map(([x, y]) => { const c = { ...L, exit: [x, y], vault: null }; return solve(c); });
    console.log(`L${n.padStart(2)} ${def.name.padEnd(22)} period=${String(period(L)).padStart(6)} fastest safe route: ${t < 0 ? 'NONE (' + t + ')' : (t / 10).toFixed(1) + 's'}  slow(0.3s/step): ${slow<0?"✗":(slow/10).toFixed(0)+"s"} slower(0.4s/step): ${slower<0?"✗":(slower/10).toFixed(0)+"s"} treasures: ${tres.map((v) => (v < 0 ? '✗' : '✓')).join('')}`);
    if (t < 0) ok = false;
  } catch (e) { console.log(`L${n}: ERROR ${e.message}`); ok = false; }
}
parseLevel(giftShop(5));
console.log(ok ? 'ALL LEVELS OK' : 'PROBLEMS FOUND');
