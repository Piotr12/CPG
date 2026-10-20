import { describe, expect, it } from "vitest";
import { NO_TARGET, safetyTargetOn, targetInForce, targetStatus } from "./target-on";

const january = { effectiveFrom: "2027-01-01", quantity: "100.000000" };
const february = { effectiveFrom: "2027-02-01", quantity: "150.000000" };

describe("safetyTargetOn", () => {
  it("is zero with no target (DEM-014)", () => {
    expect(safetyTargetOn([], "2027-01-10")).toBe(NO_TARGET);
    expect(NO_TARGET).toBe("0.000000");
  });

  it("applies a target from its own date on (DEM-015)", () => {
    expect(safetyTargetOn([january], "2026-12-31")).toBe(NO_TARGET);
    expect(safetyTargetOn([january], "2027-01-01")).toBe("100.000000");
    expect(safetyTargetOn([january], "2027-01-15")).toBe("100.000000");
  });

  it("switches to the next target on its date, in any input order (DEM-016)", () => {
    const targets = [february, january];
    expect(safetyTargetOn(targets, "2027-01-31")).toBe("100.000000");
    expect(safetyTargetOn(targets, "2027-02-01")).toBe("150.000000");
    expect(safetyTargetOn(targets, "2028-06-30")).toBe("150.000000");
  });
});

describe("targetInForce", () => {
  it("returns the row itself, so callers keep its other fields", () => {
    const row = { ...january, version: 3 };
    expect(targetInForce([row], "2027-01-02")).toBe(row);
    expect(targetInForce([row], "2026-01-02")).toBeNull();
  });
});

describe("targetStatus", () => {
  const targets = [january, february];

  it("marks the target in force today In effect and a later one Scheduled", () => {
    expect(targetStatus(targets, january, "2027-01-20")).toBe("inEffect");
    expect(targetStatus(targets, february, "2027-01-20")).toBe("scheduled");
  });

  it("marks an earlier target Superseded once a later one has started", () => {
    expect(targetStatus(targets, january, "2027-02-01")).toBe("superseded");
    expect(targetStatus(targets, february, "2027-02-01")).toBe("inEffect");
  });

  it("treats a target dated today as in effect", () => {
    expect(targetStatus([january], january, "2027-01-01")).toBe("inEffect");
  });
});
