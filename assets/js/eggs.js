// ─────────────────────────────────────────────────────────────
//  The Frost Crystals (one per zone's Legends game) and the Frost Crown
//  (all five crystals, Zones 1–5 — the crown's band matches the first four: diamonds, sapphires, amethysts,
//  rubies — and the Zone 5 crystal is the star emerald on top). Every crystal after that adds another
//  star-cut jewel in its own colour. (Until Nov 2026 these were the Golden Eggs and the Golden Crown;
//  the code still calls them eggs — EGGS, eggSVG, Legends.eggs() — so saved progress carries over.)
//  Drawn as inline SVG so they stay crisp at any size.
// ─────────────────────────────────────────────────────────────
export const EGGS = {
  1: { name: 'Vault Crystal', short: 'Vault Crystal', jewel: '#e0f2fe', jewel2: '#67e8f9', band: 'diamonds' },
  2: { name: 'Heist Crystal', short: 'Heist Crystal', jewel: '#60a5fa', jewel2: '#1d4ed8', band: 'sapphires' },
  3: { name: 'Crypt Crystal', short: 'Crypt Crystal', jewel: '#c084fc', jewel2: '#6b21a8', band: 'amethysts' },
  4: { name: 'Throne Crystal', short: 'Throne Crystal', jewel: '#fca5a5', jewel2: '#b91c1c', band: 'rubies' },
  5: { name: 'Beacon Crystal', short: 'Beacon Crystal', jewel: '#6ee7b7', jewel2: '#047857', band: 'star emeralds' },
};
export const eggName = (n) => EGGS[n]?.name || `Zone ${n} Crystal`;

let uid = 0;
// A tall six-sided ice crystal; the zone's motif is frozen inside, over a glow in the zone's jewel colour.
const CRYSTAL_PATH = 'M50 4 L80 34 L74 98 L50 120 L26 98 L20 34 Z';

/** A Frost Crystal for zone n. won=false draws an empty dashed outline. */
export function eggSVG(n, { size = 64, won = true, title = '' } = {}) {
  const e = EGGS[n] || EGGS[1], id = `egg${n}_${++uid}`;
  const h = Math.round(size * 1.2);
  if (!won) {
    return `<svg class="egg-svg empty" viewBox="0 0 100 124" width="${size}" height="${h}" role="img" aria-label="${title || eggName(n) + ' — not won yet'}">
      <path d="${CRYSTAL_PATH}" fill="rgba(186,230,253,.05)" stroke="rgba(186,230,253,.4)" stroke-width="2.5" stroke-dasharray="6 6" stroke-linejoin="round"/>
      <text x="50" y="76" text-anchor="middle" font-size="30" fill="rgba(186,230,253,.5)" font-family="system-ui">?</text></svg>`;
  }
  // a little motif frozen inside: Zone 1 a keyhole, Zone 2 a mask, Zone 3 a skull, Zone 4 a throne, Zone 5 a ringed moon and its beacon star
  const motif = n === 5
    ? `<ellipse cx="50" cy="42" rx="17" ry="5" fill="none" stroke="#065f46" stroke-width="2.2" transform="rotate(-14 50 42)"/><circle cx="50" cy="42" r="9" fill="#065f46"/><circle cx="47" cy="39" r="2.4" fill="#6ee7b7" opacity=".8"/><path d="M50 18 l2 5 5 .4 -4 3.2 1.4 5 -4.4 -2.8 -4.4 2.8 1.4 -5 -4 -3.2 5 -.4z" fill="#f0f9ff" stroke="#065f46" stroke-width=".8"/>`
    : n === 4
    ? `<path d="M40 30 h20 v16 h3 v12 h-4 v-6 h-18 v6 h-4 v-12 h3z" fill="#7f1d1d"/><path d="M43 33 h14 v11 h-14z" fill="#dc2626"/><path d="M41 30 l3 -5 3 5 3 -6 3 6 3 -5 3 5" fill="none" stroke="#7f1d1d" stroke-width="1.6"/>`
    : n === 1
    ? `<circle cx="50" cy="40" r="6" fill="#0c4a6e"/><path d="M47 42 h6 l2 12 h-10z" fill="#0c4a6e"/>`
    : n === 2
      ? `<path d="M34 38 q16 -8 32 0 q-2 10 -10 10 q-4 0 -6 -4 q-2 4 -6 4 q-8 0 -10 -10z" fill="#1e3a8a"/><circle cx="42" cy="40" r="2.6" fill="#e0f2fe"/><circle cx="58" cy="40" r="2.6" fill="#e0f2fe"/>`
      : `<circle cx="50" cy="38" r="10" fill="#f5f5f4"/><rect x="44" y="44" width="12" height="7" rx="2" fill="#f5f5f4"/><circle cx="46" cy="37" r="2.6" fill="#3b0764"/><circle cx="54" cy="37" r="2.6" fill="#3b0764"/><path d="M47 48v3M50 48v3M53 48v3" stroke="#3b0764" stroke-width="1.2"/>`;
  return `<svg class="egg-svg won" viewBox="0 0 100 124" width="${size}" height="${h}" role="img" aria-label="${title || eggName(n)}">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0f9ff"/><stop offset=".35" stop-color="#bae6fd"/><stop offset=".7" stop-color="#38bdf8"/><stop offset="1" stop-color="#075985"/></linearGradient>
      <radialGradient id="${id}j" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${e.jewel}"/><stop offset="1" stop-color="${e.jewel2}" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="${CRYSTAL_PATH}" fill="url(#${id}g)" stroke="#e0f2fe" stroke-width="2" stroke-linejoin="round"/>
    <path d="M50 4 L80 34 L74 98 L50 120 Z" fill="#0c4a6e" opacity=".22"/>
    <path d="M50 4 L20 34 L50 46 Z" fill="#fff" opacity=".45"/>
    <path d="M50 4 L80 34 L50 46 Z" fill="#fff" opacity=".18"/>
    <ellipse cx="50" cy="72" rx="24" ry="28" fill="url(#${id}j)" opacity=".85"/>
    <g opacity=".92" transform="translate(0 26)">${motif}</g>
    <path d="M20 34 L50 46 L80 34 M50 46 L50 120 M26 98 L50 88 L74 98" stroke="#f0f9ff" stroke-width="1.2" fill="none" opacity=".55" stroke-linejoin="round"/>
    <path d="M31 18 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" fill="#fff" opacity=".9"/>
  </svg>`;
}

