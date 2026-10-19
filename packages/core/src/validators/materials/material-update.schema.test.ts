import { describe, expect, it } from "vitest";
import { MATERIAL_ID_IMMUTABLE_MESSAGE } from "./material-fields.schema";
import { materialUpdateBodySchema, materialUpdateSchema } from "./material-update.schema";

describe("materialUpdateBodySchema", () => {
  it("takes any editable field at the loaded version", () => {
    expect(materialUpdateBodySchema.parse({ version: 2, description: " New " })).toEqual({ version: 2, description: "New" });
    expect(
      materialUpdateBodySchema.parse({ version: 1, type: "finished", baseUnit: "kg", active: false, description: "d" }),
    ).toEqual({ version: 1, type: "finished", baseUnit: "kg", active: false, description: "d" });
  });

  it("requires the version (API-029)", () => {
    expect(materialUpdateBodySchema.safeParse({ description: "x" }).error?.issues[0]?.path).toEqual(["version"]);
  });

  it("refuses an ID in the body with an actionable message (MAT-004)", () => {
    const result = materialUpdateBodySchema.safeParse({ id: "00000009", version: 1 });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["id"], message: MATERIAL_ID_IMMUTABLE_MESSAGE }),
    ]);
  });

  it("refuses a string flag, which a form would send by mistake", () => {
    expect(materialUpdateBodySchema.safeParse({ version: 1, active: "false" }).success).toBe(false);
  });
});

describe("materialUpdateSchema", () => {
  it("adds the material the page is bound to", () => {
    expect(materialUpdateSchema.parse({ materialId: "00000001", version: 1, active: true })).toEqual({
      materialId: "00000001",
      version: 1,
      active: true,
    });
    expect(materialUpdateSchema.safeParse({ materialId: "1", version: 1 }).success).toBe(false);
  });
});
