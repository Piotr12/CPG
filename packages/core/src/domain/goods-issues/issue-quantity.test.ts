import { describe, expect, it } from "vitest";
import { addQuantities, exceeds, isLineFulfilled, isNothing, outstandingOf, toIssueOf } from "./issue-quantity";

describe("outstandingOf", () => {
  it("is the quantity less what was fulfilled and abandoned", () => {
    expect(outstandingOf({ quantity: "60.000000", fulfilled: "45.000000", abandoned: "0.000000" })).toBe("15.000000");
    expect(outstandingOf({ quantity: "60.000000", fulfilled: "40.000000", abandoned: "5.500000" })).toBe("14.500000");
  });

  it("is never negative", () => {
    expect(outstandingOf({ quantity: "40.000000", fulfilled: "45.000000", abandoned: "0.000000" })).toBe("0.000000");
  });
});

describe("toIssueOf", () => {
  it("is what the shipment line still plans when the order line has more outstanding", () => {
    expect(toIssueOf("15.000000", "5.000000", "50.000000")).toBe("10.000000");
  });

  it("is the order line's outstanding when the shipment plans more", () => {
    expect(toIssueOf("60.000000", "0.000000", "10.000000")).toBe("10.000000");
  });

  it("is nothing once the shipment line is issued in full, or more", () => {
    expect(toIssueOf("15.000000", "15.000000", "50.000000")).toBe("0.000000");
    expect(toIssueOf("15.000000", "20.000000", "50.000000")).toBe("0.000000");
  });
});

describe("quantity helpers", () => {
  it("compare, add and recognise nothing in exact decimals (R03)", () => {
    expect(exceeds("10.000001", "10.000000")).toBe(true);
    expect(exceeds("10.000000", "10.000000")).toBe(false);
    expect(addQuantities("0.100000", "0.200000")).toBe("0.300000");
    expect(isNothing("0.000000")).toBe(true);
    expect(isNothing("0.000001")).toBe(false);
  });
});

describe("isLineFulfilled", () => {
  it("holds once fulfilled reaches the quantity", () => {
    expect(isLineFulfilled({ quantity: "60.000000", fulfilled: "60.000000" })).toBe(true);
    expect(isLineFulfilled({ quantity: "60.000000", fulfilled: "59.999999" })).toBe(false);
  });
});
