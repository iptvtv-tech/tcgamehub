// Module hook (registered by headless.mjs): any import of assets/js/engine.js loads the
// headless stand-in instead. Everything else a game imports (world.js, rng.js…) is the real file.
const STUB = new URL('./engine-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (/(^|\/)assets\/js\/engine\.js$/.test(specifier)) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
