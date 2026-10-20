import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { DUPLICATE_LINE_MESSAGE } from "../purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import {
  CUSTOMER_ORDER_CHOICE_MESSAGE,
  ORDER_LINE_CHOICE_MESSAGE,
  SHIPMENT_CHOICE_MESSAGE,
  SHIPMENT_LINE_COUNT_MESSAGE,
  SHIPMENT_LINES_MAX,
  shipmentCreateSchema,
  shipmentFormSchema,
  shipmentListQuerySchema,
  shipmentReferenceSchema,
} from "./shipment.schema";

const A = "7f0c8a8e-3b7b-4a52-9a39-1f2a0e6b2c11";
const B = "0b5f2b52-6a0e-4ac4-8a4b-2d5b6d0e9f22";
const issues = (input: unknown) => shipmentCreateSchema.safeParse(input).error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("shipmentCreateSchema", () => {
  it("parses one order, a planned date and its lines, normalizing quantities and keeping a stated order", () => {
    expect(
      shipmentCreateSchema.parse({
        customerOrder: "00000001",
        plannedDate: "2026-10-25",
        lines: [
          { orderLine: A, quantity: " 20.50 ", unit: "each" },
          { orderLine: B, quantity: "3", unit: "case", customerOrder: "00000001" },
        ],
      }),
    ).toEqual({
      customerOrder: "00000001",
      plannedDate: "2026-10-25",
      lines: [
        { orderLine: A, quantity: "20.5", unit: "each" },
        { orderLine: B, quantity: "3", unit: "case", customerOrder: "00000001" },
      ],
    });
  });

  it("refuses a missing order, a bad date, a bad line reference or quantity, and an order line listed twice", () => {
    expect(
      issues({
        customerOrder: "1",
        plannedDate: "2026-02-30",
        lines: [
          { orderLine: "line-1", quantity: "0", unit: "each", customerOrder: "x" },
          { orderLine: A, quantity: "1", unit: "each" },
          { orderLine: A, quantity: "2", unit: "each" },
        ],
      }),
    ).toEqual([
      ["customerOrder", CUSTOMER_ORDER_CHOICE_MESSAGE],
      ["plannedDate", CALENDAR_DATE_MESSAGE],
      ["lines.0.orderLine", ORDER_LINE_CHOICE_MESSAGE],
      ["lines.0.quantity", POSITIVE_QUANTITY_MESSAGE],
      ["lines.0.customerOrder", CUSTOMER_ORDER_CHOICE_MESSAGE],
      ["lines.2.orderLine", DUPLICATE_LINE_MESSAGE],
    ]);
  });

  it("takes 1 to 100 lines", () => {
    const line = (index: number) => ({ orderLine: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, quantity: "1", unit: "each" });
    expect(issues({ customerOrder: "00000001", plannedDate: "2026-10-25", lines: [] })).toEqual([["lines", SHIPMENT_LINE_COUNT_MESSAGE]]);
    expect(issues({ customerOrder: "00000001", plannedDate: "2026-10-25" })).toEqual([["lines", SHIPMENT_LINE_COUNT_MESSAGE]]);
    const many = Array.from({ length: SHIPMENT_LINES_MAX + 1 }, (_, index) => line(index));
    expect(issues({ customerOrder: "00000001", plannedDate: "2026-10-25", lines: many })).toEqual([["lines", SHIPMENT_LINE_COUNT_MESSAGE]]);
    expect(shipmentCreateSchema.safeParse({ customerOrder: "00000001", plannedDate: "2026-10-25", lines: many.slice(1) }).success).toBe(true);
  });
});

describe("the form, list and reference schemas", () => {
  it("leave the order to the page, filter by an optional order, and reference a shipment by its ID", () => {
    expect(shipmentFormSchema.safeParse({ plannedDate: "2026-10-25", lines: [{ orderLine: A, quantity: "1", unit: "each" }] }).success).toBe(true);
    expect(shipmentListQuerySchema.parse({})).toEqual({});
    expect(shipmentListQuerySchema.parse({ customerOrder: "00000002" })).toEqual({ customerOrder: "00000002" });
    expect(shipmentListQuerySchema.safeParse({ customerOrder: "2" }).success).toBe(false);
    expect(shipmentReferenceSchema.safeParse("x").error?.issues[0].message).toBe(SHIPMENT_CHOICE_MESSAGE);
  });
});
