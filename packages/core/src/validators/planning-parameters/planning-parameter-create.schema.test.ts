import { describe, expect, it } from "vitest";
import { planningParameterCreateFormSchema, planningParameterCreateSchema } from "./planning-parameter-create.schema";

const body = {
  material: "00000004",
  location: "00000001",
  procurement: "make",
  leadTimeDays: 2,
  minimumQuantity: "50",
  lotMultiple: "10.5",
};

describe("planningParameterCreateSchema", () => {
  it("parses a whole set, quantities in the six-decimal form (MAT-016)", () => {
    expect(planningParameterCreateSchema.parse(body)).toEqual({
      ...body,
      minimumQuantity: "50.000000",
      lotMultiple: "10.500000",
    });
  });

  it("requires every value (spec Q3)", () => {
    const result = planningParameterCreateSchema.safeParse({});
    expect(result.error?.issues.map(({ path }) => path[0]).sort()).toEqual([
      "leadTimeDays",
      "location",
      "lotMultiple",
      "material",
      "minimumQuantity",
      "procurement",
    ]);
  });

  it("refuses a lot multiple of 0 but accepts a minimum of 0", () => {
    expect(planningParameterCreateSchema.safeParse({ ...body, lotMultiple: "0" }).success).toBe(false);
    expect(planningParameterCreateSchema.parse({ ...body, minimumQuantity: "0" }).minimumQuantity).toBe("0.000000");
  });

  it("drops unknown keys, so a client can't set anything else", () => {
    expect(planningParameterCreateSchema.parse({ ...body, id: "x", tenant: "prod" })).not.toHaveProperty("tenant");
  });
});

describe("planningParameterCreateFormSchema", () => {
  it("takes the lead time as typed text", () => {
    expect(planningParameterCreateFormSchema.parse({ ...body, leadTimeDays: "2" }).leadTimeDays).toBe(2);
    expect(planningParameterCreateFormSchema.safeParse(body).success).toBe(false);
  });
});
