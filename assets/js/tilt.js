// ─────────────────────────────────────────────────────────────
//  TILT — phone tilt steering shared by the racing games
//  (Turbo Rush 3D, Neon Drift 3D).
//
//  iPhones / iPads (iOS 13+) only send motion data after the player says yes to
//  a permission prompt, and Safari only shows that prompt when it is asked for
//  inside a real tap — a `touchend` or `click`, NOT `touchstart`/`pointerdown`
//  and never from the game loop. So we ask from document-level touchend / click
//  listeners, and if the browser refuses (wrong moment) we simply ask again on
//  the next tap. Android and other browsers need no prompt.
//
//    const t = tilt();       // one shared instance per page
//    t.on                    // true once real sensor readings are arriving
//    t.need                  // true while we still need the iOS permission tap
//    t.steer(3, 20, 1.4)     // −1..1: dead zone °, full lock °, response curve
//    t.calibrate()           // "this is straight ahead" (call at the start of a level)
// ─────────────────────────────────────────────────────────────
export class Tilt {
  constructor() {
    this.value = null; this.base = 0;
    this.on = false; this.need = false; this.denied = false; this.supported = false;
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;
    if (!matchMedia('(pointer: coarse)').matches) return;          // phones and tablets only
    this.supported = true;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      this.need = true;
      this._ask = () => this.ask();
      document.addEventListener('touchend', this._ask, true);
      document.addEventListener('click', this._ask, true);
    } else this.listen();
  }

  /** Ask for iOS motion permission. Must run inside a touchend / click handler. */
  ask() {
    if (!this.need || this.asking) return;
    let p;
    try { p = DeviceOrientationEvent.requestPermission(); } catch { return; }
    this.asking = true;
    Promise.resolve(p).then((r) => {
      this.need = false; this.stopAsking();
      if (r === 'granted') this.listen(); else this.denied = true;
    }).catch(() => { /* asked at the wrong moment — try again on the next tap */ })
      .finally(() => { this.asking = false; });
  }
  stopAsking() {
    if (!this._ask) return;
    document.removeEventListener('touchend', this._ask, true);
    document.removeEventListener('click', this._ask, true);
  }

  listen() {
    if (this.listening) return;
    this.listening = true;
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null && e.beta == null) return;               // desktops fire empty events
      // portrait steers with gamma (left/right lean); turned sideways, beta becomes the steering axis
      const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      const v = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
      if (v == null || Number.isNaN(v)) return;
      if (!this.on) { this.base = v; this.on = true; }
      this.value = v;
    }, { passive: true });
  }

  calibrate() { if (this.on && this.value != null) this.base = this.value; }

  /** −1..1 from the phone's lean: `dead`° dead zone, full lock at `max`°, `curve` > 1 = gentler near the middle */
  steer(dead = 3, max = 20, curve = 1) {
    if (!this.on || this.value == null) return 0;
    let raw = this.value - this.base;
    if (raw > 180) raw -= 360; else if (raw < -180) raw += 360;
    const g = Math.abs(raw) < dead ? 0 : raw - Math.sign(raw) * dead;
    const t = Math.max(-1, Math.min(1, g / (max - dead)));
    return Math.sign(t) * Math.pow(Math.abs(t), curve);
  }
}

let shared = null;
/** The page's one tilt reader. */
export const tilt = () => (shared ||= new Tilt());
