import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import {
  bomIdSchema,
  COMPONENT_COUNT_MESSAGE,
  componentsSchema,
  DUPLICATE_COMPONENT_MESSAGE,
  enteredQuantitySchema,
  OUTPUT_CHOICE_MESSAGE,
  outputReferenceSchema,
  PRIORITY_MESSAGE,
  prioritySchema,
  priorityTextSchema,
  throughNotBeforeFrom,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
  validThroughTextSchema,
} from "./bom-fields.schema";

const messages = (result: { success: boolean; error?: z.ZodError }) => result.error?.issues.map(({ path, message }) => [path.join("."), message]);
const line = (material: string, quantity = "1", unit = "each") => ({ material, quantity, unit });

describe("BOM field schemas", () => {
  it("takes BOM and output IDs of eight digits", () => {
    expect(bomIdSchema.safeParse("00000001").success).toBe(true);
    expect(bomIdSchema.safeParse("1").success).toBe(false);
    expect(outputReferenceSchema.safeParse("00000005").data).toBe("00000005");
    expect(messages(outputReferenceSchema.safeParse(""))).toEqual([["", OUTPUT_CHOICE_MESSAGE]]);
    expect(messages(outputReferenceSchema.safeParse(undefined))).toEqual([["", OUTPUT_CHOICE_MESSAGE]]);
  });

  it("takes priorities from 1 to 999 as JSON integers (spec Q4)", () => {
    expect(prioritySchema.safeParse(1).data).toBe(1);
    expect(prioritySchema.safeParse(999).data).toBe(999);
    for (const bad of [0, 1000, 1.5, "1", undefined]) expect(messages(prioritySchema.safeParse(bad))).toEqual([["", PRIORITY_MESSAGE]]);
  });

  it("takes form priorities as digits only", () => {
    expect(priorityTextSchema.safeParse(" 12 ").data).toBe(12);
    for (const bad of ["", "0", "1.5", "-1", "1e2", "1000"]) expect(priorityTextSchema.safeParse(bad).success).toBe(false);
  });

  it("reads an empty valid-through field as no end, and refuses an impossible date", () => {
    expect(validThroughTextSchema.safeParse("").data).toBeNull();
    expect(validThroughTextSchema.safeParse(" 2026-12-31 ").data).toBe("2026-12-31");
    expect(messages(validThroughTextSchema.safeParse("2026-02-30"))).toEqual([["", CALENDAR_DATE_MESSAGE]]);
    expect(messages(validThroughTextSchema.safeParse(3))).toEqual([["", CALENDAR_DATE_MESSAGE]]);
  });

  it("takes entered quantities greater than 0, without trailing zeros (spec Q6)", () => {
    expect(enteredQuantitySchema.safeParse("2.0").data).toBe("2");
    expect(enteredQuantitySchema.safeParse(" 0.125 ").data).toBe("0.125");
    for (const bad of ["0", "-1", "1e3", "0.0000001", 2, undefined]) {
      expect(messages(enteredQuantitySchema.safeParse(bad))).toEqual([["", POSITIVE_QUANTITY_MESSAGE]]);
    }
  });

  it("takes 1 to 100 lines, and puts a repeated material's error on that line (spec Q5)", () => {
    expect(componentsSchema.safeParse([line("00000001"), line("00000002", "2.50", "case")]).data).toEqual([
      line("00000001"),
      line("00000002", "2.5", "case"),
    ]);
    expect(messages(componentsSchema.safeParse([]))).toEqual([["", COMPONENT_COUNT_MESSAGE]]);
    expect(messages(componentsSchema.safeParse("x"))).toEqual([["", COMPONENT_COUNT_MESSAGE]]);
    const tooMany = Array.from({ length: 101 }, (_, index) => line(String(index + 1).padStart(8, "0")));
    expect(messages(componentsSchema.safeParse(tooMany))).toEqual([["", COMPONENT_COUNT_MESSAGE]]);
    expect(messages(componentsSchema.safeParse([line("00000001"), line("00000002"), line("00000001")]))).toEqual([
      ["2.material", DUPLICATE_COMPONENT_MESSAGE],
    ]);
  });

  it("refuses a valid-through date before valid-from, only when both are given", () => {
    const schema = z.object({ validFrom: z.string().optional(), validThrough: z.string().nullable().optional() }).superRefine(throughNotBeforeFrom);
    expect(messages(schema.safeParse({ validFrom: "2026-02-01", validThrough: "2026-01-31" }))).toEqual([
      ["validThrough", VALID_THROUGH_BEFORE_FROM_MESSAGE],
    ]);
    expect(schema.safeParse({ validFrom: "2026-02-01", validThrough: "2026-02-01" }).success).toBe(true);
    expect(schema.safeParse({ validFrom: "2026-02-01", validThrough: null }).success).toBe(true);
    expect(schema.safeParse({ validThrough: "2020-01-01" }).success).toBe(true);
  });
});
