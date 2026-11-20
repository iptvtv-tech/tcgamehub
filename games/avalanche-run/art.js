// ─────────────────────────────────────────────────────────────
//  AVALANCHE RUN — the Iceman on his sled, seen from behind. He is the same man of ice who climbed
//  out of the volcano in Magma Escape: faceted blue body, the two ice spikes on his head, the pale
//  collar and the scarf (which now streams back towards you). Drawn in "art units": the sled is
//  70 wide and the snow is at y = 0; the caller scales and places it.
// ─────────────────────────────────────────────────────────────
export const PAL = {
  ice: { body: '#7ebce6', light: '#a9ddf5', shade: '#4a8cc8', head: '#5f9bd0', headTop: '#8cc3e8', ears: '#cfe8f5', earLit: '#f2fbff', collar: '#eef6fa', scarf: '#8cc3e8', scarfLine: '#cfe8f5', frost: '#cfe8f5', rim: '#ffffff',
    deck: '#b45309', deckLit: '#d97706', runner: '#7c2d12', rope: '#fde68a' },
  gold: { body: '#e3b341', light: '#fde68a', shade: '#b7791f', head: '#d4a017', headTop: '#f5d061', ears: '#fde68a', earLit: '#fffbeb', collar: '#fff7d6', scarf: '#f5d27a', scarfLine: '#fff1c1', frost: '#fff1c1', rim: '#fffbeb',
    deck: '#f59e0b', deckLit: '#fcd34d', runner: '#92400e', rope: '#fffbeb' },
};

function poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

