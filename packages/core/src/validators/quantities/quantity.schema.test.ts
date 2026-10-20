import { describe, expect, it } from "vitest";
import { POSITIVE_QUANTITY_MESSAGE, positiveQuantitySchema, QUANTITY_MESSAGE, quantitySchema } from "./quantity.schema";

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map(({ message }) => message);

describe("quantitySchema", () => {
  it("normalizes to six decimals, zero included", () => {
    expect(quantitySchema.parse("10.5")).toBe("10.500000");
    expect(quantitySchema.parse(" 007 ")).toBe("7.000000");
    expect(quantitySchema.parse("0")).toBe("0.000000");
    expect(quantitySchema.parse("0.123456")).toBe("0.123456");
  });

  it.each(["-1", "1e3", "0.0000001", "1234567890123", "", "abc"])("refuses %j", (text) => {
    expect(issues(quantitySchema.safeParse(text))).toEqual([QUANTITY_MESSAGE]);
  });

  it("refuses a JSON number: no binary float enters (R03)", () => {
    expect(issues(quantitySchema.safeParse(12))).toEqual([QUANTITY_MESSAGE]);
  });
});

describe("positiveQuantitySchema", () => {
  it("accepts down to the six-decimal step", () => {
    expect(positiveQuantitySchema.parse("6")).toBe("6.000000");
    expect(positiveQuantitySchema.parse("0.000001")).toBe("0.000001");
  });

  it.each(["0", "0.000000", "-6", "x"])("refuses %j", (text) => {
    expect(issues(positiveQuantitySchema.safeParse(text))).toEqual([POSITIVE_QUANTITY_MESSAGE]);
  });

  it("refuses a JSON number", () => {
    expect(issues(positiveQuantitySchema.safeParse(6))).toEqual([POSITIVE_QUANTITY_MESSAGE]);
  });
});
