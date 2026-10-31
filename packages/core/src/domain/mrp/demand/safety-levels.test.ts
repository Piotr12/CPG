import { describe, expect, it } from "vitest";
import type { MrpSafetyTarget } from "../mrp-inputs";
import { horizonDates } from "../projection/horizon";
import { safetyLevels } from "./safety-levels";

const dates = horizonDates("2026-10-01");
const u = (whole: number) => BigInt(whole) * 1_000_000n;
const target = (effectiveFrom: string, quantity: number, overrides: Partial<MrpSafetyTarget> = {}): MrpSafetyTarget => ({
  material: "M1",
  location: "L1",
  effectiveFrom,
  quantity: u(quantity),
  ...overrides,
});

describe("MRP safety levels", () => {
  it("has no pair without a target (DEM-014)", () => {
    expect(safetyLevels([], dates)).toEqual([]);
  });

  it("switches from 20 to 40 on the day the new target starts, never keeping the old one (MRP-043)", () => {
    const [pair] = safetyLevels([target("2026-10-31", 40), target("2026-01-01", 20)], dates);
    expect(pair).toMatchObject({ material: "M1", location: "L1" });
    expect(pair.levels).toHaveLength(90);
    expect(pair.levels[29]).toBe(u(20));
    expect(pair.levels.slice(0, 30).every((level) => level === u(20))).toBe(true);
    expect(pair.levels.slice(30).every((level) => level === u(40))).toBe(true);
  });

  it("reads a target superseded before today as gone, and is zero before a pair's first target", () => {
    const [pair] = safetyLevels([target("2026-01-01", 99), target("2026-09-01", 10), target("2026-10-11", 15, { location: "L2" })], dates);
    expect(pair.levels.every((level) => level === u(10))).toBe(true);
    const [, later] = safetyLevels([target("2026-09-01", 10), target("2026-10-11", 15, { location: "L2" })], dates);
    expect(later).toMatchObject({ location: "L2" });
    expect(later.levels[9]).toBe(0n);
    expect(later.levels[10]).toBe(u(15));
  });

  it("plans a pair whose target is zero, and none whose only target starts after the last day", () => {
    expect(safetyLevels([target("2026-10-01", 0)], dates)).toEqual([{ material: "M1", location: "L1", levels: dates.map(() => 0n) }]);
    expect(safetyLevels([target("2026-12-30", 5)], dates)).toEqual([]);
  });
});
