import { monthOfYear, yearOf, type Month } from "./calendar";

/*
 * The demonstration dataset's only source of randomness: a small seeded generator, so the same
 * configuration always yields the same dataset (spec Q3). Draws are keyed by the calendar month and
 * product they belong to, so a month's figures don't depend on which day the dataset is generated.
 */

/** 2³²: the number of values a draw can take. */
const DRAW_RANGE = 2n ** 32n;
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

/** A generator seeded by the configuration's seed, a calendar year and month, and a product's number. */
export function keyedRandom(seed: number, month: Month, product: number): () => number {
  return mulberry32([yearOf(month), monthOfYear(month), product].reduce(mix, seed >>> 0));
}

/**
 * The next draw as a quantity uniform in `[−amplitude, +amplitude]`, in micro-units like every
 * quantity (R03): both ends are reachable, and nothing passes through a float.
 */
export function uniformMicro(next: () => number, amplitude: bigint): bigint {
  return (BigInt(next()) * 2n * amplitude) / (DRAW_RANGE - 1n) - amplitude;
}
