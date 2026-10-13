// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — HUD (hearts, hotbar, hand, clock, touch controls)
//  and the two menus: your Bag & Crafting, and Advancements.
// ─────────────────────────────────────────────────────────────
import { roundRect, clamp } from '../../assets/js/engine.js';
import { B, I, INFO, RECIPES, ADV, nameOf, isBlock } from './items.js';

const W = 480, VIEW_H = 560, H = 720;
const SLOT = 46, STEP = 50, X0 = 17;
const HOTBAR_Y = 568;
const BTN = { mine: [300, 664, 32], use: [372, 664, 30], jump: [440, 664, 28] };
const OVR = { bag: [450, 34, 21], adv: [450, 82, 21] };
// menu layout
const R_X0 = 20, R_Y0 = 64, R_CELL = 55, R_COLS = 8, R_ROWS = 3;
const ARM_Y = 286, INV_Y = 340, HB_Y = 498;

export class UI {
  constructor(g) { this.g = g; this.open = null; this.closing = false; this.scroll = 0; this.selRecipe = null; this.pick = null; this.msg = null; this.hoverId = null; }

  toggle(name) { if (this.open === name) this.close(); else { this.open = name; this.pick = null; this.selRecipe = null; this.scroll = 0; this.g.mineMouse = false; this.g.mining = null; this.g.unlock(); this.g.s.sound.play('click'); this.g.findStations?.(); } }
  close() { if (!this.open) return; this.open = null; this.pick = null; this.g.lock(); }
  update(dt) { if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; } if (this.g.hurtFlash) this.g.hurtFlash = Math.max(0, this.g.hurtFlash - dt); }
  say(text, col = '#fca5a5') { this.msg = { text, col, t: 2.2 }; }

  // ── hit tests ─────────────────────────────────────────────
  hudClick(x, y) {
    for (const [k, [bx, by, br]] of Object.entries(OVR)) if (Math.hypot(x - bx, y - by) < br + 6) { this.toggle(k === 'bag' ? 'inv' : 'adv'); return true; }
    if (y >= HOTBAR_Y && y <= HOTBAR_Y + SLOT) { const i = Math.floor((x - X0) / STEP); if (i >= 0 && i < 9) { this.g.select(i); return true; } }
    return false;
  }
  touchButton(x, y) { for (const [k, [bx, by, br]] of Object.entries(BTN)) if (Math.hypot(x - bx, y - by) < br + 8) return k; return null; }

  recipeList() {
    const g = this.g;
    const rank = (r) => g.canCraft(r) ? 0 : (r.at === 'table' && !g.near.table) || (r.at === 'furnace' && !g.near.furnace) ? 2 : 1;
    return RECIPES.map((r, i) => ({ r, i, k: rank(r) })).sort((a, b) => a.k - b.k || a.i - b.i);
  }
  slotAt(x, y) {
    for (let row = 0; row < 3; row++) { const yy = INV_Y + row * STEP; if (y >= yy && y < yy + SLOT) { const c = Math.floor((x - X0) / STEP); if (c >= 0 && c < 9 && x - X0 - c * STEP < SLOT) return { kind: 'inv', i: 9 + row * 9 + c }; } }
    if (y >= HB_Y && y < HB_Y + SLOT) { const c = Math.floor((x - X0) / STEP); if (c >= 0 && c < 9) return { kind: 'inv', i: c }; }
    if (y >= ARM_Y && y < ARM_Y + SLOT) { const c = Math.floor((x - X0) / STEP); if (c >= 0 && c < 4) return { kind: 'arm', i: c }; if (x > 410 && x < 460) return { kind: 'trash' }; }
    return null;
  }

  click(x, y) {
    const g = this.g, s = g.s;
    if (Math.hypot(x - 448, y - 32) < 22 || y > VIEW_H) { this.close(); return; }
    if (this.open === 'adv') return;
    // recipes
    if (y >= R_Y0 && y < R_Y0 + R_ROWS * R_CELL && x >= R_X0 && x < R_X0 + R_COLS * R_CELL) {
      const list = this.recipeList();
      const n = (this.scroll + Math.floor((y - R_Y0) / R_CELL)) * R_COLS + Math.floor((x - R_X0) / R_CELL);
      const e = list[n]; if (!e) return;
      if (this.selRecipe === e.r) this.tryCraft(e.r);
      else { this.selRecipe = e.r; s.sound.play('click'); }
      return;
    }
    if (this.selRecipe && x > 388 && x < 466 && y > 228 && y < 266) { this.tryCraft(this.selRecipe); return; }
    if (x > 440 && y > R_Y0 && y < R_Y0 + R_ROWS * R_CELL) return;
    // slots
    const sl = this.slotAt(x, y);
    if (!sl) { this.pick = null; return; }
    this.slotClick(sl);
  }
  tryCraft(r) {
    const g = this.g;
    if (r.at === 'table' && !g.near.table) return this.say('You need to be next to a crafting table.');
    if (r.at === 'furnace' && !g.near.furnace) return this.say('You need to be next to a furnace.');
    if (r.at === 'furnace' && !g.fuelFor()) return this.say('The furnace needs fuel: coal, logs or planks.');
    if (!g.canCraft(r)) return this.say('Not enough materials.');
    if (!g.craft(r)) return this.say('Your bag is full!');
    this.say(`Made ${r.n > 1 ? r.n + ' × ' : ''}${nameOf(r.out)}`, '#a7f3d0');
  }
  slotClick(sl) {
    const g = this.g, s = g.s, inv = g.inv, arm = g.armour;
    const get = (q) => q.kind === 'inv' ? inv[q.i] : q.kind === 'arm' ? arm[q.i] : null;
    const put = (q, v) => { if (q.kind === 'inv') inv[q.i] = v; else if (q.kind === 'arm') arm[q.i] = v; };
    if (!this.pick) { if (get(sl)) { this.pick = sl; s.sound.play('click'); } return; }
    const a = this.pick, A = get(a), Bv = get(sl);
    this.pick = null;
    if (sl.kind === 'trash') { if (a.kind === 'inv') { inv[a.i] = null; s.sound.play('metal'); } return; }
    if (a.kind === sl.kind && a.i === sl.i) return;
    // armour only goes in its own slot
    const fits = (it, q) => !it || q.kind !== 'arm' || INFO[it.id].armour === q.i;
    if (!fits(A, sl) || !fits(Bv, a)) { this.say('That doesn\'t go there.'); return; }
    if (A && Bv && A.id === Bv.id && INFO[A.id].stack > 1) {
      const room = INFO[A.id].stack - Bv.n, k = Math.min(room, A.n);
      Bv.n += k; A.n -= k; if (!A.n) put(a, null);
    } else { put(a, Bv); put(sl, A); }
    s.sound.play('click');
    g.checkArmour();
  }
  hover(x, y) { const sl = this.slotAt(x, y); const it = sl && sl.kind !== 'trash' ? (sl.kind === 'inv' ? this.g.inv[sl.i] : this.g.armour[sl.i]) : null; this.hoverId = it ? it.id : null; }
  drag(x, y) { if (this.dragY === undefined) this.dragY = y; if (Math.abs(y - this.dragY) > 40) { this.wheel(this.dragY - y); this.dragY = y; } }
  dragEnd() { this.dragY = undefined; }
  wheel(dy) { const rows = Math.ceil(RECIPES.length / R_COLS); this.scroll = clamp(this.scroll + (dy > 0 ? 1 : -1), 0, Math.max(0, rows - R_ROWS)); }

  // ── drawing helpers ───────────────────────────────────────
  icon(ctx, id, x, y, size) {
    const c = this.g.icons[id]; if (!c) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
  }
  slot(ctx, x, y, it, { sel = false, picked = false, dim = false } = {}) {
    ctx.fillStyle = sel ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.45)';
    roundRect(ctx, x, y, SLOT, SLOT, 6); ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = picked ? '#fde047' : sel ? '#ffffff' : 'rgba(255,255,255,.22)'; ctx.stroke();
    if (!it) return;
    if (dim) ctx.globalAlpha = 0.35;
    this.icon(ctx, it.id, x + 7, y + 7, 32);
    ctx.globalAlpha = 1;
    if (it.n > 1) { ctx.font = '800 14px system-ui'; ctx.textAlign = 'right'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(it.n, x + SLOT - 4, y + SLOT - 5); ctx.fillStyle = '#fff'; ctx.fillText(it.n, x + SLOT - 4, y + SLOT - 5); }
    const info = INFO[it.id];
    if (info.dur && it.dur < info.dur) {
      const k = it.dur / info.dur;
      ctx.fillStyle = '#000'; ctx.fillRect(x + 6, y + SLOT - 7, SLOT - 12, 3);
      ctx.fillStyle = `hsl(${k * 120},90%,50%)`; ctx.fillRect(x + 6, y + SLOT - 7, (SLOT - 12) * k, 3);
    }
  }
  text(ctx, str, x, y, { size = 14, col = '#fff', align = 'left', weight = 700 } = {}) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = col; ctx.fillText(str, x, y);
  }

  // ── HUD ───────────────────────────────────────────────────
  draw(ctx) {
    const g = this.g, s = g.s;
    const inGame = ['playing', 'banner', 'clear', 'dying'].includes(s.state);
    if (inGame) this.drawHand(ctx);
    // crosshair
    if (inGame && !this.open) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(W / 2 - 9, VIEW_H / 2 - 1.5, 18, 3); ctx.fillRect(W / 2 - 1.5, VIEW_H / 2 - 9, 3, 18); }
    // hurt / sleep / night
    if (g.hurtFlash) { ctx.save(); ctx.globalAlpha = g.hurtFlash; const gr = ctx.createRadialGradient(W / 2, VIEW_H / 2, 140, W / 2, VIEW_H / 2, 380); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, '#ff1133'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, VIEW_H); ctx.restore(); }
    if (g.sleepT) { ctx.fillStyle = `rgba(0,0,10,${clamp(1 - g.sleepT / 1.6, 0, 1)})`; ctx.fillRect(0, 0, W, VIEW_H); this.text(ctx, 'Sleeping… 💤', W / 2, VIEW_H / 2, { size: 24, align: 'center' }); }

    if (inGame) {
      // clock
      const night = g.isNight();
      ctx.fillStyle = 'rgba(0,0,0,.4)'; roundRect(ctx, 12, 12, 116, 30, 15); ctx.fill();
      this.text(ctx, `${g.bonus ? '★' : night ? '🌙' : '☀️'} Day ${g.day}`, 24, 28, { size: 15 });
      // bag & advancements buttons
      for (const [k, [bx, by, br]] of Object.entries(OVR)) {
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
        this.text(ctx, k === 'bag' ? '🎒' : '🏆', bx, by + 1, { size: 18, align: 'center' });
      }
      this.text(ctx, `${g.advs.size}/${ADV.length}`, OVR.adv[0], OVR.adv[1] + 30, { size: 11, align: 'center', col: '#fde68a' });
      // boss bar
      if (g.boss) {
        const k = g.boss.hp / 420;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(ctx, 90, 54, 300, 16, 8); ctx.fill();
        ctx.fillStyle = '#a21caf'; roundRect(ctx, 90, 54, Math.max(16, 300 * k), 16, 8); ctx.fill();
        this.text(ctx, '👑 The Shadow King', W / 2, 46, { size: 14, align: 'center', col: '#f5d0fe' });
      }
      // hearts, armour, air
      const hp = g.health;
      for (let i = 0; i < 10; i++) {
        const v = hp - i * 2, x = 16 + i * 21, y = 530;
        this.heart(ctx, x, y, v >= 2 ? 1 : v === 1 ? 0.5 : 0, g.hurtCd > 0 && g.hurtCd < 0.5 && Math.sin(g.t * 40) > 0);
      }
      const prot = g.protection();
      if (prot > 0) for (let i = 0; i < 10; i++) { const on = prot * 12.5 > i; ctx.fillStyle = on ? '#e5e7eb' : 'rgba(255,255,255,.2)'; roundRect(ctx, 18 + i * 21, 504, 14, 14, 3); ctx.fill(); }
      if (g.air < 10) for (let i = 0; i < 10; i++) { if (g.air <= i) continue; ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W - 22 - i * 19, 511, 7, 0, Math.PI * 2); ctx.stroke(); }
      // energy: ten bolts on the right, emptying from the left
      const en = g.energy, low = en <= 6;
      for (let i = 0; i < 10; i++) {
        const v = en - (9 - i) * 2, fill = v >= 2 ? 1 : v > 0 ? v / 2 : 0;
        this.bolt(ctx, W - 30 - (9 - i) * 19 - 0, 522, fill, low && Math.sin(g.t * 10) > 0 && fill < 1);
      }
      if (en <= 0 && !g.bonus) this.text(ctx, 'Starving!', W - 16, 500, { size: 13, align: 'right', col: '#fca5a5' });
      // eating & bow bars
      if (g.eatT) this.bar(ctx, W / 2 - 50, VIEW_H / 2 + 26, 100, g.eatT / 1.1, '#fde047');
      if (g.bowT) this.bar(ctx, W / 2 - 50, VIEW_H / 2 + 26, 100, Math.min(1, g.bowT), g.bowT >= 1 ? '#f87171' : '#e5e7eb');
      // compass to your grave / bed
      const ct = g.compassTarget();
      if (ct) {
        const ang = Math.atan2(ct.x - g.p.x, ct.z - g.p.z) - g.yaw, dist = Math.hypot(ct.x - g.p.x, ct.z - g.p.z);
        const cx = W / 2, cy = 30;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.42)'; roundRect(ctx, cx - 46, 13, 92, 34, 17); ctx.fill();
        ctx.translate(cx - 18, cy); ctx.rotate(ang);
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
        this.text(ctx, `${ct.icon} ${Math.round(dist)}m`, cx + 18, cy + 1, { size: 13, align: 'center' });
      }
      // held item name
      if (g.heldNameT > 0 && g.held()) { ctx.globalAlpha = Math.min(1, g.heldNameT); this.text(ctx, nameOf(g.held().id), W / 2, 500, { size: 16, align: 'center' }); ctx.globalAlpha = 1; }
      // advancement toast
      if (g.toast) {
        const k = Math.min(1, (3.2 - g.toast.t) * 4, g.toast.t * 2), y = -50 + 110 * k;
        ctx.fillStyle = 'rgba(20,16,40,.92)'; roundRect(ctx, 96, y, 288, 54, 10); ctx.fill();
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
        this.text(ctx, g.toast.a.icon, 124, y + 27, { size: 24, align: 'center' });
        this.text(ctx, 'Advancement made!', 148, y + 17, { size: 12, col: '#fde68a' });
        this.text(ctx, g.toast.a.name, 148, y + 37, { size: 16 });
      }
      if (g.bonus) this.text(ctx, '★ STARFALL — catch the stars!', W / 2, 90, { size: 18, align: 'center', col: '#fde047' });
      if (!this.open) this.drawMinimap(ctx);
    }
    this.drawPanel(ctx, inGame);
    if (this.open === 'inv') this.drawBag(ctx);
    if (this.open === 'adv') this.drawAdv(ctx);
    if (this.msg) { ctx.globalAlpha = Math.min(1, this.msg.t * 2); this.text(ctx, this.msg.text, W / 2, this.open ? 548 : 470, { size: 15, align: 'center', col: this.msg.col }); ctx.globalAlpha = 1; }
  }

  drawMinimap(ctx) {
    const g = this.g, w = g.world;
    if (!w) return;
    const SX = 64, SZ = 64;
    const SIZE = 70, PAD = 4;
    const mx = W - SIZE - 8, my = 126;  // below the bag & adv buttons and the badge count

    // rebuild the pixel map when the world changes (World.version goes up on every block edit;
    // a new island is a new World object)
    const ver = w.version || 0;
    if (!this._mmCanvas || this._mmDirty !== ver || this._mmWorld !== w) {
      this._mmDirty = ver; this._mmWorld = w;
      if (!this._mmCanvas) { this._mmCanvas = document.createElement('canvas'); this._mmCanvas.width = SX; this._mmCanvas.height = SZ; }
      const mc = this._mmCanvas.getContext('2d');
      const img = mc.createImageData(SX, SZ);
      const d = img.data;
      for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
        const topY = w.top[z * SX + x];
        // the top-block map skips water, so look one above the ground for the sea and lakes
        const wet = w.get(x, topY + 1, z) === B.WATER;
        const block = wet ? B.WATER : w.get(x, topY, z);
        const shade = Math.max(0, Math.min(1, (topY - 10) / 18));
        let r = 80, gr = 120, b2 = 80;
        // block-colour palette for the map
        if (block === B.WATER) { const deep = Math.min(1, Math.max(0, (14 - topY) / 8)); r = 40 - deep * 20; gr = 120 - deep * 50; b2 = 215 - deep * 40; }
        else if (block === B.LAVA) { r = 240; gr = 80; b2 = 20; }
        else if (block === B.SAND || block === B.GRAVEL) { r = 220; gr = 200; b2 = 140; }
        else if (block === B.SNOW) { r = 230; gr = 230; b2 = 240; }
        else if (block === B.GRASS) { r = 60 + shade * 30; gr = 140 + shade * 40; b2 = 55; }
        else if (block === B.DIRT || block === B.SANDSTONE) { r = 130; gr = 90; b2 = 60; }
        else if (block === B.STONE || block === B.COBBLE) { r = 100 + shade * 30; gr = 100 + shade * 30; b2 = 105 + shade * 30; }
        else if (block === B.LOG || block === B.PLANKS) { r = 110; gr = 75; b2 = 40; }
        else if (block === B.LEAVES) { r = 40; gr = 100; b2 = 40; }
        else if (block === B.BEDROCK) { r = 30; gr = 30; b2 = 30; }
        else { r = 90; gr = 90; b2 = 90; }
        const i = (z * SX + x) * 4;
        d[i] = r; d[i + 1] = gr; d[i + 2] = b2; d[i + 3] = 255;
      }
      mc.putImageData(img, 0, 0);
    }

    // border + bg
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRect(ctx, mx - PAD, my - PAD, SIZE + PAD * 2, SIZE + PAD * 2, 5); ctx.fill();
    ctx.globalAlpha = 1;

    // map image scaled to SIZE
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._mmCanvas, mx, my, SIZE, SIZE);
    ctx.imageSmoothingEnabled = true;

    // player dot (white triangle pointing in yaw direction)
    const px = g.p.x, pz = g.p.z;
    const sx = mx + (px / SX) * SIZE, sy = my + (pz / SZ) * SIZE;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI - g.yaw);   // forward is (sin yaw, cos yaw) on the map: x right, z down
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();

    // spawn marker (green dot)
    if (g.spawn) {
      const spx = mx + (g.spawn[0] / SX) * SIZE, spy = my + (g.spawn[2] / SZ) * SIZE;
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(spx, spy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  bolt(ctx, x, y, fill, blink) {
    const path = () => { ctx.beginPath(); ctx.moveTo(x + 9, y - 2); ctx.lineTo(x + 2, y + 9); ctx.lineTo(x + 8, y + 9); ctx.lineTo(x + 5, y + 18); ctx.lineTo(x + 14, y + 5); ctx.lineTo(x + 8, y + 5); ctx.lineTo(x + 11, y - 2); ctx.closePath(); };
    path(); ctx.fillStyle = blink ? '#fff' : 'rgba(30,20,0,.6)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    if (fill > 0) { ctx.save(); path(); ctx.clip(); ctx.fillStyle = '#facc15'; ctx.fillRect(x, y + 18 - 20 * fill, 16, 20 * fill); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(x + 7, y, 2, 4); ctx.restore(); }
  }
  bar(ctx, x, y, w, k, col) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(ctx, x, y, w, 7, 3.5); ctx.fill();
    ctx.fillStyle = col; roundRect(ctx, x, y, Math.max(7, w * clamp(k, 0, 1)), 7, 3.5); ctx.fill();
  }
  heart(ctx, x, y, fill, blink) {
    const path = () => { ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.bezierCurveTo(x - 2, y + 6, x + 1, y - 3, x + 8, y + 2); ctx.bezierCurveTo(x + 15, y - 3, x + 18, y + 6, x + 8, y + 13); ctx.closePath(); };
    path(); ctx.fillStyle = blink ? '#fff' : 'rgba(40,0,0,.6)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    if (fill > 0) { ctx.save(); path(); ctx.clip(); ctx.fillStyle = '#ef4444'; ctx.fillRect(x - 2, y - 4, fill === 1 ? 22 : 10, 20); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x + 2, y, 3, 3); ctx.restore(); }
  }

  drawHand(ctx) {
    const g = this.g, s = g.s, p = g.p;
    const moving = Math.hypot(p.vx, p.vz) > 0.5 && p.grounded;
    const bob = moving ? Math.sin(g.t * 11) * 7 : 0, bobX = moving ? Math.cos(g.t * 5.5) * 5 : 0;
    const swing = g.swingT > 0 ? Math.sin(g.t * 26) * 0.55 + 0.25 : 0;
    const it = g.held();
    ctx.save();
    const L = g.handLight ? g.handLight() : 1;
    if (L < 0.97) ctx.filter = `brightness(${L.toFixed(2)})`;   // your hand is in the dark too
    ctx.translate(392 + bobX, 600 + bob + swing * 30);
    ctx.rotate(-0.42 - swing);
    // arm
    const gr = ctx.createLinearGradient(-30, 0, 30, 0);
    if (s.gold) { gr.addColorStop(0, '#b45309'); gr.addColorStop(0.5, '#fde68a'); gr.addColorStop(1, '#d97706'); }
    else { gr.addColorStop(0, '#c98d63'); gr.addColorStop(0.5, '#e8b48a'); gr.addColorStop(1, '#b97d55'); }
    ctx.fillStyle = gr; ctx.fillRect(-30, -150, 60, 190);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(18, -150, 12, 190);
    if (s.gold) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 5); ctx.fillStyle = '#fff'; ctx.fillRect(-14, -120, 5, 5); ctx.fillRect(8, -70, 4, 4); ctx.globalAlpha = 1; }
    if (it) {
      ctx.imageSmoothingEnabled = false;
      const ic = g.icons[it.id];
      if (isBlock(it.id) && it.id !== B.TORCH) ctx.drawImage(ic, -56, -230, 104, 104);
      else { ctx.save(); ctx.translate(-4, -138); ctx.rotate(-0.15); ctx.drawImage(ic, -28, -118, 140, 140); ctx.restore(); }
      ctx.imageSmoothingEnabled = true;
    }
    ctx.restore();
  }

  drawPanel(ctx, inGame) {
    const g = this.g;
    const gr = ctx.createLinearGradient(0, VIEW_H, 0, H); gr.addColorStop(0, '#1c1917'); gr.addColorStop(1, '#0c0a09');
    ctx.fillStyle = gr; ctx.fillRect(0, VIEW_H, W, H - VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, VIEW_H, W, 2);
    for (let i = 0; i < 9; i++) this.slot(ctx, X0 + i * STEP, HOTBAR_Y, g.inv[i], { sel: i === g.sel });
    for (let i = 0; i < 9; i++) this.text(ctx, String(i + 1), X0 + i * STEP + 6, HOTBAR_Y + 9, { size: 10, col: 'rgba(255,255,255,.5)' });
    if (g.touchUI) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(80, 662, 46, 0, Math.PI * 2); ctx.stroke();
      const jx = 80 + (g.joy ? g.joy.dx * 40 : 0), jy = 662 + (g.joy ? g.joy.dy * 40 : 0);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(jx, jy, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const btn = (k, label, col, on) => {
        const [bx, by, br] = BTN[k];
        ctx.fillStyle = on ? col : 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
        this.text(ctx, label, bx, by + 1, { size: 12, align: 'center' });
      };
      btn('mine', '⛏ HIT', '#fbbf24', g.mineTouch !== null);
      btn('use', '✋ USE', '#60a5fa', false);
      btn('jump', '⤒', '#4ade80', g.jumpTouch !== null);
      this.text(ctx, 'Drag the view to look · tap it to place', 240, 708, { size: 11, align: 'center', col: 'rgba(255,255,255,.5)', weight: 600 });
    } else {
      const locked = document.pointerLockElement === g.s.canvas;
      const lines = [
        locked ? 'Mouse look · Left click: mine / hit · Right click: place / use' : 'Click the view to look around with the mouse',
        'WASD move · Space jump / swim · Shift sprint · 1–9 / wheel: hotbar',
        'E bag & crafting · L advancements · Q / right click eat · Esc pause',
      ];
      lines.forEach((l, i) => this.text(ctx, l, W / 2, 636 + i * 24, { size: 12.5, align: 'center', col: 'rgba(255,255,255,.72)', weight: 600 }));
    }
  }

  // ── Bag & crafting ────────────────────────────────────────
  drawBag(ctx) {
    const g = this.g;
    ctx.fillStyle = 'rgba(12,10,20,.94)'; roundRect(ctx, 8, 8, W - 16, VIEW_H - 4, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 2; ctx.stroke();
    this.text(ctx, 'Crafting', 22, 32, { size: 18 });
    this.text(ctx, `${g.near.table ? '🧰 ✓' : '🧰 ✗'}   ${g.near.furnace ? '🔥 ✓' : '🔥 ✗'}`, 116, 32, { size: 14, col: '#d6d3d1' });
    this.text(ctx, '✕', 448, 32, { size: 22, align: 'center' });
    // recipe grid
    const list = this.recipeList();
    for (let row = 0; row < R_ROWS; row++) for (let c = 0; c < R_COLS; c++) {
      const e = list[(this.scroll + row) * R_COLS + c]; if (!e) continue;
      const x = R_X0 + c * R_CELL, y = R_Y0 + row * R_CELL, r = e.r;
      ctx.fillStyle = e.k === 0 ? 'rgba(74,222,128,.18)' : 'rgba(255,255,255,.06)';
      roundRect(ctx, x, y, R_CELL - 5, R_CELL - 5, 8); ctx.fill();
      if (this.selRecipe === r) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.globalAlpha = e.k === 0 ? 1 : e.k === 1 ? 0.55 : 0.28;
      this.icon(ctx, r.out, x + 9, y + 7, 32);
      ctx.globalAlpha = 1;
      if (r.n > 1) this.text(ctx, String(r.n), x + R_CELL - 10, y + R_CELL - 13, { size: 12, align: 'right' });
      if (r.at) this.text(ctx, r.at === 'table' ? '🧰' : '🔥', x + 3, y + 9, { size: 10 });
    }
    // scroll arrows
    const rows = Math.ceil(list.length / R_COLS);
    if (rows > R_ROWS) {
      ctx.fillStyle = 'rgba(255,255,255,.15)'; roundRect(ctx, 462, R_Y0, 6, R_ROWS * R_CELL - 5, 3); ctx.fill();
      ctx.fillStyle = '#fff'; roundRect(ctx, 462, R_Y0 + (R_ROWS * R_CELL - 5) * this.scroll / rows, 6, (R_ROWS * R_CELL - 5) * R_ROWS / rows, 3); ctx.fill();
    }
    // detail strip
    const r = this.selRecipe;
    ctx.fillStyle = 'rgba(255,255,255,.06)'; roundRect(ctx, 16, 226, 448, 42, 8); ctx.fill();
    if (r) {
      this.text(ctx, `${nameOf(r.out)}${r.n > 1 ? ' ×' + r.n : ''}`, 26, 238, { size: 14 });
      let x = 26;
      const needs = Object.entries(r.needs);
      if (r.at === 'furnace') needs.push(['fuel', 1]);
      for (const [id, n] of needs) {
        if (id === 'fuel') { const ok = !!g.fuelFor(); this.text(ctx, `+ fuel`, x, 258, { size: 12, col: ok ? '#a7f3d0' : '#fca5a5' }); x += 50; continue; }
        const have = g.count(+id);
        this.icon(ctx, +id, x, 250, 16);
        this.text(ctx, `${have}/${n}`, x + 19, 258, { size: 12, col: have >= n ? '#a7f3d0' : '#fca5a5' });
        x += 62;
      }
      const ok = g.canCraft(r);
      ctx.fillStyle = ok ? '#16a34a' : 'rgba(255,255,255,.12)'; roundRect(ctx, 388, 231, 70, 32, 8); ctx.fill();
      this.text(ctx, r.at === 'furnace' ? 'SMELT' : 'CRAFT', 423, 247, { size: 13, align: 'center', col: ok ? '#fff' : 'rgba(255,255,255,.4)' });
    } else {
      const id = this.pick ? (this.pick.kind === 'inv' ? g.inv[this.pick.i] : g.armour[this.pick.i])?.id : this.hoverId;
      this.text(ctx, id ? nameOf(id) : 'Tap a recipe to see what it needs. Tap twice to make it.', 240, 247, { size: id ? 15 : 12.5, align: 'center', col: id ? '#fff' : 'rgba(255,255,255,.55)' });
    }
    // armour + trash
    this.text(ctx, 'Armour', 230, ARM_Y + 23, { size: 13, col: '#d6d3d1' });
    const armIcons = ['⛑', '👕', '👖', '🥾'];
    for (let i = 0; i < 4; i++) {
      const it = g.armour[i];
      this.slot(ctx, X0 + i * STEP, ARM_Y, it, { picked: this.pick?.kind === 'arm' && this.pick.i === i });
      if (!it) { ctx.globalAlpha = 0.3; this.text(ctx, armIcons[i], X0 + i * STEP + SLOT / 2, ARM_Y + SLOT / 2, { size: 18, align: 'center' }); ctx.globalAlpha = 1; }
    }
    this.text(ctx, `🛡 ${Math.round(g.protection() * 100)}%`, 300, ARM_Y + 23, { size: 13 });
    ctx.fillStyle = 'rgba(220,38,38,.25)'; roundRect(ctx, 414, ARM_Y, SLOT, SLOT, 6); ctx.fill();
    this.text(ctx, '🗑', 414 + SLOT / 2, ARM_Y + SLOT / 2, { size: 20, align: 'center' });
    // bag
    for (let row = 0; row < 3; row++) for (let c = 0; c < 9; c++) { const i = 9 + row * 9 + c; this.slot(ctx, X0 + c * STEP, INV_Y + row * STEP, g.inv[i], { picked: this.pick?.kind === 'inv' && this.pick.i === i }); }
    this.text(ctx, 'Hotbar', 20, HB_Y - 9, { size: 11, col: '#a8a29e' });
    for (let c = 0; c < 9; c++) this.slot(ctx, X0 + c * STEP, HB_Y, g.inv[c], { picked: this.pick?.kind === 'inv' && this.pick.i === c, sel: c === g.sel });
  }

  // ── Advancements ──────────────────────────────────────────
  drawAdv(ctx) {
    const g = this.g;
    ctx.fillStyle = 'rgba(12,10,20,.95)'; roundRect(ctx, 8, 8, W - 16, VIEW_H - 4, 14); ctx.fill();
    this.text(ctx, `🏆 Advancements  ${g.advs.size} / ${ADV.length}`, 22, 32, { size: 18 });
    this.text(ctx, '✕', 448, 32, { size: 22, align: 'center' });
    ADV.forEach((a, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const x = 16 + col * 226, y = 52 + row * 41.5;
      const done = g.advs.has(a.id);
      ctx.fillStyle = done ? 'rgba(251,191,36,.16)' : 'rgba(255,255,255,.05)';
      roundRect(ctx, x, y, 220, 38, 7); ctx.fill();
      if (done) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.globalAlpha = done ? 1 : 0.4;
      this.text(ctx, a.icon, x + 20, y + 19, { size: 18, align: 'center' });
      ctx.globalAlpha = 1;
      this.text(ctx, a.name, x + 40, y + 12, { size: 12.5, col: done ? '#fde68a' : '#a8a29e' });
      ctx.font = '600 9.5px system-ui'; ctx.fillStyle = done ? '#e7e5e4' : '#78716c'; ctx.textAlign = 'left';
      ctx.fillText(done ? a.desc : '???', x + 40, y + 28);
    });
  }
}
