// ─────────────────────────────────────────────────────────────
//  The Golden Eggs (one per zone's Legends game) and the Golden Crown
//  (all five eggs, Zones 1–5 — the crown's band matches the first four: diamonds, sapphires, amethysts,
//  rubies — and the Zone 5 egg is the star emerald on top). Every egg after that adds another
//  star-cut jewel in its own colour.
//  Drawn as inline SVG so they stay crisp at any size.
// ─────────────────────────────────────────────────────────────
export const EGGS = {
  1: { name: 'Golden Vault Egg', short: 'Vault Egg', jewel: '#e0f2fe', jewel2: '#67e8f9', band: 'diamonds' },
  2: { name: 'Golden Heist Egg', short: 'Heist Egg', jewel: '#60a5fa', jewel2: '#1d4ed8', band: 'sapphires' },
  3: { name: 'Golden Crypt Egg', short: 'Crypt Egg', jewel: '#c084fc', jewel2: '#6b21a8', band: 'amethysts' },
  4: { name: 'Golden Throne Egg', short: 'Throne Egg', jewel: '#fca5a5', jewel2: '#b91c1c', band: 'rubies' },
  5: { name: 'Golden Beacon Egg', short: 'Beacon Egg', jewel: '#6ee7b7', jewel2: '#047857', band: 'star emeralds' },
};
export const eggName = (n) => EGGS[n]?.name || `Zone ${n} Egg`;

let uid = 0;
const EGG_PATH = 'M50 6 C24 6 10 44 10 70 C10 98 28 118 50 118 C72 118 90 98 90 70 C90 44 76 6 50 6Z';

/** A Golden Egg for zone n. won=false draws an empty glass stand silhouette. */
export function eggSVG(n, { size = 64, won = true, title = '' } = {}) {
  const e = EGGS[n] || EGGS[1], id = `egg${n}_${++uid}`;
  const h = Math.round(size * 1.2);
  if (!won) {
    return `<svg class="egg-svg empty" viewBox="0 0 100 124" width="${size}" height="${h}" role="img" aria-label="${title || eggName(n) + ' — not won yet'}">
      <path d="${EGG_PATH}" fill="rgba(255,255,255,.04)" stroke="rgba(253,230,138,.35)" stroke-width="2.5" stroke-dasharray="6 6"/>
      <text x="50" y="76" text-anchor="middle" font-size="30" fill="rgba(253,230,138,.45)" font-family="system-ui">?</text></svg>`;
  }
  // jewels along the band
  const jewels = [22, 36, 50, 64, 78].map((x, i) => {
    const y = 72 + Math.sin((x - 50) / 40) * 2;
    return n === 1
      ? `<path d="M${x} ${y - 6} l5 6 -5 6 -5 -6z" fill="url(#${id}j)" stroke="#fff" stroke-width=".8"/>`
      : `<circle cx="${x}" cy="${y}" r="${i === 2 ? 6 : 4.5}" fill="url(#${id}j)" stroke="#fde68a" stroke-width="1.2"/>`;
  }).join('');
  // a little motif on top: Zone 1 a keyhole, Zone 2 a mask, Zone 3 a skull, Zone 4 a throne, Zone 5 a ringed moon and its beacon star
  const motif = n === 5
    ? `<ellipse cx="50" cy="42" rx="17" ry="5" fill="none" stroke="#065f46" stroke-width="2.2" transform="rotate(-14 50 42)"/><circle cx="50" cy="42" r="9" fill="#065f46"/><circle cx="47" cy="39" r="2.4" fill="#6ee7b7" opacity=".8"/><path d="M50 18 l2 5 5 .4 -4 3.2 1.4 5 -4.4 -2.8 -4.4 2.8 1.4 -5 -4 -3.2 5 -.4z" fill="#fef3c7" stroke="#065f46" stroke-width=".8"/>`
    : n === 4
    ? `<path d="M40 30 h20 v16 h3 v12 h-4 v-6 h-18 v6 h-4 v-12 h3z" fill="#7f1d1d"/><path d="M43 33 h14 v11 h-14z" fill="#dc2626"/><path d="M41 30 l3 -5 3 5 3 -6 3 6 3 -5 3 5" fill="none" stroke="#7f1d1d" stroke-width="1.6"/>`
    : n === 1
    ? `<circle cx="50" cy="40" r="6" fill="#78350f"/><path d="M47 42 h6 l2 12 h-10z" fill="#78350f"/>`
    : n === 2
      ? `<path d="M34 38 q16 -8 32 0 q-2 10 -10 10 q-4 0 -6 -4 q-2 4 -6 4 q-8 0 -10 -10z" fill="#1e3a8a"/><circle cx="42" cy="40" r="2.6" fill="#fde68a"/><circle cx="58" cy="40" r="2.6" fill="#fde68a"/>`
      : `<circle cx="50" cy="38" r="10" fill="#f5f5f4"/><rect x="44" y="44" width="12" height="7" rx="2" fill="#f5f5f4"/><circle cx="46" cy="37" r="2.6" fill="#3b0764"/><circle cx="54" cy="37" r="2.6" fill="#3b0764"/><path d="M47 48v3M50 48v3M53 48v3" stroke="#3b0764" stroke-width="1.2"/>`;
  return `<svg class="egg-svg won" viewBox="0 0 100 124" width="${size}" height="${h}" role="img" aria-label="${title || eggName(n)}">
    <defs>
      <radialGradient id="${id}g" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fffbea"/><stop offset=".25" stop-color="#fde68a"/><stop offset=".65" stop-color="#f59e0b"/><stop offset="1" stop-color="#92400e"/></radialGradient>
      <radialGradient id="${id}j" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${e.jewel}"/><stop offset="1" stop-color="${e.jewel2}"/></radialGradient>
    </defs>
    <path d="${EGG_PATH}" fill="url(#${id}g)" stroke="#b45309" stroke-width="2"/>
    <path d="M12 66 Q50 80 88 66 L88 78 Q50 92 12 78Z" fill="#b45309" opacity=".85"/>
    <path d="M12 66 Q50 80 88 66" stroke="#fef3c7" stroke-width="1.5" fill="none"/>
    ${jewels}
    <g opacity=".9">${motif}</g>
    <path d="M28 96 q22 14 44 0" stroke="#fef3c7" stroke-width="1.4" fill="none" stroke-dasharray="2 4"/>
    <ellipse cx="34" cy="30" rx="8" ry="14" fill="#fff" opacity=".35" transform="rotate(-20 34 30)"/>
  </svg>`;
}

