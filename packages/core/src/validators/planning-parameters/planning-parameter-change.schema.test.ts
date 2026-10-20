import { describe, expect, it } from "vitest";
import {
  NOTHING_TO_CHANGE_MESSAGE,
  planningParameterChangeBodySchema,
  planningParameterChangeFormSchema,
  planningParameterChangeSchema,
  planningParameterRemoveBodySchema,
  planningParameterRemoveSchema,
} from "./planning-parameter-change.schema";

describe("planningParameterChangeBodySchema", () => {
  it("takes any of the four values at a version", () => {
    expect(planningParameterChangeBodySchema.parse({ version: 2, leadTimeDays: 9 })).toEqual({ version: 2, leadTimeDays: 9 });
    expect(planningParameterChangeBodySchema.parse({ version: 2, lotMultiple: "6" })).toEqual({ version: 2, lotMultiple: "6.000000" });
  });

  it("refuses a change of nothing, an unknown key included", () => {
    const result = planningParameterChangeBodySchema.safeParse({ version: 2, leadTime: 9 });
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE })]);
  });

  it("requires the version", () => {
    expect(planningParameterChangeBodySchema.safeParse({ procurement: "buy" }).success).toBe(false);
  });
});

describe("the change and remove actions", () => {
  const row = { material: "00000004", location: "00000001", version: 3 };
  const form = { procurement: "buy", leadTimeDays: "5", minimumQuantity: "100", lotMultiple: "50" };

  it("take the form's four values plus the bound row", () => {
    expect(planningParameterChangeFormSchema.parse(form)).toEqual({
      procurement: "buy",
      leadTimeDays: 5,
      minimumQuantity: "100.000000",
      lotMultiple: "50.000000",
    });
    expect(planningParameterChangeSchema.parse({ ...form, ...row })).toMatchObject(row);
    expect(planningParameterChangeSchema.safeParse(form).success).toBe(false);
  });

  it("remove by the bound row, or by a version in the API body", () => {
    expect(planningParameterRemoveSchema.parse(row)).toEqual(row);
    expect(planningParameterRemoveBodySchema.parse({ version: 3 })).toEqual({ version: 3 });
    expect(planningParameterRemoveBodySchema.safeParse({}).success).toBe(false);
  });
});
