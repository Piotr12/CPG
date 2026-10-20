import { describe, expect, it } from "vitest";
import { findPriorityConflict, validityOverlap, type Alternative } from "./priority-conflict";

const period = (validFrom: string, validThrough: string | null) => ({ validFrom, validThrough });

describe("validityOverlap", () => {
  it("finds the shared days of partly overlapping periods, both ends included (BOM-015)", () => {
    expect(validityOverlap(period("2027-01-01", "2027-03-31"), period("2027-03-01", "2027-05-31"))).toEqual({
      from: "2027-03-01",
      through: "2027-03-31",
    });
  });

  it("counts a single shared day: one period ends the day the other starts (BOM-013)", () => {
    expect(validityOverlap(period("2027-01-01", "2027-03-31"), period("2027-03-31", null))).toEqual({
      from: "2027-03-31",
      through: "2027-03-31",
    });
  });

  it("finds no shared day for adjacent periods (BOM-017)", () => {
    expect(validityOverlap(period("2027-01-01", "2027-01-31"), period("2027-02-01", "2027-02-28"))).toBeNull();
    expect(validityOverlap(period("2027-02-01", null), period("2027-01-01", "2027-01-31"))).toBeNull();
  });

  it("treats a period with no end as overlapping everything after its start", () => {
    expect(validityOverlap(period("2026-01-01", null), period("2030-06-01", "2030-06-30"))).toEqual({
      from: "2030-06-01",
      through: "2030-06-30",
    });
    expect(validityOverlap(period("2026-01-01", null), period("2027-01-01", null))).toEqual({ from: "2027-01-01", through: null });
  });
});

describe("findPriorityConflict", () => {
  const alternative = (bom: string, priority: number, validFrom: string, validThrough: string | null): Alternative => ({
    bom,
    priority,
    validFrom,
    validThrough,
  });

  it("names the alternative with the same priority and overlapping days (BOM-015, BOM-016)", () => {
    const candidate = alternative("00000002", 1, "2027-03-01", "2027-05-31");
    expect(findPriorityConflict(candidate, [alternative("00000001", 1, "2027-01-01", "2027-03-31")])).toEqual({
      bom: "00000001",
      days: { from: "2027-03-01", through: "2027-03-31" },
    });
    expect(findPriorityConflict(candidate, [alternative("00000001", 1, "2027-03-01", "2027-05-31")])?.bom).toBe("00000001");
  });

  it("ignores other priorities, periods without a shared day, and the candidate's own BOM (BOM-017)", () => {
    const candidate = alternative("00000002", 1, "2027-02-01", "2027-02-28");
    const others = [
      alternative("00000001", 2, "2027-01-01", null),
      alternative("00000003", 1, "2027-01-01", "2027-01-31"),
      alternative("00000002", 1, "2027-01-01", null),
    ];
    expect(findPriorityConflict(candidate, others)).toBeNull();
  });
});
