// ─────────────────────────────────────────────────────────────
//  TOUCH WHEEL — drag the steering wheel drawn in a cockpit to steer
//  (Turbo Rush 3D, Neon Drift 3D). Like thumbstick.js it tracks its own
//  fingers by pointerId, so one thumb can hold the wheel while the other
//  holds NITRO / HANDBRAKE — the engine's single shared pointer can't.
//
//    const tw = new TouchWheel(shell, {
//      zone: () => ({ x, y, w, h }),          // where a press grabs the wheel (logical px)
//      enabled: () => bool,                   // cockpit view + playing (touch is checked here)
//      holds: { nitro: () => rect, ... },     // hold-buttons, checked before the wheel
//    });
//    tw.active      // true while wheel mode is on (touch device + enabled())
//    tw.value()     // −1..1 steer (0 when nobody is holding the wheel)
//    tw.held('nitro')
// ─────────────────────────────────────────────────────────────

const SPAN = 90;        // px of sideways drag for full lock
const DEAD = 0.05;      // a tiny dead band so resting a thumb doesn't steer

const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export class TouchWheel {
  constructor(shell, opts) {
    this.s = shell; this.o = opts;
    this.grab = null;            // { id, x0, x }
    this.holding = new Map();    // hold name → pointerId
    this.touch = matchMedia('(pointer: coarse)').matches;
    const cv = shell.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') this.touch = true;
      if (!this.active) return;
      const [x, y] = shell.input.toLogical(e);
      for (const [name, rect] of Object.entries(opts.holds || {})) {
        if (inRect(rect(), x, y)) { this.holding.set(name, e.pointerId); return; }
      }
      if (!this.grab && inRect(opts.zone(), x, y)) this.grab = { id: e.pointerId, x0: x, x };
    });
    addEventListener('pointermove', (e) => {
      if (this.grab?.id === e.pointerId) this.grab.x = shell.input.toLogical(e)[0];
    });
    const up = (e) => {
      if (this.grab?.id === e.pointerId) this.grab = null;
      for (const [name, id] of this.holding) if (id === e.pointerId) this.holding.delete(name);
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('blur', () => this.release());
  }

  /** wheel mode: a touch device, in the cockpit, while racing */
  get active() { return this.touch && !!this.o.enabled(); }

  /** let go of everything (life lost, view switched, paused) */
  release() { this.grab = null; this.holding.clear(); }

  /** is a finger on the wheel right now? */
  get grabbed() { return !!this.grab && this.active; }

  value() {
    if (!this.grabbed) return 0;
    const v = Math.max(-1, Math.min(1, (this.grab.x - this.grab.x0) / SPAN));
    return Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
  }

  held(name) { return this.active && this.holding.has(name); }
}
