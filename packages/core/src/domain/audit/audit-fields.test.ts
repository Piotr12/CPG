import { describe, expect, it } from "vitest";
import { AUDIT_FIELDS, AUDIT_LINE_FIELDS, isAuditField } from "./audit-fields";

describe("isAuditField", () => {
  it("accepts every listed field", () => {
    expect(AUDIT_FIELDS.filter((field) => !isAuditField(field))).toEqual([]);
  });

  it("accepts a numbered line of a line field, and a completion reversal's numbered movement pair", () => {
    expect(AUDIT_LINE_FIELDS.map((field) => `line12${field[0].toUpperCase()}${field.slice(1)}`).filter((field) => !isAuditField(field))).toEqual([]);
    expect(["movement1Original", "movement1Inverse", "movement40Original"].filter((field) => !isAuditField(field))).toEqual([]);
  });

  it.each([
    ["an unlisted field", "colour"],
    ["a line of a field no line repeats", "line2Supplier"],
    ["a line without its number", "lineReceived"],
    ["a line numbered from zero", "line0Received"],
    ["a movement role that doesn't exist", "movement1Reversal"],
    ["a movement pair without its number", "movementOriginal"],
    ["a listed field's lower-case line part", "line2received"],
  ])("refuses %s", (_case, field) => {
    expect(isAuditField(field)).toBe(false);
  });
});
