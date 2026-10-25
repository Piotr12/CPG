import { describe, expect, it } from "vitest";
import { STATISTICAL_BASE_UNIT_MESSAGE, UNIT_NOT_REGISTERED_MESSAGE } from "../units/unit-registry";
import { materialCreateSchema, materialEditFormSchema } from "./material-create.schema";

describe("materialCreateSchema", () => {
  it("accepts a type, a description and a base unit, trimmed", () => {
    expect(materialCreateSchema.parse({ type: "raw", description: " Bolt M8 ", baseUnit: " each " })).toEqual({
      type: "raw",
      description: "Bolt M8",
      baseUnit: "each",
    });
  });

  it("names every missing field, so nothing partial is created (MAT-005, MAT-008)", () => {
    const result = materialCreateSchema.safeParse({});

    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["baseUnit", "description", "type"]);
  });

  it("drops an ID sent by the client: the server assigns it (R01)", () => {
    expect(materialCreateSchema.parse({ id: "00000009", type: "raw", description: "x", baseUnit: "kg" })).not.toHaveProperty(
      "id",
    );
  });

  it("refuses the statistical unit as a base unit, and an unlisted unit with the registry's message (#239)", () => {
    const issues = (baseUnit: string) => materialCreateSchema.safeParse({ type: "finished", description: "x", baseUnit }).error?.issues;
    expect(issues("SU")).toEqual([expect.objectContaining({ path: ["baseUnit"], message: STATISTICAL_BASE_UNIT_MESSAGE })]);
    expect(issues("su")).toEqual([expect.objectContaining({ path: ["baseUnit"], message: UNIT_NOT_REGISTERED_MESSAGE })]);
  });

  it("lets the Edit form resend a stored base unit SU: the service refuses only a changed one", () => {
    expect(materialEditFormSchema.parse({ type: "finished", description: "x", baseUnit: "SU" }).baseUnit).toBe("SU");
  });
});
