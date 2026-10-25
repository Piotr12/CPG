import { describe, expect, it } from "vitest";
import { keyedUniform, mulberry32 } from "./random";

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

describe("keyedUniform", () => {
  it("draws by seed and keys, so the same key always repeats and any other key moves the draw", () => {
    const draw = keyedUniform(20261021, [2, 20747, 5], 0.25);
    expect(keyedUniform(20261021, [2, 20747, 5], 0.25)).toBe(draw);
    for (const other of [keyedUniform(20261021, [2, 20748, 5], 0.25), keyedUniform(20261021, [2, 20747, 18], 0.25), keyedUniform(20261021, [1, 20747, 5], 0.25), keyedUniform(1, [2, 20747, 5], 0.25)]) {
      expect(other).not.toBe(draw);
    }
  });

  it("stays within [−amplitude, +amplitude] and spreads over it", () => {
    const values = Array.from({ length: 2000 }, (_, day) => keyedUniform(7, [day], 0.25));
    expect(values.every((value) => value >= -0.25 && value <= 0.25)).toBe(true);
    expect(Math.min(...values)).toBeLessThan(-0.24);
    expect(Math.max(...values)).toBeGreaterThan(0.24);
    expect(Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length)).toBeLessThan(0.02);
  });
});
