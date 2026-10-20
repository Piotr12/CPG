import { describe, expect, it } from "vitest";
import { MAX_QUANTITY, formatDecimal } from "../quantities/decimal";
import { afterReceipt, isLineReceived, outstandingOf } from "./receipt-quantity";

describe("outstandingOf", () => {
  it("is what is left, and zero once the line has received as much or more", () => {
    expect(outstandingOf("100.000000", "30.000000")).toBe("70.000000");
    expect(outstandingOf("100.000000", "100.000000")).toBe("0.000000");
    expect(outstandingOf("100.000000", "110.000000")).toBe("0.000000");
  });
});

describe("isLineReceived", () => {
  it("holds from the line's quantity on", () => {
    expect(isLineReceived("100.000000", "99.999999")).toBe(false);
    expect(isLineReceived("100.000000", "100.000000")).toBe(true);
    expect(isLineReceived("100.000000", "110.000000")).toBe(true);
  });
});

describe("afterReceipt", () => {
  it("adds a partial receipt with no excess (BUY-010) and a second one on top (BUY-011)", () => {
    expect(afterReceipt("100.000000", "0.000000", "30.000000")).toEqual({ received: "30.000000", excess: "0.000000", completed: false });
    expect(afterReceipt("100.000000", "30.000000", "50.000000")).toEqual({ received: "80.000000", excess: "0.000000", completed: false });
  });

  it("completes the line on an exact receipt (BUY-016)", () => {
    expect(afterReceipt("100.000000", "95.000000", "5.000000")).toEqual({ received: "100.000000", excess: "0.000000", completed: true });
  });

  it("counts as excess only what goes beyond the outstanding (BUY-015)", () => {
    expect(afterReceipt("100.000000", "0.000000", "110.000000")).toEqual({ received: "110.000000", excess: "10.000000", completed: true });
    expect(afterReceipt("100.000000", "95.000000", "10.000000")).toEqual({ received: "105.000000", excess: "5.000000", completed: true });
  });

  it("counts a whole receipt as excess on a line already received in full or beyond", () => {
    expect(afterReceipt("100.000000", "100.000000", "4.000000")?.excess).toBe("4.000000");
    expect(afterReceipt("100.000000", "110.000000", "4.000000")?.excess).toBe("4.000000");
  });

  it("refuses a total that no stored quantity holds", () => {
    const max = formatDecimal(MAX_QUANTITY, { fixed: true });
    expect(afterReceipt(max, max, "0.000001")).toBeNull();
    expect(afterReceipt(max, "0.000000", max)?.received).toBe(max);
  });
});
