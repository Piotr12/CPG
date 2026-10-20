import { describe, expect, it } from "vitest";
import { DEMO_LOCATIONS } from "../locations/demo-locations";
import { DEMO_MATERIALS } from "../materials/demo-materials";
import { safetyStockTargetCreateSchema } from "../../validators/safety-stock/safety-stock-target.schema";
import { DEMO_SAFETY_STOCK_TARGETS } from "./demo-safety-stock-targets";
import { safetyTargetOn } from "./target-on";

describe("DEMO_SAFETY_STOCK_TARGETS", () => {
  it("are valid targets on demo materials and locations", () => {
    for (const target of DEMO_SAFETY_STOCK_TARGETS) {
      expect(safetyStockTargetCreateSchema.parse(target)).toEqual(target);
      expect(Number(target.material)).toBeLessThanOrEqual(DEMO_MATERIALS.length);
      expect(Number(target.location)).toBeLessThanOrEqual(DEMO_LOCATIONS.length);
    }
  });

  it("show a target that changes over time (DEM-016)", () => {
    const cabinet = DEMO_SAFETY_STOCK_TARGETS.filter(({ material }) => material === "00000005");
    expect(safetyTargetOn(cabinet, "2026-06-30")).toBe("20.000000");
    expect(safetyTargetOn(cabinet, "2027-06-30")).toBe("40.000000");
  });
});
