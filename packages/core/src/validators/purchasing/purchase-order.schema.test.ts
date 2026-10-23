import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { LOCATION_CHOICE_MESSAGE } from "../planning-parameters/planning-parameter-fields.schema";
import {
  DUPLICATE_LINE_MESSAGE,
  LINE_NUMBER_MESSAGE,
  ORDER_IMMUTABLE_MESSAGE,
  ORDER_LINE_COUNT_MESSAGE,
  SUPPLIER_CHOICE_MESSAGE,
} from "./purchasing-fields.schema";
import { orderCreateSchema, orderLineDateSchema, orderUpdateBodySchema } from "./purchase-order.schema";

const line = { material: "00000001", quantity: "20.0", unit: "kg", plannedDate: "2027-03-03" };
const valid = { supplier: "00000001", location: "00000002", lines: [line] };
const issues = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("order schemas", () => {
  it("takes a create body, normalizing quantities, and reading no requisition as null", () => {
    expect(orderCreateSchema.parse(valid)).toEqual({
      supplier: "00000001",
      location: "00000002",
      lines: [{ material: "00000001", quantity: "20", unit: "kg", plannedDate: "2027-03-03", requisition: null }],
    });
    const full = orderCreateSchema.parse({ ...valid, lines: [{ ...line, requisition: "00000004", location: "00000002" }] });
    expect(full.lines[0]).toMatchObject({ requisition: "00000004", location: "00000002" });
  });

  it("names each field that is wrong, by its path", () => {
    expect(issues(orderCreateSchema.safeParse({ supplier: "", location: "x", lines: [{ ...line, plannedDate: "soon" }] }))).toEqual([
      ["supplier", SUPPLIER_CHOICE_MESSAGE],
      ["location", LOCATION_CHOICE_MESSAGE],
      ["lines.0.plannedDate", CALENDAR_DATE_MESSAGE],
    ]);
  });

  it("takes from 1 to 100 lines", () => {
    expect(issues(orderCreateSchema.safeParse({ ...valid, lines: [] }))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
    expect(issues(orderCreateSchema.safeParse({ ...valid, lines: undefined }))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
    expect(orderCreateSchema.safeParse({ ...valid, lines: Array.from({ length: 100 }, () => line) }).success).toBe(true);
    expect(issues(orderCreateSchema.safeParse({ ...valid, lines: Array.from({ length: 101 }, () => line) }))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
  });

  it("takes an update body of a version and new dates by line number, and refuses what can't change", () => {
    const body = { version: 3, lines: [{ line: 2, plannedDate: "2027-04-01" }] };
    expect(orderUpdateBodySchema.parse(body)).toEqual(body);
    expect(issues(orderUpdateBodySchema.safeParse({ ...body, supplier: "00000001", location: "00000001" }))).toEqual([
      ["supplier", ORDER_IMMUTABLE_MESSAGE],
      ["location", ORDER_IMMUTABLE_MESSAGE],
    ]);
    // A line's material, unit and quantity are refused too, not silently dropped (BUY-022, BUY-023).
    expect(issues(orderUpdateBodySchema.safeParse({ version: 3, lines: [{ line: 1, plannedDate: "2027-04-01", material: "00000002", unit: "t", quantity: "79" }] }))).toEqual([
      ["lines.0.material", ORDER_IMMUTABLE_MESSAGE],
      ["lines.0.unit", ORDER_IMMUTABLE_MESSAGE],
      ["lines.0.quantity", ORDER_IMMUTABLE_MESSAGE],
    ]);
  });

  it("refuses a line number below 1 or not whole, a repeated line, and no or too many lines", () => {
    const update = (lines: unknown) => orderUpdateBodySchema.safeParse({ version: 1, lines });
    expect(issues(update([{ line: 0, plannedDate: "2027-04-01" }]))).toEqual([["lines.0.line", LINE_NUMBER_MESSAGE]]);
    expect(issues(update([{ line: 1.5, plannedDate: "2027-04-01" }]))).toEqual([["lines.0.line", LINE_NUMBER_MESSAGE]]);
    expect(issues(update([{ line: "1", plannedDate: "2027-04-01" }]))).toEqual([["lines.0.line", LINE_NUMBER_MESSAGE]]);
    expect(
      issues(
        update([
          { line: 1, plannedDate: "2027-04-01" },
          { line: 1, plannedDate: "2027-04-02" },
        ]),
      ),
    ).toEqual([["lines.1.line", DUPLICATE_LINE_MESSAGE]]);
    expect(issues(update([]))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
    expect(issues(update(undefined))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
    expect(issues(update(Array.from({ length: 101 }, (_, index) => ({ line: index + 1, plannedDate: "2027-04-01" }))))).toEqual([["lines", ORDER_LINE_COUNT_MESSAGE]]);
  });

  it("takes a line's Change date form as the planned date alone, and names it when it is missing or not a date", () => {
    expect(orderLineDateSchema.parse({ plannedDate: "2027-04-01", line: 2 })).toEqual({ plannedDate: "2027-04-01" });
    expect(issues(orderLineDateSchema.safeParse({}))).toEqual([["plannedDate", CALENDAR_DATE_MESSAGE]]);
    expect(issues(orderLineDateSchema.safeParse({ plannedDate: "2027-13-01" }))).toEqual([["plannedDate", CALENDAR_DATE_MESSAGE]]);
  });
});
