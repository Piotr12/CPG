import { describe, expect, it } from "vitest";
import { customerOrderListSchema, customerOrderCreateSchema, customerOrderUpdateSchema, customerOrderUpdateActionSchema, ORDER_LINE_COUNT_MESSAGE, ORDER_LINES_MAX } from "./customer-order.schema";

const line = { material: "00000001", quantity: "2", unit: "each", requiredDate: "2028-02-29" };
const input = { customer: "00000001", location: "00000002", lines: [line] };
describe("customer order inputs", () => {
  it("defaults and validates bounded collection pages", () => {
    expect(customerOrderListSchema.parse({})).toEqual({ page: 1 });
    expect(customerOrderListSchema.parse({ page: "1000000" })).toEqual({ page: 1000000 });
    for (const page of [0, -1, 1.5, 1000001, "x", ["1", "2"]]) expect(customerOrderListSchema.safeParse({ page }).success).toBe(false);
    expect(customerOrderListSchema.safeParse({ extra: "x" }).success).toBe(false);
  });
  it("accepts distinct dates, repeated materials and exact normalized quantity strings", () => {
    expect(customerOrderCreateSchema.parse({ ...input, lines: [line, { ...line, requiredDate: "2020-01-01", quantity: "0.333333" }] })).toMatchObject({ lines: [{ quantity: "2.000000" }, { quantity: "0.333333" }] });
    expect(customerOrderUpdateSchema.parse({ ...input, version: 1, lines: [{ ...line, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, line] }).version).toBe(1);
    expect(customerOrderUpdateActionSchema.parse({ ...input, orderId: "00000001", version: 1 }).orderId).toBe("00000001");
  });
  it.each([0, ORDER_LINES_MAX + 1])("bounds line count (%i)", (count) => {
    expect(customerOrderCreateSchema.safeParse({ ...input, lines: Array.from({ length: count }, () => line) }).error?.issues[0].message).toBe(ORDER_LINE_COUNT_MESSAGE);
  });
  it.each(["0", "-1", "1e3", "0.0000001", 2, "9999999999999"])("refuses invalid quantity %s", (quantity) => {
    expect(customerOrderCreateSchema.safeParse({ ...input, lines: [{ ...line, quantity }] }).success).toBe(false);
  });
  it.each(["customer", "location"])("requires an eight-digit %s", (field) => {
    expect(customerOrderCreateSchema.safeParse({ ...input, [field]: "1" }).success).toBe(false);
  });
  it("refuses malformed dates, versions, IDs, line location and client-written lifecycle/progress (SAL-004)", () => {
    expect(customerOrderCreateSchema.safeParse({ ...input, lines: [{ ...line, requiredDate: "2027-02-29" }] }).success).toBe(false);
    for (const extra of [{ id: "00000099" }, { status: "completed" }, { version: 1 }, { surprise: true }])
      expect(customerOrderCreateSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    for (const extra of [{ location: "00000002" }, { fulfilled: "1" }, { abandoned: "1" }, { status: "completed" }, { id: "invalid" }])
      expect(customerOrderCreateSchema.safeParse({ ...input, lines: [{ ...line, ...extra }] }).success).toBe(false);
    expect(customerOrderUpdateSchema.safeParse({ ...input, version: 0 }).success).toBe(false);
    expect(customerOrderUpdateSchema.safeParse({ ...input, version: 1, lines: [{ ...line, id: "invalid" }] }).success).toBe(false);
  });
});
