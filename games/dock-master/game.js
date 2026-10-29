// ─────────────────────────────────────────────────────────────
//  DOCK MASTER — Zone 5, slot 28.
//
//  Space-traffic control: ships warp in from the void and drift; drag a route
//  from a ship to the docking bay of the same colour (each colour also has its
//  own hull shape, echoed on its bay pad, so nobody needs colour alone). Two
//  ships touching is a collision and a life. Dock the level's quota to finish.
//  From L8 the bays trade colours on a timer — reroute or be refused.
//
//  All gameplay randomness comes from s.rng (Daily Challenge); the world rules
//  live in world.js, shared with check.mjs which proves every level is fair.
// ─────────────────────────────────────────────────────────────
import { runGame, roundRect, progressBar, clamp } from '../../assets/js/engine.js';
import {
  W, H, SHIP_R, BAY_R, STATION_R, CX, CY, COLORS, ROUTE_BOOST,
  levelSpec, makeLevel, spawnShip, stepShip, shipsCollide, atBay, hitsStation,
} from './world.js';

const DOCK_T = 0.55;         // seconds of final-approach animation
const WARP_T = 0.8;          // telegraph before a ship becomes solid
const PICK_R = 38;           // how close a press must be to grab a ship
const hue = (c, l = 60, a = 1) => `hsla(${COLORS[c].hue}, 85%, ${l}%, ${a})`;

runGame({
  id: 'dock-master',
  width: W, height: H,
  lives: 3,
  comboWindow: 10,           // consecutive docks keep the multiplier alive
  comboStep: 1,
  maxMultiplier: 8,
  bonusTime: 20,
  detail: true,
  music: { bpm: 104, style: 'cosmic', lead: 'triangle', arp: [0, 3, 2, 4, 0, 2, 3, 1], oct: [12, 12, 24, 12, 12, 24, 12, 12], bass: 'half' },

  levelInfo: (level, bonus) => bonus
    ? '★ RUSH HOUR! A ghost fleet — no collisions. Dock everything you can.'
    : level === 1 ? 'Drag a line from a ship to the bay of the same colour. Never let two ships touch.'
    : level === 3 ? 'A third traffic colour joins the pattern.'
    : level === 5 ? 'Four colours now. Watch your crossings.'
    : level === 8 ? 'The bays trade colours on a timer — reroute or be refused.'
    : 'More ships. Faster. Keep the lanes clean.',

  create: (shell) => new DockMaster(shell),
});

