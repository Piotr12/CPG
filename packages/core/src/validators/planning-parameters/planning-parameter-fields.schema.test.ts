import { describe, expect, it } from "vitest";
import {
  LEAD_TIME_MESSAGE,
  leadTimeDaysSchema,
  leadTimeDaysTextSchema,
  LOCATION_CHOICE_MESSAGE,
  locationReferenceSchema,
  MATERIAL_CHOICE_MESSAGE,
  materialReferenceSchema,
  PROCUREMENT_MESSAGE,
  procurementSchema,
} from "./planning-parameter-fields.schema";

const messages = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues.map(({ message }) => message);

describe("references", () => {
  it("take an eight-digit ID and ask for a choice otherwise", () => {
    expect(materialReferenceSchema.parse("00000004")).toBe("00000004");
    expect(locationReferenceSchema.parse("00000001")).toBe("00000001");
    for (const value of ["", "4", undefined, 4]) {
      expect(messages(materialReferenceSchema.safeParse(value))).toEqual([MATERIAL_CHOICE_MESSAGE]);
      expect(messages(locationReferenceSchema.safeParse(value))).toEqual([LOCATION_CHOICE_MESSAGE]);
    }
  });
});

describe("procurementSchema", () => {
  it("takes make or buy only", () => {
    expect(procurementSchema.parse("make")).toBe("make");
    expect(procurementSchema.parse("buy")).toBe("buy");
    expect(messages(procurementSchema.safeParse("Make"))).toEqual([PROCUREMENT_MESSAGE]);
    expect(messages(procurementSchema.safeParse(""))).toEqual([PROCUREMENT_MESSAGE]);
  });
});

describe("leadTimeDaysSchema (API)", () => {
  it("takes whole days from 0 to 999 (MAT-018)", () => {
    expect(leadTimeDaysSchema.parse(0)).toBe(0);
    expect(leadTimeDaysSchema.parse(999)).toBe(999);
  });

  it.each([7.5, -1, 1000, "7", null])("refuses %j", (value) => {
    expect(messages(leadTimeDaysSchema.safeParse(value))).toEqual([LEAD_TIME_MESSAGE]);
  });
});

describe("leadTimeDaysTextSchema (form)", () => {
  it("reads typed digits as a number", () => {
    expect(leadTimeDaysTextSchema.parse(" 7 ")).toBe(7);
    expect(leadTimeDaysTextSchema.parse("0")).toBe(0);
  });

  it.each(["7.5", "-1", "1e2", "1000", "", "seven"])("refuses %j", (value) => {
    expect(messages(leadTimeDaysTextSchema.safeParse(value))).toEqual([LEAD_TIME_MESSAGE]);
  });
});
