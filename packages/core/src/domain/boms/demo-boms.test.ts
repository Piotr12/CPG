import { describe, expect, it } from "vitest";
import { DEMO_MATERIALS } from "../materials/demo-materials";
import { DEMO_BOMS } from "./demo-boms";
import { canBeBomComponent, canBeBomOutput } from "./recipe-rules";

/** A demo material by its ID: the seed creates them in order from 00000001. */
const demoMaterial = (id: string) => DEMO_MATERIALS[Number(id) - 1];

describe("DEMO_BOMS", () => {
  it("builds on the demo materials, with valid outputs, components and units (D06)", () => {
    for (const bom of DEMO_BOMS) {
      expect(canBeBomOutput(demoMaterial(bom.output).type)).toBe(true);
      for (const { material, unit } of bom.components) {
        const component = demoMaterial(material);
        expect(canBeBomComponent(component.type)).toBe(true);
        expect([component.baseUnit, ...component.conversions.map((conversion) => conversion.unit)]).toContain(unit);
      }
    }
  });

  it("has the cabinet's two alternatives on different priorities", () => {
    expect(DEMO_BOMS.filter(({ output }) => output === "00000005").map(({ priority }) => priority)).toEqual([1, 2]);
  });
});