// Where the star stones sit (the Zone 5 emerald first, then the jewels of Zones 6, 7…): above the centre, then out along the band.
const JEWEL_SPOTS = [[120, 64], [42, 116], [198, 116], [94, 104], [146, 104], [120, 42]];
const jewelStar = (x, y, r, fill) => {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; }
  return `<path d="${d}Z" fill="${fill}" stroke="#fef3c7" stroke-width="1.6" stroke-linejoin="round"/>`;
};

/** The Frost Crown (for holders of all five Frost Crystals).
 *  jewels: zone numbers of the eggs past Zone 4 the player holds (Legends.crownStones()) — each draws a star stone. */
export function crownSVG({ size = 240, cls = '', jewels = [] } = {}) {
  const id = `crown_${++uid}`;
  const extra = jewels.slice(0, JEWEL_SPOTS.length).map((n, i) => {
    const e = EGGS[n] || EGGS[1], [x, y] = JEWEL_SPOTS[i];
    return `<radialGradient id="${id}x${i}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${e.jewel}"/><stop offset="1" stop-color="${e.jewel2}"/></radialGradient>${jewelStar(x, y, i ? 9 : 13, `url(#${id}x${i})`)}`;
  }).join('');
  return `<svg class="crown-svg ${cls}" viewBox="0 0 240 180" width="${size}" height="${Math.round(size * 0.75)}" role="img" aria-label="The Frost Crown">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0f9ff"/><stop offset=".3" stop-color="#bae6fd"/><stop offset=".7" stop-color="#38bdf8"/><stop offset="1" stop-color="#075985"/></linearGradient>
      <radialGradient id="${id}r" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#f87171"/><stop offset="1" stop-color="#991b1b"/></radialGradient>
      <radialGradient id="${id}b" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e3a8a"/></radialGradient>
      <radialGradient id="${id}p" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c084fc"/><stop offset="1" stop-color="#581c87"/></radialGradient>
    </defs>
    <path d="M30 140 L18 50 L66 92 L92 30 L120 84 L148 30 L174 92 L222 50 L210 140 Z" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="4" stroke-linejoin="round"/>
    <rect x="26" y="136" width="188" height="28" rx="6" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="4"/>
    <path d="M18 34 l7 12 -7 12 -7 -12z" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/><path d="M92 14 l7 12 -7 12 -7 -12z" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M148 14 l7 12 -7 12 -7 -12z" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/><path d="M222 34 l7 12 -7 12 -7 -12z" fill="url(#${id}g)" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="120" cy="150" r="10" fill="url(#${id}r)"/><circle cx="78" cy="150" r="8" fill="url(#${id}b)"/><circle cx="162" cy="150" r="8" fill="url(#${id}p)"/>
    <circle cx="44" cy="150" r="5" fill="#e0f2fe"/><circle cx="196" cy="150" r="5" fill="#e0f2fe"/>
    <path d="M120 96 l9 13 -9 13 -9 -13z" fill="url(#${id}r)" stroke="#e0f2fe" stroke-width="1.5"/>
    <path d="M66 112 l6 9 -6 9 -6 -9z" fill="url(#${id}b)"/><path d="M174 112 l6 9 -6 9 -6 -9z" fill="url(#${id}p)"/>
    <path d="M40 136 Q120 120 200 136" stroke="#f0f9ff" stroke-width="2" fill="none" opacity=".8"/>
    <text x="120" y="176" text-anchor="middle" font-size="9" font-weight="800" fill="#0c4a6e" font-family="system-ui" letter-spacing="2">TC LEGENDS</text>
    ${extra}
  </svg>`;
}
