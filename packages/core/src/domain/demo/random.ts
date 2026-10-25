/*
 * The demonstration dataset's only source of randomness: a small seeded generator, so the same
 * configuration always yields the same dataset (spec Q3). Every draw is keyed by what it belongs to,
 * a date or a week and a product or a type, never by its place in a sequence, so a day's noise and
 * drift are the same whichever day the dataset is generated on (single-site spec "Demand").
 */

/** 2³² − 1: the largest value a draw can take. */
const DRAW_MAX = 2 ** 32 - 1;
/** An odd 32-bit constant (2³² ÷ φ) that spreads consecutive keys over the seed space. */
const GOLDEN_GAMMA = 0x9e3779b1;

/**
 * Tommy Ettinger's mulberry32: a 32-bit seeded generator whose every call returns the next unsigned
 * 32-bit integer. Plenty for demonstration data, and about ten lines with no dependency.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** `hash` with `value` folded in, as an unsigned 32-bit integer. */
function mix(hash: number, value: number): number {
  const mixed = Math.imul(hash ^ value, GOLDEN_GAMMA);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/**
 * A draw uniform in `[−amplitude, +amplitude]` from a generator seeded by the configuration's seed and
 * `keys` (whole numbers: a day number, a product's number…): both ends are reachable.
 */
export function keyedUniform(seed: number, keys: readonly number[], amplitude: number): number {
  const next = mulberry32(keys.reduce(mix, seed >>> 0));
  return (next() / DRAW_MAX) * 2 * amplitude - amplitude;
}
