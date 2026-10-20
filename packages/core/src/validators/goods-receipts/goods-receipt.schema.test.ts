import { describe, expect, it } from "vitest";
import { DUPLICATE_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "../purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import {
  ORDER_CHOICE_MESSAGE,
  RECEIPT_LINE_COUNT_MESSAGE,
  RECEIPT_LINES_MAX,
  receiptCreateSchema,
  receiptFormSchema,
  receiptListQuerySchema,
} from "./goods-receipt.schema";

const issues = (input: unknown) =>
  receiptCreateSchema.safeParse(input).error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("receiptCreateSchema", () => {
  it("parses one order and its lines, normalizing quantities and keeping a stated order", () => {
    expect(
      receiptCreateSchema.parse({
        purchaseOrder: "00000001",
        lines: [
          { line: 1, quantity: " 30.50 ", unit: "each" },
          { line: 2, quantity: "5", unit: "case", purchaseOrder: "00000001" },
        ],
      }),
    ).toEqual({
      purchaseOrder: "00000001",
      lines: [
        { line: 1, quantity: "30.5", unit: "each" },
        { line: 2, quantity: "5", unit: "case", purchaseOrder: "00000001" },
      ],
    });
  });

  it("drops fields a receipt doesn't take, such as a date", () => {
    expect(receiptCreateSchema.parse({ purchaseOrder: "00000001", businessDate: "2020-01-01", lines: [{ line: 1, quantity: "1", unit: "each" }] })).toEqual({
      purchaseOrder: "00000001",
      lines: [{ line: 1, quantity: "1", unit: "each" }],
    });
  });

  it("names the order, the line number, the quantity and a repeated line", () => {
    expect(issues({ purchaseOrder: "1", lines: [{ line: 0, quantity: "0", unit: "each" }] })).toEqual([
      ["purchaseOrder", ORDER_CHOICE_MESSAGE],
      ["lines.0.line", LINE_NUMBER_MESSAGE],
      ["lines.0.quantity", POSITIVE_QUANTITY_MESSAGE],
    ]);
    expect(issues({ purchaseOrder: "00000001", lines: [{ line: 2, quantity: "1", unit: "each" }, { line: 2, quantity: "1", unit: "each" }] })).toEqual([
      ["lines.1.line", DUPLICATE_LINE_MESSAGE],
    ]);
    expect(issues({ purchaseOrder: "00000001", lines: [{ line: 1, quantity: "1", unit: "each", purchaseOrder: "x" }] })).toEqual([
      ["lines.0.purchaseOrder", ORDER_CHOICE_MESSAGE],
    ]);
  });

  it("takes 1 to 100 lines", () => {
    const line = (number: number) => ({ line: number, quantity: "1", unit: "each" });
    expect(issues({ purchaseOrder: "00000001", lines: [] })).toEqual([["lines", RECEIPT_LINE_COUNT_MESSAGE]]);
    expect(issues({ purchaseOrder: "00000001" })).toEqual([["lines", RECEIPT_LINE_COUNT_MESSAGE]]);
    const many = Array.from({ length: RECEIPT_LINES_MAX + 1 }, (_, index) => line(index + 1));
    expect(issues({ purchaseOrder: "00000001", lines: many })).toEqual([["lines", RECEIPT_LINE_COUNT_MESSAGE]]);
    expect(receiptCreateSchema.safeParse({ purchaseOrder: "00000001", lines: many.slice(1) }).success).toBe(true);
  });
});

describe("receiptFormSchema", () => {
  it("checks the lines without an order, which the page binds", () => {
    expect(receiptFormSchema.parse({ lines: [{ line: 1, quantity: "2", unit: "each" }] })).toEqual({ lines: [{ line: 1, quantity: "2", unit: "each" }] });
    expect(receiptFormSchema.safeParse({ lines: [] }).success).toBe(false);
  });
});

describe("receiptListQuerySchema", () => {
  it("takes an optional order ID", () => {
    expect(receiptListQuerySchema.parse({})).toEqual({});
    expect(receiptListQuerySchema.parse({ purchaseOrder: "00000002" })).toEqual({ purchaseOrder: "00000002" });
    expect(receiptListQuerySchema.safeParse({ purchaseOrder: "2" }).success).toBe(false);
  });
});
