// Retro Vault touch controls (replaces EmulatorJS's own on-screen pad on phones and tablets).
//
// Presses go straight to the emulator core with gameManager.simulateInput(), in the same
// frame as the game, so there's no message-passing delay.
//  • D-pad: one touch area. Your thumb can roll between directions (including diagonals)
//    without lifting, and a small dead zone in the middle stops accidental presses.
//  • Buttons: any finger can slide from one button onto another (e.g. B → A) and the
//    press follows it. Several fingers at once work.
//
// RetroPad numbers used by EmulatorJS: 0 B · 1 Y · 2 Select · 3 Start · 4 Up · 5 Down
// 6 Left · 7 Right · 8 A · 9 X · 10 L · 11 R

const UP = 4, DOWN = 5, LEFT = 6, RIGHT = 7;

// Face buttons are laid out right-to-left like the real controllers.
// pos: where the button sits in the 3×3 face grid ("r" right, "b" bottom, "l" left, "t" top, "m" middle)
export const LAYOUTS = {
  nes:       { face: [['A', 8, 'r'], ['B', 0, 'l']], sel: ['SELECT', 2], start: ['START', 3] },
  gb:        { face: [['A', 8, 'r'], ['B', 0, 'l']], sel: ['SELECT', 2], start: ['START', 3] },
  gba:       { face: [['A', 8, 'r'], ['B', 0, 'l']], shoulders: [['L', 10], ['R', 11]], sel: ['SELECT', 2], start: ['START', 3] },
  snes:      { face: [['A', 8, 'r'], ['B', 0, 'b'], ['X', 9, 't'], ['Y', 1, 'l']], shoulders: [['L', 10], ['R', 11]], sel: ['SELECT', 2], start: ['START', 3] },
  segaMD:    { face: [['C', 8, 'r'], ['B', 0, 'm'], ['A', 1, 'l']], sel: ['MODE', 2], start: ['START', 3] },
  segaMS:    { face: [['2', 8, 'r'], ['1', 0, 'l']], start: ['PAUSE', 3] },
  segaGG:    { face: [['2', 8, 'r'], ['1', 0, 'l']], start: ['START', 3] },
  atari2600: { face: [['FIRE', 0, 'm']], sel: ['SELECT', 2], start: ['RESET', 3] },
  mame:      { face: [['2', 8, 'r'], ['1', 0, 'b'], ['4', 9, 't'], ['3', 1, 'l']], sel: ['COIN', 2], start: ['START', 3] },
};

const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

/**
 * Build the controls into `host` for `system`, sending presses with `send(index, down)`.
 * Returns nothing; everything is driven by pointer events.
 */
export function buildTouchControls(host, system, send) {
  const L = LAYOUTS[system] || LAYOUTS.nes;
  host.classList.toggle('has-shoulders', !!L.shoulders);
  host.innerHTML = `
    <div class="tc-side tc-left">
      ${L.shoulders ? `<div class="tc-shoulder" data-btn="${L.shoulders[0][1]}">${L.shoulders[0][0]}</div>` : ''}
      <div class="tc-dpad" aria-label="D-pad"><span class="u"></span><span class="d"></span><span class="l"></span><span class="r"></span><i></i></div>
      ${L.sel ? `<div class="tc-small" data-btn="${L.sel[1]}">${L.sel[0]}</div>` : '<div class="tc-small tc-spacer"></div>'}
    </div>
    <div class="tc-side tc-right">
      ${L.shoulders ? `<div class="tc-shoulder" data-btn="${L.shoulders[1][1]}">${L.shoulders[1][0]}</div>` : ''}
      <div class="tc-face n${L.face.length}">${L.face.map(([label, i, pos]) => `<div class="tc-btn p-${pos}" data-btn="${i}">${label}</div>`).join('')}</div>
      <div class="tc-small" data-btn="${L.start[1]}">${L.start[0]}</div>
    </div>`;

  // ── D-pad ───────────────────────────────────────────────────
  const pad = host.querySelector('.tc-dpad');
  let padPointer = null;
  let held = new Set();
  function setDirs(dirs) {
    for (const d of held) if (!dirs.has(d)) send(d, false);
    for (const d of dirs) if (!held.has(d)) send(d, true);
    if (dirs.size && [...dirs].some((d) => !held.has(d))) buzz();
    held = dirs;
    pad.dataset.dirs = [...dirs].join(' ');
  }
  function dirsAt(e) {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.14;
    const out = new Set();
    if (Math.hypot(dx, dy) < dead) return out;
    // 8 equal slices: diagonals press two directions
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;   // 0 = right, 90 = down
    const s = Math.round(((a + 360) % 360) / 45) % 8;  // 0 R, 1 DR, 2 D, 3 DL, 4 L, 5 UL, 6 U, 7 UR
    if ([7, 0, 1].includes(s)) out.add(RIGHT);
    if ([1, 2, 3].includes(s)) out.add(DOWN);
    if ([3, 4, 5].includes(s)) out.add(LEFT);
    if ([5, 6, 7].includes(s)) out.add(UP);
    return out;
  }
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padPointer = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDirs(dirsAt(e));
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) { e.preventDefault(); setDirs(dirsAt(e)); } });
  const padEnd = (e) => { if (e.pointerId === padPointer) { padPointer = null; setDirs(new Set()); } };
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);
  pad.addEventListener('lostpointercapture', padEnd);

  // ── Buttons (slide-friendly, multi-touch) ─────────────────────
  const owner = new Map();   // pointerId → button element under that finger
  const count = new Map();   // button element → how many fingers hold it
  const press = (el) => {
    const n = (count.get(el) || 0) + 1; count.set(el, n);
    if (n === 1) { el.classList.add('on'); send(Number(el.dataset.btn), true); buzz(); }
  };
  const release = (el) => {
    const n = (count.get(el) || 0) - 1; count.set(el, Math.max(0, n));
    if (n <= 0) { el.classList.remove('on'); send(Number(el.dataset.btn), false); }
  };
  const btnAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && host.contains(el) ? el.closest('[data-btn]') : null;
  };
  host.querySelectorAll('[data-btn]').forEach((b) => b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.releasePointerCapture?.(e.pointerId); } catch { /* let moves hit-test freely */ }
    owner.set(e.pointerId, b); press(b);
  }));
  host.addEventListener('pointermove', (e) => {
    if (!owner.has(e.pointerId)) return;
    e.preventDefault();
    const now = btnAt(e.clientX, e.clientY);
    const was = owner.get(e.pointerId);
    if (now === was) return;
    if (was) release(was);
    if (now) press(now);
    owner.set(e.pointerId, now);
  });
  const btnEnd = (e) => {
    if (!owner.has(e.pointerId)) return;
    const was = owner.get(e.pointerId);
    owner.delete(e.pointerId);
    if (was) release(was);
  };
  host.addEventListener('pointerup', btnEnd);
  host.addEventListener('pointercancel', btnEnd);

  // Never scroll, zoom, select text or open the long-press menu from the controls.
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'contextmenu', 'selectstart']) {
    host.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }
  // If the page loses focus mid-press, let everything go so nothing sticks.
  const releaseAll = () => {
    setDirs(new Set()); padPointer = null;
    for (const [id, el] of owner) { if (el) { count.set(el, 1); release(el); } owner.delete(id); }
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
}