// Where the star stones sit (the Zone 5 emerald first, then the jewels of Zones 6, 7…): above the centre, then out along the band.
const JEWEL_SPOTS = [[120, 64], [42, 116], [198, 116], [94, 104], [146, 104], [120, 42]];
const jewelStar = (x, y, r, fill) => {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; }
  return `<path d="${d}Z" fill="${fill}" stroke="#fef3c7" stroke-width="1.6" stroke-linejoin="round"/>`;
};

/** The Golden Crown (for holders of all five Golden Eggs).
 *  jewels: zone numbers of the eggs past Zone 4 the player holds (Legends.crownStones()) — each draws a star stone. */
export function crownSVG({ size = 240, cls = '', jewels = [] } = {}) {
  const id = `crown_${++uid}`;
  const extra = jewels.slice(0, JEWEL_SPOTS.length).map((n, i) => {
    const e = EGGS[n] || EGGS[1], [x, y] = JEWEL_SPOTS[i];
    return `<radialGradient id="${id}x${i}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${e.jewel}"/><stop offset="1" stop-color="${e.jewel2}"/></radialGradient>${jewelStar(x, y, i ? 9 : 13, `url(#${id}x${i})`)}`;
  }).join('');
  return `<svg class="crown-svg ${cls}" viewBox="0 0 240 180" width="${size}" height="${Math.round(size * 0.75)}" role="img" aria-label="The Golden Crown">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbea"/><stop offset=".3" stop-color="#fde68a"/><stop offset=".7" stop-color="#f59e0b"/><stop offset="1" stop-color="#92400e"/></linearGradient>
      <radialGradient id="${id}r" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#f87171"/><stop offset="1" stop-color="#991b1b"/></radialGradient>
      <radialGradient id="${id}b" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e3a8a"/></radialGradient>
      <radialGradient id="${id}p" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c084fc"/><stop offset="1" stop-color="#581c87"/></radialGradient>
    </defs>
    <path d="M30 140 L18 50 L66 92 L92 30 L120 84 L148 30 L174 92 L222 50 L210 140 Z" fill="url(#${id}g)" stroke="#92400e" stroke-width="4" stroke-linejoin="round"/>
    <rect x="26" y="136" width="188" height="28" rx="6" fill="url(#${id}g)" stroke="#92400e" stroke-width="4"/>
    <circle cx="18" cy="48" r="9" fill="url(#${id}g)" stroke="#92400e" stroke-width="3"/><circle cx="92" cy="28" r="9" fill="url(#${id}g)" stroke="#92400e" stroke-width="3"/>
    <circle cx="148" cy="28" r="9" fill="url(#${id}g)" stroke="#92400e" stroke-width="3"/><circle cx="222" cy="48" r="9" fill="url(#${id}g)" stroke="#92400e" stroke-width="3"/>
    <circle cx="120" cy="150" r="10" fill="url(#${id}r)"/><circle cx="78" cy="150" r="8" fill="url(#${id}b)"/><circle cx="162" cy="150" r="8" fill="url(#${id}p)"/>
    <circle cx="44" cy="150" r="5" fill="#e0f2fe"/><circle cx="196" cy="150" r="5" fill="#e0f2fe"/>
    <path d="M120 96 l9 13 -9 13 -9 -13z" fill="url(#${id}r)" stroke="#fef3c7" stroke-width="1.5"/>
    <path d="M66 112 l6 9 -6 9 -6 -9z" fill="url(#${id}b)"/><path d="M174 112 l6 9 -6 9 -6 -9z" fill="url(#${id}p)"/>
    <path d="M40 136 Q120 120 200 136" stroke="#fef3c7" stroke-width="2" fill="none" opacity=".7"/>
    <text x="120" y="176" text-anchor="middle" font-size="9" font-weight="800" fill="#78350f" font-family="system-ui" letter-spacing="2">TC LEGENDS</text>
    ${extra}
  </svg>`;
}
