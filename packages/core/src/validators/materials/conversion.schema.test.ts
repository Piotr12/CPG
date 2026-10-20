import { describe, expect, it } from "vitest";
import {
  conversionAddSchema,
  conversionChangeBodySchema,
  conversionChangeSchema,
  conversionCreateSchema,
  conversionFactorFormSchema,
  conversionRemoveBodySchema,
  conversionRemoveSchema,
} from "./conversion.schema";

describe("conversionCreateSchema", () => {
  it("accepts a unit and a canonical factor", () => {
    expect(conversionCreateSchema.parse({ unit: "case", numerator: "12.0", denominator: "1" })).toEqual({
      unit: "case",
      numerator: "12",
      denominator: "1",
    });
  });

  it("refuses a zero denominator (MAT-022)", () => {
    const result = conversionCreateSchema.safeParse({ unit: "case", numerator: "12", denominator: "0" });

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["denominator"]);
  });
});

describe("conversion change and remove", () => {
  it("carry the loaded version", () => {
    expect(conversionChangeBodySchema.parse({ numerator: "10", denominator: "1", version: 2 })).toEqual({
      numerator: "10",
      denominator: "1",
      version: 2,
    });
    expect(conversionRemoveBodySchema.safeParse({}).success).toBe(false);
  });

  it("refuse changing a factor to a zero denominator, on every path that changes one (MAT-022)", () => {
    const zero = { numerator: "12", denominator: "0.000", version: 1 };

    for (const schema of [conversionChangeBodySchema, conversionFactorFormSchema]) {
      expect(schema.safeParse(zero).error?.issues.map((issue) => issue.path[0])).toEqual(["denominator"]);
    }
    expect(
      conversionChangeSchema.safeParse({ ...zero, materialId: "00000002", unit: "case" }).error?.issues.map((issue) => issue.path[0]),
    ).toEqual(["denominator"]);
  });

  it("let the form check only the factor", () => {
    expect(conversionFactorFormSchema.safeParse({ numerator: "10", denominator: "1" }).success).toBe(true);
  });
});

describe("conversion actions", () => {
  it("add the material, and the unit where the row names one", () => {
    expect(conversionAddSchema.parse({ materialId: "00000002", unit: "box", numerator: "100", denominator: "1" })).toEqual({
      materialId: "00000002",
      unit: "box",
      numerator: "100",
      denominator: "1",
    });
    expect(
      conversionChangeSchema.parse({ materialId: "00000002", unit: "box", numerator: "50", denominator: "1", version: 1 }),
    ).toMatchObject({ unit: "box", numerator: "50" });
    expect(conversionRemoveSchema.parse({ materialId: "00000002", unit: "box", version: 3 })).toEqual({
      materialId: "00000002",
      unit: "box",
      version: 3,
    });
  });
});
