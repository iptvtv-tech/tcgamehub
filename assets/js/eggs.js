// ─────────────────────────────────────────────────────────────
//  The Golden Eggs (one per zone's Legends game) and the Golden Crown
//  (all three eggs). Drawn as inline SVG so they stay crisp at any size.
// ─────────────────────────────────────────────────────────────
export const EGGS = {
  1: { name: 'Golden Vault Egg', short: 'Vault Egg', jewel: '#e0f2fe', jewel2: '#67e8f9', band: 'diamonds' },
  2: { name: 'Golden Heist Egg', short: 'Heist Egg', jewel: '#60a5fa', jewel2: '#1d4ed8', band: 'sapphires' },
  3: { name: 'Golden Crypt Egg', short: 'Crypt Egg', jewel: '#c084fc', jewel2: '#6b21a8', band: 'amethysts' },
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
  // a little motif on top: Zone 1 a keyhole, Zone 2 a mask, Zone 3 a skull
  const motif = n === 1
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

/** The Golden Crown (for holders of every egg). */
export function crownSVG({ size = 240, cls = '' } = {}) {
  const id = `crown_${++uid}`;
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
  </svg>`;
}
