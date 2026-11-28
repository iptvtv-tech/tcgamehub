// ─────────────────────────────────────────────────────────────
//  INFERNO VAULT — the art (canvas, no image files). The Iceman himself, his blade, his puddle,
//  the frost shards and the fireballs are Magma Escape's own drawings (imported in game.js).
//  This file draws the vault: its stone and lava, the alcoves' shadow, the vault door, the fire
//  opals, and the Fire King's guards with their lantern beams.
// ─────────────────────────────────────────────────────────────
import { TILE, ROCK, LEDGE, LAVA, SHADOW, tileAt, GUARD_H, BEAM_Y, beamHalf } from './world.js';

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
  for (let r = 0; r < m.R; r++) for (let c = 0; c < m.C; c++) {
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
export function drawDoor(ctx, d, t, glow, open = 0) {
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
  if (g.state === 'down' || g.reach <= 0) return;
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
  if (g.state === 'down') {
    // put out: an empty suit of armour, slumped, smoking
    ctx.fillStyle = '#2a2226'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -6, 15, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.face * 10, -10, 6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.scale(g.face, 1);
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
  ctx.restore();
  // "!" — it has seen him
  if (g.state === 'alert') {
    const a = Math.min(1, (0.55 - g.t) * 8);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff3a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.x, g.y - GUARD_H - 18, 10, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3a1a'; ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', g.x, g.y - GUARD_H - 17);
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
