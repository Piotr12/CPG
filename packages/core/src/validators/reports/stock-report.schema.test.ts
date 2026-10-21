import { describe, expect, it } from "vitest";
import { stockReportQuerySchema } from "./stock-report.schema";

describe("stockReportQuerySchema", () => {
  it("defaults to every material and location, no all-zero rows, page 1", () => {
    expect(stockReportQuerySchema.parse({})).toEqual({ includeZero: false, page: 1 });
  });

  it("reads the filters, the toggle and the page from query text", () => {
    expect(stockReportQuerySchema.parse({ material: "00000001", location: "00000002", includeZero: "true", page: "3" })).toEqual({
      material: "00000001", location: "00000002", includeZero: true, page: 3,
    });
    expect(stockReportQuerySchema.parse({ includeZero: "false" }).includeZero).toBe(false);
  });

  it("treats the form's empty All choice as no filter", () => {
    expect(stockReportQuerySchema.parse({ material: "", location: "" })).toEqual({ includeZero: false, page: 1 });
  });

  it("refuses a malformed filter, toggle or page, and an unknown parameter", () => {
    for (const query of [{ material: "1" }, { location: "x" }, { includeZero: "yes" }, { page: "0" }, { page: "1.5" }, { materials: "00000001" }]) {
      expect(stockReportQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});