/** st: { t, lean (−1..1 steering), tuck, grab, air, boost } */
export function drawIcemanSled(ctx, st, pal = PAL.ice) {
  const low = st.tuck || st.grab ? 0.7 : 1, lean = st.lean * 5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the sled: two runners curling up at the front (hidden behind the deck from here), a slatted deck
  poly(ctx, [-31, 4, -22, 4, -22, -8, -31, -8], pal.runner); poly(ctx, [22, 4, 31, 4, 31, -8, 22, -8], pal.runner);
  ctx.fillStyle = pal.rim; ctx.fillRect(-32, 3, 11, 2); ctx.fillRect(21, 3, 11, 2);
  poly(ctx, [-35, -6, 35, -6, 33, -18, -33, -18], pal.deck);
  poly(ctx, [-33, -18, 33, -18, 32, -22, -32, -22], pal.deckLit);
  ctx.strokeStyle = pal.runner; ctx.lineWidth = 1; ctx.beginPath(); for (const x of [-17, 0, 17]) { ctx.moveTo(x, -7); ctx.lineTo(x, -18); } ctx.stroke();
  // the scarf, streaming back and up towards the camera
  const fl = st.t * 10, sx = -lean * 1.5;
  const sc = [-6, -56 * low - 22];
  for (let i = 1; i <= 4; i++) sc.push(sx - 4 + Math.sin(fl + i) * (2 + i), -56 * low - 22 - i * 9 - (st.air ? 4 : 0));
  for (let i = 4; i >= 1; i--) sc.push(sx + 5 + Math.sin(fl + i + 0.7) * (2 + i), -56 * low - 20 - i * 8.5 - (st.air ? 4 : 0));
  sc.push(6, -56 * low - 22);
  poly(ctx, sc, pal.scarf);
  // legs folded on the deck, arms out to the steering rope (or down to the deck for a grab)
  poly(ctx, [-21, -22, -8, -22, -10, -32 * low - 4, -20, -30 * low - 4], pal.shade); poly(ctx, [21, -22, 8, -22, 10, -32 * low - 4, 20, -30 * low - 4], pal.shade);
  const hand = st.grab ? [30, -14] : [26 + lean, -30 * low - 2];
  poly(ctx, [-17, -50 * low - 18, -13, -42 * low - 16, -hand[0] + 4, hand[1] + 4, -hand[0] - 3, hand[1] - 2], pal.ears);
  poly(ctx, [17, -50 * low - 18, 13, -42 * low - 16, hand[0] - 4, hand[1] + 4, hand[0] + 3, hand[1] - 2], pal.ears);
  if (!st.grab) { ctx.strokeStyle = pal.rope; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-hand[0], hand[1]); ctx.lineTo(-30, -20); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(30, -20); ctx.stroke(); }
  // the body: faceted ice, lit from the left
  const top = -56 * low - 20, tor = [-19 + lean * 0.4, top, 19 + lean * 0.4, top, 22, -40 * low - 8, 17, -22, -17, -22, -22, -40 * low - 8];
  poly(ctx, tor, pal.body);
  poly(ctx, [-19 + lean * 0.4, top, 0, top, -5, -30, -17, -22, -22, -40 * low - 8], pal.light);
  poly(ctx, [19 + lean * 0.4, top, 6, top, 4, -26, 17, -22, 22, -40 * low - 8], pal.shade);
  ctx.strokeStyle = pal.frost; ctx.lineWidth = 1; ctx.globalAlpha *= 0.8;
  ctx.beginPath(); ctx.moveTo(-9, top + 6); ctx.lineTo(-5, top + 18 * low); ctx.lineTo(-11, top + 28 * low); ctx.moveTo(10, top + 8); ctx.lineTo(8, top + 20 * low); ctx.lineTo(13, top + 30 * low); ctx.stroke();
  ctx.globalAlpha /= 0.8;
  // collar and head, with the two spikes
  poly(ctx, [-15, top + 3, 15, top + 3, 12, top - 5, -12, top - 5], pal.collar);
  const hx = lean * 0.9, hy = top - 5;
  poly(ctx, [hx - 13, hy, hx + 13, hy, hx + 15, hy - 13, hx + 9, hy - 24, hx - 9, hy - 24, hx - 15, hy - 13], pal.head);
  poly(ctx, [hx - 13, hy, hx - 15, hy - 13, hx - 9, hy - 24, hx, hy - 24, hx - 3, hy - 8], pal.headTop);
  poly(ctx, [hx - 12, hy - 20, hx - 16, hy - 40, hx - 4, hy - 24], pal.ears); poly(ctx, [hx + 12, hy - 20, hx + 17, hy - 38, hx + 4, hy - 24], pal.ears);
  poly(ctx, [hx - 12, hy - 20, hx - 16, hy - 40, hx - 9, hy - 25], pal.earLit);
  // a rim of light when a clean landing has him flying
  if (st.boost) { ctx.strokeStyle = pal.rim; ctx.lineWidth = 2; ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.moveTo(tor[0], tor[1]); for (let i = 2; i < tor.length; i += 2) ctx.lineTo(tor[i], tor[i + 1]); ctx.closePath(); ctx.stroke(); ctx.globalAlpha /= 0.7; }
}

/** An ice wolf running beside the sled, seen from behind. Art units: about 34 wide, snow at y = 0.
 *  st: { t, state, side } — it crouches low with burning eyes before a lunge. */
export function drawWolf(ctx, st) {
  const crouch = st.state === 'crouch', lunge = st.state === 'lunge', down = st.state === 'down';
  const run = Math.sin(st.t * 18), low = crouch ? 0.72 : 1;
  ctx.lineJoin = 'round';
  if (down) ctx.rotate(st.side * 1.3);
  // legs
  ctx.fillStyle = '#7f8ea3';
  for (const [x, ph] of [[-11, 0], [11, Math.PI]]) { const k = Math.sin(st.t * 18 + ph) * (crouch ? 0 : 5); ctx.fillRect(x - 3, -16 * low, 6, 16 * low - Math.max(0, k)); }
  // body, seen end on: haunches, back, shoulders
  poly(ctx, [-15, -14 * low, 15, -14 * low, 17, -30 * low, 10, -40 * low, -10, -40 * low, -17, -30 * low], '#c9d6e6');
  poly(ctx, [-15, -14 * low, 0, -14 * low, -3, -38 * low, -10, -40 * low, -17, -30 * low], '#e6eef8');
  // tail
  poly(ctx, [-3, -30 * low, 3, -30 * low, 6 + run * 4, -8 * low, 2 + run * 5, -2, -4 + run * 4, -10 * low], '#f4f8fd');
  // head, turned towards the sled, ears up
  const hx = -st.side * (lunge ? 14 : 8), hy = -44 * low - (lunge ? 2 : 0);
  poly(ctx, [hx - 9, hy + 8, hx + 9, hy + 8, hx + 11, hy - 4, hx + 6, hy - 12, hx - 6, hy - 12, hx - 11, hy - 4], '#dbe6f2');
  poly(ctx, [hx - 9, hy - 9, hx - 11, hy - 22, hx - 3, hy - 12], '#aebcd0'); poly(ctx, [hx + 9, hy - 9, hx + 11, hy - 22, hx + 3, hy - 12], '#aebcd0');
  poly(ctx, [hx - st.side * 4, hy + 2, hx - st.side * 16, hy + 6, hx - st.side * 5, hy + 9], '#aebcd0');     // muzzle
  if (lunge) poly(ctx, [hx - st.side * 8, hy + 8, hx - st.side * 15, hy + 7, hx - st.side * 11, hy + 13], '#ffffff');   // teeth
  ctx.fillStyle = crouch || lunge ? '#ef4444' : '#38bdf8'; ctx.beginPath(); ctx.arc(hx - st.side * 5, hy - 2, crouch ? 3.2 : 2.2, 0, Math.PI * 2); ctx.fill();
}

