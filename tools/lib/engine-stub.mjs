// ─────────────────────────────────────────────────────────────
//  Stand-in for assets/js/engine.js when a game runs headless in Node (tools/lib/headless.mjs).
//  A game's own code runs unchanged; only the engine's browser parts (canvas, DOM, audio,
//  Supabase) are replaced. runGame() just hands the game's definition to the harness.
// ─────────────────────────────────────────────────────────────
export function runGame(def) { (globalThis.__headlessDefs ||= []).push(def); }
export function roundRect() {}
export function progressBar() {}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
