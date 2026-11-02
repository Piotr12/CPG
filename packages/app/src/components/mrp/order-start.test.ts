import { describe, expect, it } from "vitest";
import { orderStart } from "./order-start";

describe("orderStart", () => {
  it("is the proposal's planned start when it is on time", () => {
    expect(orderStart("2026-11-12", "2026-11-09", "2026-11-12")).toBe("2026-11-09");
  });

  it("is the need date less the lead time when it is late, before the planned start the proposal shows (#320 Q1)", () => {
    // Needed on 2 October with a 4-day lead time, planned on 1 October: it starts today and finishes on the 5th.
    expect(orderStart("2026-10-02", "2026-10-01", "2026-10-05")).toBe("2026-09-28");
  });

  it("crosses month and year ends", () => {
    expect(orderStart("2027-01-02", "2026-12-28", "2027-01-02")).toBe("2026-12-28");
  });
});
