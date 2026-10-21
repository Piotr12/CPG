import { DOCUMENT_STATES } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { ORDER_STATES, VARIANCE_RANGE_MESSAGE, varianceReportQuerySchema } from "./variance-report.schema";

describe("varianceReportQuerySchema", () => {
  it("defaults to every order, page 1", () => {
    expect(varianceReportQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it("reads every filter and the page from query text", () => {
    expect(
      varianceReportQuerySchema.parse({ material: "00000001", location: "00000002", status: "closed-early", from: "2026-10-01", to: "2026-10-31", page: "2" }),
    ).toEqual({ material: "00000001", location: "00000002", status: "closed-early", from: "2026-10-01", to: "2026-10-31", page: 2 });
  });

  it("treats the form's empty choices and date fields as no filter", () => {
    expect(varianceReportQuerySchema.parse({ material: "", location: "", status: "", from: "", to: "" })).toEqual({ page: 1 });
  });

  it("accepts a one-day range and an open-ended one", () => {
    expect(varianceReportQuerySchema.parse({ from: "2026-10-21", to: "2026-10-21" })).toMatchObject({ from: "2026-10-21", to: "2026-10-21" });
    expect(varianceReportQuerySchema.parse({ to: "2026-10-21" })).toEqual({ to: "2026-10-21", page: 1 });
  });

  it("refuses a range that ends before it starts, on the end date's field", () => {
    const result = varianceReportQuerySchema.safeParse({ from: "2026-10-22", to: "2026-10-21" });
    expect(result.success).toBe(false);
    expect(result.error!.issues).toEqual([expect.objectContaining({ path: ["to"], message: VARIANCE_RANGE_MESSAGE })]);
  });

  it("refuses a malformed filter, an impossible date, a page and an unknown parameter", () => {
    for (const query of [{ material: "1" }, { location: "x" }, { status: "done" }, { from: "2026-02-30" }, { to: "21.10.2026" }, { page: "0" }, { state: "open" }]) {
      expect(varianceReportQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });

  it("offers exactly the document states orders are stored with", () => {
    expect([...ORDER_STATES]).toEqual([...DOCUMENT_STATES]);
  });
});
