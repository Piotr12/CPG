import { describe, expect, it } from "vitest";
import { afterPosting, afterReversal, inTransitMicro, inTransitOf, isFullyReceived, postingLimit, undispatchedMicro, undispatchedOf, type TransferProgress } from "./transfer-quantity";

const planned = (changes: Partial<TransferProgress> = {}): TransferProgress => ({
  quantity: "100.000000",
  dispatched: "0.000000",
  received: "0.000000",
  writtenOff: "0.000000",
  ...changes,
});

describe("transfer quantities", () => {
  it("derives what is in transit and what is still to dispatch", () => {
    const progress = planned({ dispatched: "60.000000", received: "50.000000" });
    expect(inTransitOf(progress)).toBe("10.000000");
    expect(undispatchedOf(progress)).toBe("40.000000");
    expect(inTransitOf(planned({ dispatched: "60.000000", received: "50.000000", writtenOff: "10.000000" }))).toBe("0.000000");
  });

  it("limits a dispatch to the undispatched quantity and a receipt or write-off to the transit", () => {
    const progress = planned({ dispatched: "60.000000", received: "50.000000" });
    expect(postingLimit(progress, "dispatch")).toBe("40.000000");
    expect(postingLimit(progress, "receipt")).toBe("10.000000");
    expect(postingLimit(progress, "write-off")).toBe("10.000000");
  });

  it("moves a dispatch into transit (TRF-004, TRF-005)", () => {
    const first = afterPosting(planned(), "dispatch", "60.000000")!;
    expect(first).toEqual({ progress: planned({ dispatched: "60.000000" }), transitBefore: "0.000000", transitAfter: "60.000000" });
    const second = afterPosting(first.progress, "dispatch", "40.000000")!;
    expect(second).toEqual({ progress: planned({ dispatched: "100.000000" }), transitBefore: "60.000000", transitAfter: "100.000000" });
    expect(undispatchedOf(second.progress)).toBe("0.000000");
  });

  it("takes a receipt and a write-off out of transit (TRF-006, TRF-013)", () => {
    const received = afterPosting(planned({ dispatched: "60.000000" }), "receipt", "50.000000")!;
    expect(received).toEqual({ progress: planned({ dispatched: "60.000000", received: "50.000000" }), transitBefore: "60.000000", transitAfter: "10.000000" });
    const lost = afterPosting(received.progress, "write-off", "10.000000")!;
    expect(lost).toEqual({
      progress: planned({ dispatched: "60.000000", received: "50.000000", writtenOff: "10.000000" }),
      transitBefore: "10.000000",
      transitAfter: "0.000000",
    });
  });

  it("refuses more than the limit, by the smallest unit (TRF-007)", () => {
    const progress = planned({ dispatched: "60.000000", received: "50.000000" });
    expect(afterPosting(progress, "receipt", "10.000001")).toBeNull();
    expect(afterPosting(progress, "write-off", "11.000000")).toBeNull();
    expect(afterPosting(progress, "dispatch", "40.000001")).toBeNull();
    expect(afterPosting(progress, "receipt", "10.000000")?.transitAfter).toBe("0.000000");
  });

  it("is fully received only once the planned quantity is received", () => {
    expect(isFullyReceived(planned({ dispatched: "100.000000", received: "99.999999" }))).toBe(false);
    expect(isFullyReceived(planned({ dispatched: "100.000000", received: "100.000000" }))).toBe(true);
    expect(isFullyReceived(planned({ dispatched: "100.000000", received: "90.000000", writtenOff: "10.000000" }))).toBe(false);
  });
});

describe("afterReversal", () => {
  const progress = { quantity: "60.000000", dispatched: "60.000000", received: "50.000000", writtenOff: "5.000000" };

  it("puts a reversed receipt or write-off back into transit (TRF-019, TRF-027)", () => {
    expect(afterReversal(progress, "receipt", "50")).toEqual({
      progress: { ...progress, received: "0.000000" }, transitBefore: "5.000000", transitAfter: "55.000000",
    });
    expect(afterReversal(progress, "write-off", "5")).toEqual({
      progress: { ...progress, writtenOff: "0.000000" }, transitBefore: "5.000000", transitAfter: "10.000000",
    });
  });

  it("takes a reversed dispatch out of transit once nothing downstream remains (TRF-021)", () => {
    expect(afterReversal({ ...progress, received: "0.000000", writtenOff: "0.000000" }, "dispatch", "60")).toEqual({
      progress: { quantity: "60.000000", dispatched: "0.000000", received: "0.000000", writtenOff: "0.000000" }, transitBefore: "60.000000", transitAfter: "0.000000",
    });
  });

  it("refuses a reversal that would make a quantity or transit negative", () => {
    expect(afterReversal(progress, "receipt", "51")).toBeNull();
    expect(afterReversal(progress, "dispatch", "10")).toBeNull();
  });

  it("computes transit and the undispatched balance on micro-units too, as MRP plans them (#277)", () => {
    expect(inTransitMicro(30_000_000n, 10_000_000n, 500_000n)).toBe(19_500_000n);
    expect(undispatchedMicro(100_000_000n, 30_500_000n)).toBe(69_500_000n);
  });
});
