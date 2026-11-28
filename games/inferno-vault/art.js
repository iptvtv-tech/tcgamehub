// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — the art (canvas, no image files). The Iceman himself, his blade, his puddle,
//  the frost shards and the fireballs are Magma Escape's own drawings (imported in game.js).
//  This file draws the vault: its stone and lava, the alcoves' shadow, the vault door, the fire
//  opals, and the Fire King's guards with their lantern beams; from section 2 the ice bridges,
//  ice statues, flame jets, heat lamps and the freeze's cold; from section 3 the cold vents, the
//  ember key and its iron gates, the locked door, brutes and sentinels.
// ─────────────────────────────────────────────────────────────
import { TILE, ROCK, LEDGE, LAVA, SHADOW, tileAt, GUARD_H, BEAM_Y, beamHalf, ICE_WARN, STATUE_T, JET_H, JET_P, JET_OFF, JET_WARN, LAMP_R, LAMP_HALF, lampAt, VENT_H } from './world.js';

const TAU = Math.PI * 2;
const INK = '#07050a';

// a small fixed hash, so the stone looks the same every time (cosmetic only)
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Paint a whole level's static tiles (rock, ledges, alcoves) onto a canvas of the map's size,
 * once per level. scale = device pixels per game pixel.
 */
export function paintMap(m, scale) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(m.w * scale); cv.height = Math.ceil(m.h * scale);
  const g = cv.getContext('2d');
  g.scale(scale, scale);
  const gates = new Set(m.gates || []);
  for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
    if (gates.has(r * m.C + c)) continue;              // iron gates are drawn as they open (drawGates)
    const k = tileAt(m, c, r), x = c * TILE, y = r * TILE;
    if (k === SHADOW) drawAlcove(g, m, c, r, x, y);
    else if (k === ROCK) drawRock(g, m, c, r, x, y);
    else if (k === LEDGE) drawLedge(g, x, y, c, r);
  }
  return cv;
}

function drawRock(g, m, c, r, x, y) {
  const h = hash(c, r), shade = 14 + Math.floor(h * 8);
  g.fillStyle = `rgb(${shade + 10},${shade},${shade + 6})`;
  g.fillRect(x, y, TILE, TILE);
  // blocks of dark basalt, laid like a vault wall
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1;
  const off = r % 2 ? TILE / 2 : 0;
  g.beginPath(); g.moveTo(x, y + 0.5); g.lineTo(x + TILE, y + 0.5);
  g.moveTo(x + ((off + TILE / 2) % TILE) + 0.5, y); g.lineTo(x + ((off + TILE / 2) % TILE) + 0.5, y + TILE);
  g.stroke();
  if (h > 0.82) { g.fillStyle = 'rgba(255,120,40,.10)'; g.fillRect(x + 4, y + 6, 9, 2); }   // a seam of ember
  // the floor's top edge, lit by the fire below
  const above = tileAt(m, c, r - 1);
  if (above !== ROCK) {
    const lg = g.createLinearGradient(0, y, 0, y + 7);
    lg.addColorStop(0, 'rgba(255,140,60,.55)'); lg.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = lg; g.fillRect(x, y, TILE, 7);
    g.fillStyle = '#3a2a2c'; g.fillRect(x, y, TILE, 2);
  }
  const below = tileAt(m, c, r + 1);
  if (below !== ROCK) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y + TILE - 3, TILE, 3); }
}

function drawLedge(g, x, y, c, r) {
  g.fillStyle = '#3b2c2a'; g.fillRect(x, y, TILE, 8);
  g.fillStyle = '#5a4038'; g.fillRect(x, y, TILE, 2);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y + 8, TILE, 2);
  if (hash(c, r) > 0.5) { g.fillStyle = '#2a1e1c'; g.fillRect(x + 10, y + 3, 1.5, 4); }
}

