import { describe, expect, it } from "vitest";
import type { SafetyStockSort } from "../../validators/safety-stock/safety-stock-list.schema";
import { sortTargets, type SortableTarget } from "./target-order";

const target = (material: string, location: string, effectiveFrom: string, quantity: string): SortableTarget => ({ material, location, effectiveFrom, quantity });

/** On 2026-06-01: the bolt at plant 1 has a superseded, an in-effect and a scheduled target. */
const TARGETS = [
  target("00000002", "00000001", "2026-07-01", "100.000000"),
  target("00000001", "00000002", "2026-03-01", "25.000000"),
  target("00000002", "00000001", "2026-01-01", "9.500000"),
  target("00000002", "00000001", "2026-05-01", "25.000000"),
  target("00000001", "00000001", "2026-08-01", "100.000000"),
];
const TODAY = "2026-06-01";

const order = (sort: SafetyStockSort, dir: "asc" | "desc" = "asc") =>
  sortTargets(TARGETS, sort, dir, TODAY).map(({ material, location, effectiveFrom }) => `${material}@${location}@${effectiveFrom}`);

describe("sortTargets (#217)", () => {
  it("orders by material, location, then date by default, and by material descending", () => {
    expect(order("material")).toEqual([
      "00000001@00000001@2026-08-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-01-01",
      "00000002@00000001@2026-05-01",
      "00000002@00000001@2026-07-01",
    ]);
    expect(order("material", "desc")[0]).toBe("00000002@00000001@2026-01-01");
  });

  it("orders by location and date, both ways, by the business key within equal values", () => {
    expect(order("location", "desc")).toEqual([
      "00000001@00000002@2026-03-01",
      "00000001@00000001@2026-08-01",
      "00000002@00000001@2026-01-01",
      "00000002@00000001@2026-05-01",
      "00000002@00000001@2026-07-01",
    ]);
    expect(order("effectiveFrom")).toEqual([
      "00000002@00000001@2026-01-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-05-01",
      "00000002@00000001@2026-07-01",
      "00000001@00000001@2026-08-01",
    ]);
  });

  it("orders by quantity by value, not text, by the business key within equal values (#224)", () => {
    expect(order("quantity")).toEqual([
      "00000002@00000001@2026-01-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-05-01",
      "00000001@00000001@2026-08-01",
      "00000002@00000001@2026-07-01",
    ]);
    expect(order("quantity", "desc")).toEqual([
      "00000001@00000001@2026-08-01",
      "00000002@00000001@2026-07-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-05-01",
      "00000002@00000001@2026-01-01",
    ]);
  });

  it("orders by where each target stands today, in time order: superseded, in effect, scheduled", () => {
    expect(order("status")).toEqual([
      "00000002@00000001@2026-01-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-05-01",
      "00000001@00000001@2026-08-01",
      "00000002@00000001@2026-07-01",
    ]);
    expect(order("status", "desc")).toEqual([
      "00000001@00000001@2026-08-01",
      "00000002@00000001@2026-07-01",
      "00000001@00000002@2026-03-01",
      "00000002@00000001@2026-05-01",
      "00000002@00000001@2026-01-01",
    ]);
  });
});
