import { describe, expect, it } from "vitest";
import { DEMO_MATERIALS } from "../materials/demo-materials";
import { DEMO_LOCATIONS } from "../locations/demo-locations";
import { planningParameterCreateSchema } from "../../validators/planning-parameters/planning-parameter-create.schema";
import { DEMO_PLANNING_PARAMETERS } from "./demo-planning-parameters";
import { isProcurementAllowed } from "./procurement";

describe("DEMO_PLANNING_PARAMETERS", () => {
  it("are valid sets, as a person could have entered them, on demo materials and locations", () => {
    for (const set of DEMO_PLANNING_PARAMETERS) {
      expect(planningParameterCreateSchema.parse(set)).toEqual(set);
      const material = DEMO_MATERIALS[Number(set.material) - 1];
      expect(Number(set.location)).toBeLessThanOrEqual(DEMO_LOCATIONS.length);
      expect(isProcurementAllowed(material.type, set.procurement)).toBe(true);
    }
  });

  it("make one intermediate at one location and buy it at another (MAT-015)", () => {
    const panel = DEMO_PLANNING_PARAMETERS.filter(({ material }) => material === "00000004");
    expect(panel.map(({ procurement }) => procurement).sort()).toEqual(["buy", "make"]);
  });
});
