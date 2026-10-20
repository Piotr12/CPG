import { describe, expect, it } from "vitest";
import { DUPLICATE_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "../purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import { SHIPMENT_CHOICE_MESSAGE } from "../shipments/shipment.schema";
import { ISSUE_LINE_COUNT_MESSAGE, ISSUE_LINES_MAX, issueCreateSchema, issueFormSchema, issueListQuerySchema } from "./goods-issue.schema";

const issues = (input: unknown) => issueCreateSchema.safeParse(input).error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("issueCreateSchema", () => {
  it("parses one shipment and its lines, normalizing quantities and keeping a stated shipment", () => {
    expect(
      issueCreateSchema.parse({
        shipment: "00000001",
        lines: [
          { line: 1, quantity: " 20.000 ", unit: "each" },
          { line: 2, quantity: "5", unit: "case", shipment: "00000001" },
        ],
      }),
    ).toEqual({
      shipment: "00000001",
      lines: [
        { line: 1, quantity: "20", unit: "each" },
        { line: 2, quantity: "5", unit: "case", shipment: "00000001" },
      ],
    });
  });

  it("drops a date a client sends: an issue posts today only (INV-011)", () => {
    expect(issueCreateSchema.parse({ shipment: "00000001", businessDate: "2099-01-01", lines: [{ line: 1, quantity: "1", unit: "each", businessDate: "2099-01-01" }] })).toEqual({
      shipment: "00000001",
      lines: [{ line: 1, quantity: "1", unit: "each" }],
    });
  });

  it("refuses a missing shipment, a bad line number or quantity, and a line listed twice", () => {
    expect(
      issues({
        shipment: "1",
        lines: [
          { line: 0, quantity: "-1", unit: "each", shipment: "x" },
          { line: 2, quantity: "1", unit: "each" },
          { line: 2, quantity: "1", unit: "each" },
        ],
      }),
    ).toEqual([
      ["shipment", SHIPMENT_CHOICE_MESSAGE],
      ["lines.0.line", LINE_NUMBER_MESSAGE],
      ["lines.0.quantity", POSITIVE_QUANTITY_MESSAGE],
      ["lines.0.shipment", SHIPMENT_CHOICE_MESSAGE],
      ["lines.2.line", DUPLICATE_LINE_MESSAGE],
    ]);
  });

  it("takes 1 to 100 lines", () => {
    expect(issues({ shipment: "00000001", lines: [] })).toEqual([["lines", ISSUE_LINE_COUNT_MESSAGE]]);
    expect(issues({ shipment: "00000001" })).toEqual([["lines", ISSUE_LINE_COUNT_MESSAGE]]);
    const many = Array.from({ length: ISSUE_LINES_MAX + 1 }, (_, index) => ({ line: index + 1, quantity: "1", unit: "each" }));
    expect(issues({ shipment: "00000001", lines: many })).toEqual([["lines", ISSUE_LINE_COUNT_MESSAGE]]);
  });
});

describe("the form and list schemas", () => {
  it("leave the shipment to the page and filter by an optional shipment", () => {
    expect(issueFormSchema.safeParse({ lines: [{ line: 1, quantity: "1", unit: "each" }] }).success).toBe(true);
    expect(issueListQuerySchema.parse({ shipment: "00000003" })).toEqual({ shipment: "00000003" });
    expect(issueListQuerySchema.parse({})).toEqual({});
  });
});
