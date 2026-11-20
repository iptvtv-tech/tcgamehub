// ─────────────────────────────────────────────────────────────
//  Which fingers have lifted without telling us?
//
//  The engine follows every finger by its pointer events: down, move, up. Phones do not always send
//  the "up". An iPhone can drop or cancel it during a long press near the edge of the screen (its own
//  back-swipe and magnifier start there), and holding an on-screen button IS a long press. A finger
//  whose "up" never arrives would hold its button down for ever: the control "sticks".
//
//  But every touch event also carries the phone's own list of the fingers on the canvas right now.
//  So after each touch event the engine compares the two: any finger it still believes is down that
//  the phone no longer lists has lifted, and the engine lets it go (assets/js/engine.js, Input).
//
//  This file is the comparison, kept pure so it can be tested without a browser
//  (tools/check-touch.mjs).
// ─────────────────────────────────────────────────────────────

/** held: the fingers the engine believes are down, [{ id, x, y }] (logical px).
 *  touches: the fingers the phone reports on the canvas, [{ x, y }].
 *  Returns the ids of the held fingers that are no longer there.
 *  Each reported touch is paired with the nearest held finger not yet paired (a finger's two records
 *  are at the same place, give or take one move); whatever is left unpaired has gone. */
export function staleFingers(held, touches) {
  if (held.length <= touches.length) return [];
  const pairs = [];
  held.forEach((h, i) => touches.forEach((q, j) => pairs.push([Math.hypot(h.x - q.x, h.y - q.y), i, j])));
  pairs.sort((a, b) => a[0] - b[0]);
  const kept = new Set(), used = new Set();
  for (const [, i, j] of pairs) { if (kept.has(i) || used.has(j)) continue; kept.add(i); used.add(j); }
  return held.filter((_, i) => !kept.has(i)).map((h) => h.id);
}
