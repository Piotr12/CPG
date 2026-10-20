import { describe, expect, it } from "vitest";
import {
  optionalRequisitionSchema,
  REQUISITION_CHOICE_MESSAGE,
  requisitionReferenceSchema,
  SUPPLIER_CHOICE_MESSAGE,
  supplierReferenceSchema,
} from "./purchasing-fields.schema";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues.map(({ message }) => message);

describe("purchasing field schemas", () => {
  it("takes a supplier and a requisition by eight-digit ID, and asks to choose otherwise", () => {
    expect(supplierReferenceSchema.parse("00000001")).toBe("00000001");
    expect(requisitionReferenceSchema.parse("00000002")).toBe("00000002");
    expect(messages(supplierReferenceSchema.safeParse(""))).toEqual([SUPPLIER_CHOICE_MESSAGE]);
    expect(messages(supplierReferenceSchema.safeParse(undefined))).toEqual([SUPPLIER_CHOICE_MESSAGE]);
    expect(messages(requisitionReferenceSchema.safeParse("1"))).toEqual([REQUISITION_CHOICE_MESSAGE]);
  });

  it("reads an empty choice, null and absence as no requisition", () => {
    expect(optionalRequisitionSchema.parse("")).toBeNull();
    expect(optionalRequisitionSchema.parse(null)).toBeNull();
    expect(optionalRequisitionSchema.parse(undefined)).toBeNull();
    expect(optionalRequisitionSchema.parse("00000003")).toBe("00000003");
    expect(messages(optionalRequisitionSchema.safeParse("abc"))).toEqual([REQUISITION_CHOICE_MESSAGE]);
  });
});
