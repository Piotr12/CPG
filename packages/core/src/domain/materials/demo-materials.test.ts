import { describe, expect, it } from "vitest";
import { materialCreateSchema } from "../../validators/materials/material-create.schema";
import { conversionCreateSchema } from "../../validators/materials/conversion.schema";
import { DEMO_MATERIALS } from "./demo-materials";

describe("DEMO_MATERIALS", () => {
  it("are valid materials and conversions, as a person could have entered them", () => {
    for (const { conversions, ...material } of DEMO_MATERIALS) {
      expect(materialCreateSchema.parse(material)).toEqual(material);
      for (const conversion of conversions) {
        expect(conversionCreateSchema.parse(conversion)).toEqual(conversion);
        expect(conversion.unit).not.toBe(material.baseUnit);
      }
    }
  });

  it("show every material type", () => {
    expect(new Set(DEMO_MATERIALS.map(({ type }) => type))).toEqual(new Set(["raw", "intermediate", "finished"]));
  });
});