/** A yeti standing on the slope, facing up the hill at you. Art units: about 70 wide and 120 tall, snow at y = 0.
 *  st: { t, arm (0..1, raised to throw), flat } */
export function drawYeti(ctx, st) {
  ctx.lineJoin = 'round';
  if (st.flat) {                         // flattened: a heap of fur with two dazed eyes
    poly(ctx, [-40, 0, 40, 0, 34, -14, 10, -22, -14, -20, -36, -12], '#e8eff7'); poly(ctx, [-40, 0, 0, 0, -6, -20, -14, -20, -36, -12], '#ffffff');
    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2; for (const x of [-8, 8]) { ctx.beginPath(); ctx.moveTo(x - 3, -15); ctx.lineTo(x + 3, -9); ctx.moveTo(x + 3, -15); ctx.lineTo(x - 3, -9); ctx.stroke(); }
    return;
  }
  const sway = Math.sin(st.t * 2.4) * 2, up = st.arm;
  // legs and body: a big pear of white fur
  poly(ctx, [-26, 0, -6, 0, -8, -30, -28, -30], '#d5e0ee'); poly(ctx, [6, 0, 26, 0, 28, -30, 8, -30], '#c3d1e3');
  poly(ctx, [-34, -26, 34, -26, 38, -70, 26, -96, -26, -96, -38, -70], '#f4f8fd');
  poly(ctx, [34, -26, 6, -26, 10, -96, 26, -96, 38, -70], '#d5e0ee');
  for (let i = 0; i < 5; i++) poly(ctx, [-30 + i * 14, -26, -22 + i * 14, -26, -26 + i * 14, -16], '#f4f8fd');         // shaggy hem
  // arms: one hangs, one winds up with a snow boulder
  poly(ctx, [-36, -86, -46 + sway, -40, -34 + sway, -36, -26, -80], '#e6eef8');
  const ax = 44, ay = -86 - up * 44;
  poly(ctx, [26, -80, 36, -88, ax + 6, ay, ax - 8, ay + 6], '#d5e0ee');
  if (up > 0.15) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ax + 2, ay - 12, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfe0f0'; ctx.beginPath(); ctx.arc(ax + 6, ay - 8, 7, 0, Math.PI * 2); ctx.fill(); }
  // head: blue-grey face, brow, horns of ice
  poly(ctx, [-20, -92, 20, -92, 22, -112, 12, -124, -12, -124, -22, -112], '#f4f8fd');
  poly(ctx, [-13, -96, 13, -96, 15, -110, 8, -117, -8, -117, -15, -110], '#5b7fa6');
  poly(ctx, [-16, -120, -24, -136, -8, -124], '#bfe3f7'); poly(ctx, [16, -120, 24, -136, 8, -124], '#bfe3f7');
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(-6, -109, 2.6, 0, Math.PI * 2); ctx.arc(6, -109, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-7, -101, 14, 3);
}
