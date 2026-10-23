import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { MATERIAL_CHOICE_MESSAGE } from "../planning-parameters/planning-parameter-fields.schema";
import { REQUISITION_IMMUTABLE_MESSAGE } from "./purchasing-fields.schema";
import { requisitionCreateSchema, requisitionDateSchema, requisitionUpdateBodySchema } from "./purchase-requisition.schema";

const valid = { material: "00000001", location: "00000002", quantity: "100.0", unit: "kg", requiredDate: "2027-03-01" };
const issues = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("requisition schemas", () => {
  it("takes a create body and normalizes the quantity", () => {
    expect(requisitionCreateSchema.parse(valid)).toEqual({ ...valid, quantity: "100" });
  });

  it("names each field that is wrong", () => {
    expect(issues(requisitionCreateSchema.safeParse({ ...valid, material: "x", requiredDate: "2027-02-30" }))).toEqual([
      ["material", MATERIAL_CHOICE_MESSAGE],
      ["requiredDate", CALENDAR_DATE_MESSAGE],
    ]);
    expect(requisitionCreateSchema.safeParse({ ...valid, quantity: "0" }).success).toBe(false);
  });

  it("takes an update body of a version and the new date, and refuses what can't change", () => {
    expect(requisitionUpdateBodySchema.parse({ version: 2, requiredDate: "2027-04-01" })).toEqual({ version: 2, requiredDate: "2027-04-01" });
    expect(issues(requisitionUpdateBodySchema.safeParse({ version: 2, requiredDate: "2027-04-01", quantity: "5", material: "00000001" }))).toEqual([
      ["material", REQUISITION_IMMUTABLE_MESSAGE],
      ["quantity", REQUISITION_IMMUTABLE_MESSAGE],
    ]);
    expect(requisitionUpdateBodySchema.safeParse({ requiredDate: "2027-04-01" }).success).toBe(false);
    expect(requisitionUpdateBodySchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it("takes the Change date form's required date alone, and names it when it is missing or not a date", () => {
    expect(requisitionDateSchema.parse({ requiredDate: " 2027-04-01 " })).toEqual({ requiredDate: "2027-04-01" });
    expect(issues(requisitionDateSchema.safeParse({}))).toEqual([["requiredDate", CALENDAR_DATE_MESSAGE]]);
    expect(issues(requisitionDateSchema.safeParse({ requiredDate: "2027-02-30" }))).toEqual([["requiredDate", CALENDAR_DATE_MESSAGE]]);
  });
});
