// ─────────────────────────────────────────────────────────────
//  THUMBSTICK — the roller-ball stick from Crown Heist, shared so every
//  first-person dungeon game (Dungeon Escape 3D, Crypt of Crowns) feels the same.
//  Multi-touch: the stick tracks its own finger, so you can steer with one
//  thumb and press buttons / drag the view with the other.
// ─────────────────────────────────────────────────────────────

export class Thumbstick {
  /**
   * @param shell  the engine shell (needs .canvas, .state, .input.toLogical)
   * @param stick  { x, y, r } in logical canvas pixels
   * @param opts   { onLook(dx) — drag on the view to look; view: {y, h} — where look-drags start;
   *                 claim(x, y) — return true if this press belongs to a game button instead }
   */
  constructor(shell, stick, opts = {}) {
    this.s = shell; this.k = stick; this.o = opts;
    this.active = null; this.look = null;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    const s = shell, cv = s.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (s.state !== 'playing' && s.state !== 'banner') return;
      const [x, y] = s.input.toLogical(e);
      if (e.pointerType !== 'mouse') this.coarse = true;
      if (Math.hypot(x - stick.x, y - stick.y) < stick.r + 26) { this.active = { id: e.pointerId, dx: 0, dy: 0 }; this.move(x, y); return; }
      if (opts.claim?.(x, y)) return;
      const v = opts.view;
      if (opts.onLook && v && y >= v.y && y < v.y + v.h) this.look = { id: e.pointerId, x };
    });
    addEventListener('pointermove', (e) => {
      if (this.active?.id === e.pointerId) { const [x, y] = s.input.toLogical(e); this.move(x, y); }
      else if (this.look?.id === e.pointerId) {
        const [x] = s.input.toLogical(e);
        if (s.state === 'playing') opts.onLook((x - this.look.x) * (this.coarse ? 0.011 : 0.007));
        this.look.x = x;
      }
    });
    const up = (e) => { if (this.active?.id === e.pointerId) this.active = null; if (this.look?.id === e.pointerId) this.look = null; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('blur', () => { this.active = null; this.look = null; });
  }

  move(x, y) {
    let dx = (x - this.k.x) / this.k.r, dy = (y - this.k.y) / this.k.r;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    this.active.dx = dx; this.active.dy = dy;
  }

  /** Smooth analogue values with Crown Heist's dead zone: fwd (+ = forward), turn (+ = right). */
  axes() {
    if (!this.active) return { fwd: 0, turn: 0 };
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    return { fwd: -dz(this.active.dy), turn: dz(this.active.dx) * 0.85 };
  }

  /** The one direction the stick is pushed ('up' | 'down' | 'left' | 'right' | null) — for grid games. */
  dir(dead = 0.4) {
    const a = this.active; if (!a || Math.hypot(a.dx, a.dy) < dead) return null;
    return Math.abs(a.dx) > Math.abs(a.dy) ? (a.dx > 0 ? 'right' : 'left') : (a.dy > 0 ? 'down' : 'up');
  }

  draw(ctx) {
    const K = this.k;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c1917'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(K.x, K.y, K.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(214,211,209,.35)'; ctx.font = '700 11px system-ui';
    ctx.fillText('▲', K.x, K.y - K.r + 12); ctx.fillText('▼', K.x, K.y + K.r - 12); ctx.fillText('↺', K.x - K.r + 12, K.y); ctx.fillText('↻', K.x + K.r - 12, K.y);
    const kx = K.x + (this.active?.dx || 0) * K.r * 0.62, ky = K.y + (this.active?.dy || 0) * K.r * 0.62;
    const kg = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 26); kg.addColorStop(0, '#78716c'); kg.addColorStop(1, '#292524');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kx, ky, 24, 0, 7); ctx.fill();
    ctx.restore();
  }
}
