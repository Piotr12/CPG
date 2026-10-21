import { describe, expect, it } from "vitest";
import { monthOf } from "./calendar";
import { keyedRandom, mulberry32, uniformMicro } from "./random";

const draws = (next: () => number, count: number) => Array.from({ length: count }, () => next());

describe("mulberry32", () => {
  it("yields the same unsigned 32-bit sequence for the same seed", () => {
    expect(draws(mulberry32(20261021), 10)).toEqual([
      2487900046, 329065221, 2116106392, 3505625587, 2050048339, 3351441563, 1442747130, 1146343444, 2443855186, 1938605916,
    ]);
    expect(draws(mulberry32(20261021), 10)).toEqual(draws(mulberry32(20261021), 10));
  });

  it("spreads its draws over the whole 32-bit range", () => {
    const values = draws(mulberry32(7), 1000);
    expect(Math.min(...values)).toBeLessThan(2 ** 32 / 50);
    expect(Math.max(...values)).toBeGreaterThan(2 ** 32 * 0.98);
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < 2 ** 32)).toBe(true);
  });
});

describe("keyedRandom", () => {
  it("draws by seed, calendar month and product, so the same key always repeats", () => {
    const october = monthOf("2026-10-01");
    expect(draws(keyedRandom(20261021, october, 5), 3)).toEqual([4134881975, 3962488063, 650278359]);
    const others = [keyedRandom(20261021, october + 1, 5), keyedRandom(20261021, october + 12, 5), keyedRandom(20261021, october, 18), keyedRandom(1, october, 5)];
    for (const other of others) expect(other()).not.toBe(4134881975);
  });
});

describe("uniformMicro", () => {
  it("maps a draw onto [−amplitude, +amplitude], both ends included", () => {
    expect(uniformMicro(() => 0, 120000n)).toBe(-120000n);
    expect(uniformMicro(() => 2 ** 32 - 1, 120000n)).toBe(120000n);
    const next = mulberry32(1);
    expect([uniformMicro(next, 120000n), uniformMicro(next, 120000n)]).toEqual([30497n, -119344n]);
  });
});