class DockMaster {
  constructor(s) {
    this.s = s; this.t = 0;
    // one starfield for the whole session (cosmetic → Math.random is fine)
    this.stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7, tw: Math.random() * 6 }));
    this.startLevel(1, false);
  }

  startLevel(level, bonus) {
    const s = this.s;
    this.level = level; this.bonus = bonus;
    const make = makeLevel(level, s.rng);
    this.spec = make.spec; this.bays = make.bays;
    for (const b of this.bays) { b.flash = 0; b.pulse = 0; }
    this.ships = []; this.incoming = [];
    this.docked = 0; this.spawned = 0; this.collided = false;
    this.bonusDocks = 0; this.dockTimes = [];
    this.spawnT = 0.6;
    this.drawing = null;
    this.shiftT = this.spec.shift && !bonus ? this.spec.shiftEvery : Infinity;
    this.shiftWarn = 0; this.shiftPair = null;
    this.hintT = level === 1 ? 7 : 0;
  }

  // ── Input: draw a route from a ship ─────────────────────────
  onAction(a, x, y) {
    if (a === 'press') {
      let pick = null, best = PICK_R;
      for (const sh of this.ships) {
        if (sh.dock) continue;
        const d = Math.hypot(sh.x - x, sh.y - y);
        if (d < best) { best = d; pick = sh; }
      }
      if (pick) {
        pick.path = [];                      // redrawing replaces the old route
        this.drawing = { ship: pick, lx: pick.x, ly: pick.y };
        this.s.sound.play('click', 1);
      }
    }
    if (a === 'release') this.drawing = null;
  }

  onPointerMove(x, y, down) {
    const dr = this.drawing;
    if (!dr || !down) return;
    const sh = dr.ship;
    if (sh.dock || !this.ships.includes(sh)) { this.drawing = null; return; }
    if (Math.hypot(x - dr.lx, y - dr.ly) < 9) return;
    sh.path.push({ x, y }); dr.lx = x; dr.ly = y;
    // reaching the matching bay's mouth snaps and commits the route
    for (const b of this.bays) {
      if (b.color !== sh.color) continue;
      if (Math.hypot(x - b.mx, y - b.my) < BAY_R * 1.15) {
        sh.path.push({ x: b.mx, y: b.my });
        b.pulse = 1;
        this.drawing = null;
        this.s.sound.play('click', 2);
        return;
      }
    }
  }

  onLifeLost() {
    this.drawing = null;
    this.s.resetCombo();
    this.spawnT = Math.max(this.spawnT, 1.4);   // a breath before the next warp-in
  }

  // ── A ship arrives at a bay ─────────────────────────────────
  tryDock(sh, b) {
    const s = this.s;
    if (b.color === sh.color) {
      sh.dock = { b, t: 0, x: sh.x, y: sh.y };
      sh.path = [];
      if (this.drawing?.ship === sh) this.drawing = null;
      return;
    }
    // wrong colour: the bay refuses — pushed back out, route cleared
    const n = Math.hypot(sh.x - CX, sh.y - CY) || 1;
    sh.vx = ((sh.x - CX) / n) * this.spec.speed;
    sh.vy = ((sh.y - CY) / n) * this.spec.speed;
    sh.x = b.mx + ((sh.x - CX) / n) * BAY_R; sh.y = b.my + ((sh.y - CY) / n) * BAY_R;
    sh.path = [];
    if (this.drawing?.ship === sh) this.drawing = null;
    b.flash = 1;
    s.sound.play('hit', 1);
    s.fx.text(b.mx, b.my - 26, 'WRONG BAY', { color: '#fda4af', size: 13, life: 0.8 });
  }

  finishDock(sh) {
    const s = this.s, b = sh.dock.b;
    this.ships.splice(this.ships.indexOf(sh), 1);
    this.docked++;
    s.award((this.bonus ? 15 : 25) * this.level, b.mx, b.my - 20, { chain: true, color: hue(b.color, 70) });
    s.sound.play('coin', s.comboCount);
    s.fx.burst(b.x, b.y, { color: hue(b.color, 65), count: 14, speed: 130, life: 0.4 });
    s.unlock('first');
    if (this.level >= 8) s.unlock('shift');
    const now = this.t;
    this.dockTimes.push(now);
    this.dockTimes = this.dockTimes.filter((x) => now - x < 4);
    if (this.dockTimes.length >= 3) s.unlock('hat');
    if (this.bonus && ++this.bonusDocks >= 10) s.unlock('rush');
    if (s.score >= 10000) s.unlock('score10k');
    if (!this.bonus && this.docked >= this.spec.quota) {
      if (!this.collided && this.level >= 3) s.unlock('clean');
      s.completeLevel();
    }
  }

  // ── Simulation ──────────────────────────────────────────────
  update(dt) {
    const s = this.s;
    this.t += dt;
    if (this.hintT > 0) this.hintT -= dt;
    for (const b of this.bays) { b.flash = Math.max(0, b.flash - dt * 2); b.pulse = Math.max(0, b.pulse - dt * 2.5); }

    // warp-ins: telegraph first, then the ship turns solid. Keep sending ships until the ones
    // docked plus the ones still out can make the quota: a crash destroys two ships, and they
    // must be replaced or the level can never finish (29 Oct 2026: stuck at 15/17 on level 6).
    this.spawnT -= dt;
    const want = this.bonus ? Infinity : this.spec.quota;
    const alive = this.ships.length + this.incoming.length;
    if (this.spawnT <= 0 && this.docked + alive < want && alive < this.spec.maxAlive + (this.bonus ? 2 : 0)) {
      const sh = spawnShip(this.spec, s.rng);
      this.incoming.push({ sh, t: WARP_T });
      this.spawned++;
      this.spawnT = this.bonus ? 0.9 : this.spec.spawnEvery;
    }
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      const w = this.incoming[i];
      if ((w.t -= dt) <= 0) {
        this.incoming.splice(i, 1);
        this.ships.push(w.sh);
        s.sound.play('pass', 1);
      }
    }

    // bay colour trades (L8+): warn, then swap
    if ((this.shiftT -= dt) <= 0 && this.bays.length >= 2) {
      if (!this.shiftPair) {
        const i = s.rng.int(0, this.bays.length - 1);
        let j = s.rng.int(0, this.bays.length - 2); if (j >= i) j++;
        this.shiftPair = [this.bays[i], this.bays[j]];
        this.shiftWarn = 2.2; this.shiftT = 2.2;
        s.sound.play('metal');
      } else {
        const [a, b] = this.shiftPair;
        [a.color, b.color] = [b.color, a.color];
        a.pulse = b.pulse = 1;
        this.shiftPair = null;
        this.shiftT = this.spec.shiftEvery;
        s.sound.play('powerup', 0.5);
        s.fx.text(CX, CY - STATION_R - 34, 'BAYS TRADED!', { color: '#fde047', size: 15, life: 1 });
      }
    }
    if (this.shiftWarn > 0) this.shiftWarn -= dt;

    // ships fly
    for (const sh of this.ships) {
      if (sh.dock) {
        const d = sh.dock; d.t += dt;
        const k = Math.min(1, d.t / DOCK_T);
        sh.x = d.x + (d.b.x - d.x) * k; sh.y = d.y + (d.b.y - d.y) * k;
        if (k >= 1) { this.finishDock(sh); return; }   // list changed — settle next frame
        continue;
      }
      stepShip(sh, this.spec, dt);
      if (hitsStation(sh)) {
        // the hull politely bounces traffic away — no life, but the route is lost
        const n = Math.hypot(sh.x - CX, sh.y - CY) || 1;
        sh.vx = ((sh.x - CX) / n) * this.spec.speed;
        sh.vy = ((sh.y - CY) / n) * this.spec.speed;
        sh.x = CX + ((sh.x - CX) / n) * (STATION_R + sh.r);
        sh.y = CY + ((sh.y - CY) / n) * (STATION_R + sh.r);
        sh.path = [];
        if (this.drawing?.ship === sh) this.drawing = null;
        s.sound.play('bounce', 0.5);
      }
      // a matching mouth docks on touch; a wrong one only refuses drifting ships
      // (a plotted route may legitimately pass close by another bay)
      for (const b of this.bays) if (atBay(sh, b)) { if (b.color === sh.color || !sh.path.length) this.tryDock(sh, b); break; }
    }

    // collisions (ghost fleet in the bonus round)
    if (!this.bonus) for (let i = 0; i < this.ships.length; i++) {
      const a = this.ships[i];
      if (a.dock) continue;
      for (let j = i + 1; j < this.ships.length; j++) {
        const b = this.ships[j];
        if (b.dock) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < a.r + b.r) {
          this.collided = true;
          s.fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, { color: '#fb7185', count: 26, speed: 220 });
          s.fx.flash('#fb7185'); s.fx.shake(7, 0.35);
          s.sound.play('boom');
          this.ships.splice(j, 1); this.ships.splice(i, 1);
          return s.hurt();
        }
        if (d < a.r + b.r + 5 && (a.path.length || b.path.length)) s.unlock('graze');
      }
    }

    // five routed ships at once
    if (this.ships.filter((x) => x.path.length).length >= 5) s.unlock('full');
  }

  idle(dt) { this.t += dt; }

  // ── Drawing ─────────────────────────────────────────────────
  render(ctx) {
    const s = this.s, lo = s.lowDetail, gold = s.gold;

    ctx.fillStyle = this.bonus ? '#120b22' : '#070b18';
    ctx.fillRect(0, 0, W, H);
    for (const st of this.stars) {
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.t * 2 + st.tw);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(st.x, st.y, st.z > 0.7 ? 2 : 1, st.z > 0.7 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // routes under everything else
    for (const sh of this.ships) {
      if (!sh.path.length || sh.dock) continue;
      ctx.strokeStyle = hue(sh.color, 62, this.drawing?.ship === sh ? 0.9 : 0.45);
      ctx.lineWidth = this.drawing?.ship === sh ? 3 : 2;
      ctx.setLineDash([6, 7]); ctx.lineDashOffset = -this.t * 30;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y);
      for (const p of sh.path) ctx.lineTo(p.x, p.y);
      ctx.stroke(); ctx.setLineDash([]);
    }

    this.drawStation(ctx, lo, gold);

    // warp-in telegraphs
    for (const w of this.incoming) {
      const k = w.t / WARP_T;
      const x = clamp(w.sh.x, 14, W - 14), y = clamp(w.sh.y, 14, H - 14);
      ctx.strokeStyle = hue(w.sh.color, 65, 0.4 + 0.5 * (1 - k));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6 + 18 * k, 0, Math.PI * 2); ctx.stroke();
      this.drawHull(ctx, x, y, Math.atan2(w.sh.vy, w.sh.vx), w.sh.color, 0.5 * (1 - k) + 0.2, gold, 0.8);
    }

    // ships
    for (const sh of this.ships) {
      const k = sh.dock ? 1 - Math.min(1, sh.dock.t / DOCK_T) * 0.7 : 1;
      const ang = Math.atan2(sh.vy, sh.vx);
      if (!lo && sh.path.length) {       // engine flame on routed ships
        ctx.fillStyle = hue(sh.color, 70, 0.5);
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(-sh.r - 2, -3); ctx.lineTo(-sh.r - 8 - 3 * Math.sin(this.t * 25), 0); ctx.lineTo(-sh.r - 2, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      this.drawHull(ctx, sh.x, sh.y, ang, sh.color, 1, gold, k);
    }

    // HUD
    const quota = this.bonus ? Math.max(this.docked, 1) : this.spec.quota;
    progressBar(ctx, 16, 14, W - 32, 16, clamp(this.docked / quota, 0, 1), '#67e8f9',
      this.bonus ? `★ RUSH HOUR · docked ${this.docked}` : `Docked ${this.docked}/${this.spec.quota}`);
    if (this.hintT > 0) {
      ctx.fillStyle = 'rgba(226,232,240,.85)'; ctx.font = '600 15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(s.coarse ? 'Drag from a ship to its matching bay' : 'Click a ship, drag a line to its matching bay', W / 2, H - 24);
    }
  }

  drawStation(ctx, lo, gold) {
    const t = this.t;
    // slow outer ring
    ctx.strokeStyle = gold ? 'rgba(251,191,36,.35)' : 'rgba(103,232,249,.25)';
    ctx.lineWidth = 2; ctx.setLineDash([10, 14]); ctx.lineDashOffset = t * 8;
    ctx.beginPath(); ctx.arc(CX, CY, STATION_R + BAY_R * 2 + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // bay arms + pads
    for (const b of this.bays) {
      const warn = this.shiftPair?.includes(b) && Math.floor(t * 6) % 2 === 0;
      const col = warn ? 'hsla(0,0%,95%,.9)' : hue(b.color, 60, 0.9);
      ctx.save();
      ctx.translate(CX, CY); ctx.rotate(b.a);
      ctx.fillStyle = gold ? '#4a3516' : '#141b30';
      roundRect(ctx, STATION_R - 10, -BAY_R + 4, BAY_R + 16, BAY_R * 2 - 8, 6); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      roundRect(ctx, STATION_R - 10, -BAY_R + 4, BAY_R + 16, BAY_R * 2 - 8, 6); ctx.stroke();
      ctx.restore();
      // the mouth: where ships must arrive
      const k = 1 + b.pulse * 0.25;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(b.mx, b.my, BAY_R * 0.9 * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (!lo) {
        ctx.fillStyle = hue(b.color, 60, 0.12 + b.pulse * 0.2);
        ctx.beginPath(); ctx.arc(b.mx, b.my, BAY_R * 0.9 * k, 0, Math.PI * 2); ctx.fill();
      }
      // the colour's shape, echoed on the pad
      this.shape(ctx, b.mx, b.my, 6.5, b.color, col);
      if (b.flash > 0) {
        ctx.strokeStyle = `rgba(251,113,133,${b.flash})`; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.mx - 8, b.my - 8); ctx.lineTo(b.mx + 8, b.my + 8);
        ctx.moveTo(b.mx + 8, b.my - 8); ctx.lineTo(b.mx - 8, b.my + 8);
        ctx.stroke();
      }
    }

    // core
    const g = ctx.createRadialGradient(CX - 14, CY - 14, 6, CX, CY, STATION_R);
    if (gold) { g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#92400e'); }
    else { g.addColorStop(0, '#334a7a'); g.addColorStop(1, '#101a33'); }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, STATION_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold ? '#fbbf24' : '#3b5a96'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX, CY, STATION_R, 0, Math.PI * 2); ctx.stroke();
    // windows
    ctx.fillStyle = gold ? 'rgba(120,53,15,.9)' : 'rgba(103,232,249,.75)';
    for (let i = 0; i < 8; i++) {
      const a = t * 0.3 + (i * Math.PI) / 4;
      ctx.fillRect(CX + Math.cos(a) * STATION_R * 0.62 - 2, CY + Math.sin(a) * STATION_R * 0.62 - 2, 4, 4);
    }
    ctx.fillStyle = gold ? '#78350f' : '#9fb6e8';
    ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DOCK', CX, CY - 5); ctx.fillText('CTRL', CX, CY + 7);
  }

  /** The colour's shape: 0 ▲ ruby, 1 ◆ cyan, 2 ● amber, 3 ■ violet. */
  shape(ctx, x, y, r, c, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (c === 0) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.9); ctx.lineTo(x - r, y + r * 0.9); }
    else if (c === 1) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); }
    else if (c === 2) ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    else ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    ctx.closePath(); ctx.fill();
  }

  drawHull(ctx, x, y, ang, c, alpha, gold, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale, scale);
    ctx.fillStyle = gold ? '#fbbf24' : hue(c, 30);
    ctx.strokeStyle = gold ? '#fde68a' : hue(c, 65);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHIP_R + 2, 0); ctx.lineTo(-SHIP_R + 2, -SHIP_R + 3); ctx.lineTo(-SHIP_R * 0.5, 0); ctx.lineTo(-SHIP_R + 2, SHIP_R - 3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-ang);                      // the shape badge stays upright
    this.shape(ctx, 0, 0, 4.5, c, gold ? '#78350f' : hue(c, 80));
    ctx.restore();
  }
}
