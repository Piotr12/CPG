import { describe, expect, it } from "vitest";
import { AUDIT_MAX_PAGE_SIZE, AUDIT_PAGE_SIZE, auditListSchema } from "./audit-list.schema";

const CURSOR = "4b0c1c5e-0000-4000-8000-000000000001";
const errors = (input: Record<string, string>) => {
  const result = auditListSchema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues.map(({ path, message }) => [path.join("."), message]);
};

describe("auditListSchema", () => {
  it("defaults to the first page of 50 with no filter", () => {
    expect(auditListSchema.parse({})).toEqual({ limit: AUDIT_PAGE_SIZE });
  });

  it("reads every filter from query strings, trimming them and lowercasing the account", () => {
    expect(
      auditListSchema.parse({
        before: CURSOR, limit: "10", subjectType: " PurchaseOrder ", subjectId: " 00000012 ",
        account: " Alice ", channel: "api", from: "2026-10-01", to: "2026-10-21",
      }),
    ).toEqual({
      before: CURSOR, limit: 10, subjectType: "PurchaseOrder", subjectId: "00000012",
      account: "alice", channel: "api", from: "2026-10-01", to: "2026-10-21",
    });
  });

  it("treats an empty or blank value as no filter, as a GET form's All sends it", () => {
    expect(auditListSchema.parse({ subjectType: "", subjectId: " ", account: "", channel: "", from: "", to: "" })).toEqual({
      limit: AUDIT_PAGE_SIZE,
    });
  });

  it("accepts a record type alone, and a one-day range", () => {
    expect(auditListSchema.parse({ subjectType: "StockMovement", from: "2026-10-21", to: "2026-10-21" })).toMatchObject({
      subjectType: "StockMovement", from: "2026-10-21", to: "2026-10-21",
    });
  });

  it("ignores unknown keys, as it always has", () => {
    expect(auditListSchema.parse({ page: "2" })).toEqual({ limit: AUDIT_PAGE_SIZE });
  });

  it("refuses a record ID without its type, since IDs repeat across record types", () => {
    expect(errors({ subjectId: "00000012" })).toEqual([["subjectId", "Choose the record type as well: IDs repeat across types."]]);
  });

  it("refuses a range that ends before it starts, on the end date", () => {
    expect(errors({ from: "2026-10-21", to: "2026-10-20" })).toEqual([["to", "The end date can't be before the start date."]]);
  });

  it.each([
    ["subjectType", "Purchase-Order"],
    ["subjectType", "A".repeat(65)],
    ["subjectId", "x".repeat(201)],
    ["account", "a".repeat(65)],
    ["channel", "web"],
    ["from", "2026-02-30"],
    ["to", "21.10.2026"],
    ["before", "not-a-uuid"],
    ["limit", String(AUDIT_MAX_PAGE_SIZE + 1)],
  ])("refuses %s=%j on that field", (field, value) => {
    const input = field === "subjectId" ? { subjectType: "Material", [field]: value } : { [field]: value };
    expect(errors(input).map(([path]) => path)).toEqual([field]);
  });
});