function drawAlcove(g, m, c, r, x, y) {
  // a recess in the back wall, deep in shadow
  g.fillStyle = '#030206'; g.fillRect(x, y, TILE, TILE);
  const left = tileAt(m, c - 1, r) !== SHADOW, right = tileAt(m, c + 1, r) !== SHADOW, top = tileAt(m, c, r - 1) !== SHADOW;
  g.fillStyle = 'rgba(70,50,60,.55)';
  if (left) g.fillRect(x, y, 2, TILE);
  if (right) g.fillRect(x + TILE - 2, y, 2, TILE);
  if (top) {
    // an arch over the alcove
    g.fillStyle = '#1b1418'; g.fillRect(x, y, TILE, 4);
    g.fillStyle = 'rgba(255,140,60,.18)'; g.fillRect(x, y + 4, TILE, 1);
  }
}

/** The wall behind the floors: dark stone, pillars and the glow of fire far below. Screen space. */
export function drawBackdrop(ctx, W, vh, camY, t) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#120a10'); g.addColorStop(1, '#2a0e0a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, vh);
  // pillars, scrolling slower than the floors
  const py = -(camY * 0.4) % 160;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  for (const x of [70, 230, 390]) ctx.fillRect(x - 18, 0, 36, vh);
  ctx.fillStyle = 'rgba(255,120,40,.05)';
  for (let y = py; y < vh; y += 160) for (const x of [70, 230, 390]) ctx.fillRect(x - 20, y, 40, 6);
  // ember motes rising
  ctx.fillStyle = 'rgba(255,150,70,.5)';
  for (let i = 0; i < 18; i++) {
    const s = hash(i, 7), x = (s * W + Math.sin(t * 0.6 + i) * 14) % W;
    const y = vh - ((t * (18 + s * 24) + i * 53 - camY * 0.2) % (vh + 40));
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

/** Lava tiles in view (world space), with a glow above them. */
export function drawLavaTiles(ctx, m, r0, r1, t, glow) {
  for (let r = Math.max(0, r0); r <= Math.min(m.R - 1, r1); r++) for (let c = 0; c < m.C; c++) {
    if (tileAt(m, c, r) !== LAVA) continue;
    const x = c * TILE, y = r * TILE, top = tileAt(m, c, r - 1) !== LAVA;
    const lg = ctx.createLinearGradient(0, y, 0, y + TILE);
    lg.addColorStop(0, '#ffd27a'); lg.addColorStop(0.25, '#ff7a1a'); lg.addColorStop(1, '#b3200a');
    ctx.fillStyle = lg; ctx.fillRect(x, y + (top ? 5 : 0), TILE, TILE - (top ? 5 : 0));
    if (top) {
      ctx.fillStyle = '#ffb060';
      ctx.beginPath(); ctx.moveTo(x, y + 6);
      for (let i = 0; i <= 4; i++) ctx.lineTo(x + i * 6, y + 5 + Math.sin(t * 3 + c * 1.7 + i) * 1.8);
      ctx.lineTo(x + TILE, y + 9); ctx.lineTo(x, y + 9); ctx.closePath(); ctx.fill();
      if (glow) { ctx.globalAlpha = 0.5; ctx.drawImage(glow, x - 12, y - 26, TILE + 24, 40); ctx.globalAlpha = 1; }
      // a bubble now and then
      const ph = (t * 0.7 + hash(c, r)) % 1;
      if (ph < 0.25) { ctx.fillStyle = '#ffe2a8'; ctx.beginPath(); ctx.arc(x + 6 + hash(r, c) * 12, y + 8, 1.5 + ph * 8, 0, TAU); ctx.fill(); }
    }
  }
}

/** The vault door at the bottom of the level: round, iron, its wheel glowing with heat. */
export function drawDoor(ctx, d, t, glow, open = 0, locked = false) {
  const x = d.x, y = d.y - 34, R = 30;
  ctx.save();
  if (glow) { ctx.globalAlpha = 0.6; ctx.drawImage(glow, x - 60, y - 60, 120, 120); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#1a1416'; ctx.beginPath(); ctx.arc(x, y, R + 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3c3a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#6a5650'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R - 6, 0, TAU); ctx.stroke();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.fillStyle = '#7a6660'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (R - 3), y + Math.sin(a) * (R - 3), 1.6, 0, TAU); ctx.fill(); }
  // the wheel turns as the door opens
  ctx.translate(x, y); ctx.rotate(open * Math.PI * 1.5 + Math.sin(t) * 0.04);
  ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke(); }
  ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  ctx.restore();
  // the threshold
  ctx.fillStyle = '#2a2024'; ctx.fillRect(x - 26, d.y - 3, 52, 3);
  if (locked) drawPadlock(ctx, x, y, t);
}

/** A fire opal: a red-orange gem with a flame inside. */
export function drawOpal(ctx, x, y, t, glow) {
  const b = Math.sin(t * 3 + x * 0.1) * 2;
  ctx.save(); ctx.translate(x, y + b);
  if (glow) { ctx.globalAlpha = 0.55; ctx.drawImage(glow, -18, -18, 36, 36); ctx.globalAlpha = 1; }
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -2); ctx.lineTo(4, 8); ctx.lineTo(-4, 8); ctx.lineTo(-7, -2); ctx.closePath();
  const g = ctx.createLinearGradient(0, -9, 0, 8); g.addColorStop(0, '#ffd27a'); g.addColorStop(0.5, '#ff5a1a'); g.addColorStop(1, '#8a1408');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(0, -7); ctx.lineTo(-1, -2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** A guard's lantern beam (world space): a warm cone out to `reach`. */
export function drawBeam(ctx, g, t, alarmed) {
  if (g.state === 'down' || g.state === 'frozen' || g.reach <= 0) return;
  const lx = g.x + g.face * 12, ly = g.y - BEAM_Y, R = g.reach, hh = beamHalf(R);
  const flick = 0.92 + Math.sin(t * 17 + g.id) * 0.05 + Math.sin(t * 7.3 + g.id * 3) * 0.03;
  ctx.save();
  const grad = ctx.createLinearGradient(lx, 0, lx + g.face * R, 0);
  const col = alarmed ? '255,80,40' : '255,190,90';
  grad.addColorStop(0, `rgba(${col},${(0.42 * flick).toFixed(3)})`); grad.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(lx, ly - 6); ctx.lineTo(lx + g.face * R, ly - hh); ctx.lineTo(lx + g.face * R, ly + hh); ctx.lineTo(lx, ly + 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * A fire guard: living flame in dark iron, a lantern held out in front. g = { x, y (feet), face,
 * state ('patrol'|'turn'|'alert'|'hunt'|'down'), t }. walk = its walking phase.
 */
export function drawGuard(ctx, g, t, glow, walk) {
  ctx.save(); ctx.translate(g.x, g.y);
  const brute = g.kind === 'brute', sentinel = g.kind === 'sentinel', sc = brute ? 1.22 : 1;
  if (g.state === 'down') {
    if (brute) ctx.scale(1.25, 1.25);
    // put out: an empty suit of armour, slumped, smoking
    ctx.fillStyle = '#2a2226'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -6, 15, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.face * 10, -10, 6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  const frozen = g.state === 'frozen';
  if (frozen) { glow = null; t = g.id * 1.7; walk = 0; }       // a statue: the flame stands still
  ctx.scale(g.face * sc, sc);
  if (sentinel) {                                                // a sentinel's halberd, upright behind it
    ctx.strokeStyle = '#4a3c3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-13, -64); ctx.stroke();
    ctx.fillStyle = '#6a5650'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-13, -72); ctx.lineTo(-9, -62); ctx.lineTo(-13, -58); ctx.lineTo(-20, -62); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const bob = g.state === 'patrol' ? Math.abs(Math.sin(walk)) * 1.5 : 0;
  const step = g.state === 'patrol' ? Math.sin(walk) * 4 : 0;
  // flame body (behind the armour)
  if (glow) { ctx.globalAlpha = 0.7; ctx.drawImage(glow, -26, -GUARD_H - 18, 52, 60); ctx.globalAlpha = 1; }
  // legs
  ctx.fillStyle = '#2b2226'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.fillRect(-7 + step, -14, 5, 14); ctx.strokeRect(-7 + step, -14, 5, 14);
  ctx.fillRect(2 - step, -14, 5, 14); ctx.strokeRect(2 - step, -14, 5, 14);
  ctx.translate(0, -bob);
  // the flame showing between the plates
  const fl = (a) => 0.5 + 0.5 * Math.sin(t * 13 + a);
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath(); ctx.moveTo(-9, -14); ctx.quadraticCurveTo(-13, -30 - fl(1) * 4, -4, -40); ctx.quadraticCurveTo(4, -34 - fl(2) * 3, 9, -40); ctx.quadraticCurveTo(13, -28, 9, -14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath(); ctx.moveTo(-4, -16); ctx.quadraticCurveTo(-6, -28, 0, -34 - fl(3) * 3); ctx.quadraticCurveTo(6, -28, 4, -16); ctx.closePath(); ctx.fill();
  // breastplate
  ctx.fillStyle = '#3a2e30'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(7, -32); ctx.lineTo(-7, -32); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(5, -24); ctx.stroke();
  // helmet: a dark iron pot with a glowing slit
  ctx.fillStyle = '#2b2226'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-8, -33); ctx.lineTo(8, -33); ctx.lineTo(7, -46); ctx.quadraticCurveTo(0, -50, -7, -46); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = g.state === 'alert' || g.state === 'hunt' ? '#ffffff' : '#ffb060';
  ctx.fillRect(-1, -42, 8, 2.4);
  if (brute) {                                                   // horns and shoulder plates
    ctx.fillStyle = '#5a4a46'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-7, -44); ctx.quadraticCurveTo(-16, -48, -15, -57); ctx.quadraticCurveTo(-11, -50, -5, -47); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -44); ctx.quadraticCurveTo(16, -48, 15, -57); ctx.quadraticCurveTo(11, -50, 5, -47); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2226';
    ctx.beginPath(); ctx.ellipse(-10, -31, 6, 4, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(10, -31, 6, 4, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // a crest of flame on top
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath(); ctx.moveTo(-4, -47); ctx.quadraticCurveTo(-2, -56 - fl(4) * 4, 2, -58); ctx.quadraticCurveTo(1, -52, 5, -47); ctx.closePath(); ctx.fill();
  // arm and lantern
  const raise = g.state === 'hunt' ? -10 : 0;
  ctx.strokeStyle = '#2b2226'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(4, -28); ctx.lineTo(11, -28 + raise * 0.5); ctx.stroke();
  ctx.fillStyle = '#1a1416'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillRect(9, -36 + raise, 7, 10); ctx.strokeRect(9, -36 + raise, 7, 10);
  ctx.fillStyle = '#ffe2a8'; ctx.fillRect(10.5, -34 + raise, 4, 6);
  if (glow) { ctx.globalAlpha = 0.8; ctx.drawImage(glow, -4, -50 + raise, 34, 34); ctx.globalAlpha = 1; }
  if (frozen) drawIceBlock(ctx, g.t);
  ctx.restore();
  // "!" — it has seen him
  if (g.state === 'alert') {
    const a = Math.min(1, (0.55 - g.t) * 8);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff3a1a'; ctx.lineWidth = 2;
    const top = (g.h || GUARD_H) * (brute ? 1.08 : 1);
    ctx.beginPath(); ctx.arc(g.x, g.y - top - 18, 10, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3a1a'; ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', g.x, g.y - top - 17);
    ctx.restore();
  } else if (g.state === 'hunt' && g.lost > 0) {
    ctx.save(); ctx.fillStyle = '#ffb060'; ctx.font = '900 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('?', g.x, g.y - GUARD_H - 12); ctx.restore();
  }
}

/** A puff of steam over a guard that has just gone out (seconds since). */
export function drawGuardSmoke(ctx, g, t) {
  if (g.t > 2.5) return;
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const k = (g.t * 0.8 + i * 0.2) % 1;
    ctx.globalAlpha = (1 - k) * 0.35 * Math.max(0, 1 - g.t / 2.5);
    ctx.fillStyle = '#c8c0d0';
    ctx.beginPath(); ctx.arc(g.x + Math.sin(i * 2 + t) * 6, g.y - 12 - k * 40, 4 + k * 8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ── Section 2: ice, jets, lamps ──────────────────────────────

/** The ice around a frozen guard (in the guard's own space, feet at 0). left: seconds until it thaws. */
function drawIceBlock(ctx, left) {
  const thaw = left < 1.2 ? 0.5 + 0.5 * Math.sin(left * 30) : 1;
  ctx.save();
  ctx.globalAlpha = 0.62 * (0.75 + 0.25 * thaw);
  const g = ctx.createLinearGradient(0, -GUARD_H - 16, 0, 0);
  g.addColorStop(0, '#e8f7ff'); g.addColorStop(1, '#7ebce6');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-16, 0); ctx.lineTo(-17, -GUARD_H + 4); ctx.lineTo(-9, -GUARD_H - 16); ctx.lineTo(8, -GUARD_H - 14);
  ctx.lineTo(18, -GUARD_H + 2); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = '#cfe8f5'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-12, -GUARD_H + 2); ctx.moveTo(-6, -GUARD_H - 8); ctx.lineTo(3, -GUARD_H - 9); ctx.stroke();
  if (left < STATUE_T * 0.3) {                       // cracks as it starts to thaw
    ctx.strokeStyle = 'rgba(7,5,10,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, -GUARD_H - 10); ctx.lineTo(-3, -30); ctx.lineTo(4, -20); ctx.lineTo(-2, -8); ctx.stroke();
  }
  ctx.restore();
}

/** Ice bridges (world space): pale blue blocks where the lava was; they crack, then blink, before they melt. */
export function drawIce(ctx, m, ice, t) {
  for (const e of ice) {
    const c = e.i % m.C, r = Math.floor(e.i / m.C), x = c * TILE, y = r * TILE;
    const warn = e.t < ICE_WARN, blink = e.t < 0.5 ? 0.55 + 0.45 * Math.sin(t * 40) : 1;
    ctx.save(); ctx.globalAlpha = blink;
    const g = ctx.createLinearGradient(0, y, 0, y + TILE);
    g.addColorStop(0, '#f2fbff'); g.addColorStop(0.35, '#bfe6f7'); g.addColorStop(1, '#5f9bd0');
    ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + TILE - 6, y + 3); ctx.stroke();
    if (warn) {
      ctx.strokeStyle = 'rgba(7,5,10,.6)'; ctx.lineWidth = 1;
      const h = hash(c, r);
      ctx.beginPath(); ctx.moveTo(x + 4 + h * 8, y + 2); ctx.lineTo(x + 10, y + 11); ctx.lineTo(x + 6 + h * 10, y + TILE - 2);
      ctx.moveTo(x + 10, y + 11); ctx.lineTo(x + TILE - 3, y + 8 + h * 6); ctx.stroke();
      // the lava showing through underneath
      ctx.fillStyle = `rgba(255,122,26,${(0.35 * (1 - e.t / ICE_WARN)).toFixed(3)})`; ctx.fillRect(x, y + TILE * 0.55, TILE, TILE * 0.45);
    }
    ctx.restore();
  }
}

/** A flame jet: an iron vent in the floor; it sputters, then roars up (state from jetState). */
export function drawJet(ctx, j, state, t, glow) {
  const x = j.x, y = j.y;
  ctx.save();
  if (state === 'on' || state === 'warn') {
    const u = (((t + j.phase) % JET_P) + JET_P) % JET_P;
    const k = state === 'on' ? Math.min(1, (u - JET_OFF - JET_WARN) / 0.12) : 0;
    const h = state === 'on' ? JET_H * (0.35 + 0.65 * k) : 8 + Math.abs(Math.sin(t * 31)) * 10;
    const fl = (a) => Math.sin(t * 23 + a) * 3;
    if (glow) { ctx.globalAlpha = state === 'on' ? 0.85 : 0.4; ctx.drawImage(glow, x - 30, y - h - 20, 60, h + 30); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#ff5a1a';
    ctx.beginPath(); ctx.moveTo(x - 10, y - 2); ctx.quadraticCurveTo(x - 13 + fl(1), y - h * 0.5, x + fl(2), y - h); ctx.quadraticCurveTo(x + 13 + fl(3), y - h * 0.5, x + 10, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffb060';
    ctx.beginPath(); ctx.moveTo(x - 6, y - 2); ctx.quadraticCurveTo(x - 7 + fl(4), y - h * 0.45, x + fl(5), y - h * 0.8); ctx.quadraticCurveTo(x + 7 + fl(6), y - h * 0.45, x + 6, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff2c8';
    ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.quadraticCurveTo(x - 3, y - h * 0.3, x, y - h * 0.5); ctx.quadraticCurveTo(x + 3, y - h * 0.3, x + 3, y - 2); ctx.closePath(); ctx.fill();
  }
  // the vent
  ctx.fillStyle = '#1a1416'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillRect(x - 12, y - 5, 24, 5); ctx.strokeRect(x - 12, y - 5, 24, 5);
  ctx.fillStyle = state === 'frozen' ? '#8fd3f0' : state === 'off' ? '#5a2410' : '#ffb060';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 9 + i * 5, y - 4, 2.5, 3);
  if (state === 'frozen') {
    ctx.fillStyle = 'rgba(191,230,247,.9)'; ctx.strokeStyle = '#cfe8f5'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 13, y - 4); ctx.lineTo(x - 8, y - 12); ctx.lineTo(x + 2, y - 14); ctx.lineTo(x + 12, y - 9); ctx.lineTo(x + 13, y - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** A heat lamp's light (world space): a warm cone swinging under it. Drawn under everything that moves. */
export function drawLampLight(ctx, l, t) {
  if (l.out > 0) return;
  const { a, hx, hy } = lampAt(l, t), R = LAMP_R;
  const flick = 0.9 + Math.sin(t * 13 + l.id) * 0.06;
  ctx.save();
  const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, R);
  g.addColorStop(0, `rgba(255,200,110,${(0.4 * flick).toFixed(3)})`); g.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.sin(a - LAMP_HALF) * R, hy + Math.cos(a - LAMP_HALF) * R);
  ctx.lineTo(hx + Math.sin(a + LAMP_HALF) * R, hy + Math.cos(a + LAMP_HALF) * R);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** A heat lamp: a brazier on a chain from the rock above (frosted over while it is out). */
export function drawLamp(ctx, l, t, glow) {
  const { a, hx, hy } = lampAt(l, t), out = l.out > 0;
  ctx.save();
  ctx.strokeStyle = '#4a3c3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#2b2226'; ctx.fillRect(l.x - 5, l.y, 10, 3);
  ctx.translate(hx, hy); ctx.rotate(-a);
  if (!out && glow) { ctx.globalAlpha = 0.85; ctx.drawImage(glow, -20, -14, 40, 40); ctx.globalAlpha = 1; }
  // the bowl
  ctx.fillStyle = out ? '#5f9bd0' : '#3a2e30'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (out) {
    ctx.fillStyle = '#e8f7ff'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-3, -5); ctx.lineTo(3, -4); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#ffe2a8'; ctx.fillRect(-6, 5, 12, 4);
    ctx.fillStyle = '#ff7a1a';
    const f = Math.sin(t * 17 + l.id) * 2;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-4, -7 - f, 0, -9); ctx.quadraticCurveTo(4, -6 + f, 6, 0); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ── Section 3: vents, the key, gates ─────────────────────────

/** A cold vent: a grate in the floor breathing blue mist up (it freezes him back up while he stands in it). */
export function drawVent(ctx, v, t, glow) {
  const x = v.x, y = v.y;
  ctx.save();
  if (glow) { ctx.globalAlpha = 0.45; ctx.drawImage(glow, x - 26, y - VENT_H, 52, VENT_H + 8); ctx.globalAlpha = 1; }
  for (let i = 0; i < 7; i++) {
    const k = (t * 0.6 + i / 7) % 1;
    ctx.globalAlpha = (1 - k) * 0.4;
    ctx.fillStyle = i % 2 ? '#cfe8f5' : '#8fd3f0';
    ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.3 + t * 2) * 7 * k, y - 6 - k * VENT_H, 3 + k * 7, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a2430'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillRect(x - 12, y - 5, 24, 5); ctx.strokeRect(x - 12, y - 5, 24, 5);
  ctx.fillStyle = '#8fd3f0';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 9 + i * 5, y - 4, 2.5, 3);
  ctx.restore();
}

/** The ember key: an iron key with a coal glowing in its bow, bobbing. */
export function drawKey(ctx, k, t, glow) {
  const b = Math.sin(t * 2.6) * 2.5;
  ctx.save(); ctx.translate(k.x, k.y + b); ctx.rotate(-0.5);
  if (glow) { ctx.globalAlpha = 0.75 + Math.sin(t * 5) * 0.15; ctx.drawImage(glow, -24, -24, 48, 48); ctx.globalAlpha = 1; }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.fillStyle = '#6a5650';
  ctx.beginPath(); ctx.arc(-6, 0, 6, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillRect(0, -2, 13, 4); ctx.strokeRect(0, -2, 13, 4);
  ctx.fillRect(8, 2, 3, 4); ctx.strokeRect(8, 2, 3, 4); ctx.fillRect(12, 2, 2, 3);
  ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(-6, 0, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(-7, -1, 1.2, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Iron gates and hatches (X) while they are shut: bars with a glowing lock plate. */
export function drawGates(ctx, m, r0, r1, t) {
  for (const i of m.gates) {
    const c = i % m.C, r = Math.floor(i / m.C);
    if (r < r0 || r > r1) continue;
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = 'rgba(10,8,12,.85)'; ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#5a4a46'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 4; k < TILE; k += 8) { ctx.moveTo(x + k, y + 1); ctx.lineTo(x + k, y + TILE - 1); ctx.moveTo(x + 1, y + k); ctx.lineTo(x + TILE - 1, y + k); }
    ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5);
    ctx.fillStyle = `rgba(255,140,50,${(0.55 + 0.25 * Math.sin(t * 4 + c)).toFixed(3)})`;
    ctx.fillRect(x + TILE / 2 - 3, y + TILE / 2 - 3, 6, 6);
  }
}

/** A padlock on the vault door until the ember key is found. */
function drawPadlock(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y + 2);
  ctx.strokeStyle = '#8a7a74'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, -8, 6, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#4a3c3a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillRect(-9, -8, 18, 14); ctx.strokeRect(-9, -8, 18, 14);
  ctx.fillStyle = `rgba(255,140,50,${(0.7 + 0.3 * Math.sin(t * 4)).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(0, -2, 2.5, 0, TAU); ctx.fill(); ctx.fillRect(-1, -1, 2, 5);
  ctx.restore();
}
