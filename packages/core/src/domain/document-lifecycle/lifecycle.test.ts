import { describe, expect, it } from "vitest";
import { documentState, outstandingQuantity, resolveLines, type DocumentState, type LifecycleLine } from "./lifecycle";

const line = (processed = "0.000000", status: DocumentState = "open"): LifecycleLine => ({
  quantity: "100.000000", processed, abandoned: "0.000000", status,
});

describe("document lifecycle", () => {
  it("keeps any active line Open and distinguishes completed, cancelled and abandoned aggregates", () => {
    const states: DocumentState[] = ["open", "completed", "cancelled", "closed-early"];
    for (const a of states) for (const b of states) {
      const expected = a === "open" || b === "open" ? "open"
        : a === "completed" && b === "completed" ? "completed"
          : a === "cancelled" && b === "cancelled" ? "cancelled" : "closed-early";
      expect(documentState([a, b])).toBe(expected);
    }
    expect(() => documentState([])).toThrow("at least one line");
  });

  it("subtracts abandonment exactly, including large values, and clamps overfulfillment", () => {
    expect(outstandingQuantity("999999999999.999999", "999999999999.999997", "0.000001")).toBe("0.000001");
    expect(outstandingQuantity("100", "40", "60")).toBe("0.000000");
    expect(outstandingQuantity("100", "101", "0")).toBe("0.000000");
  });

  it("keeps explicit closure authoritative after a reversal while allowing active progress to return", () => {
    for (const status of ["cancelled", "closed-early"] as const) expect(outstandingQuantity("10", "0", "6", status)).toBe("0.000000");
    expect(outstandingQuantity("10", "0", "0", "open")).toBe("10.000000");
  });

  it("cancels unprocessed targets without mutating the supplied history", () => {
    const original = line();
    expect(resolveLines("cancel", [original])).toEqual([{ ...original, abandoned: "100.000000", status: "cancelled" }]);
    expect(original).toEqual(line());
    expect(resolveLines("cancel", [line(), line("0", "cancelled")])[1].status).toBe("cancelled");
  });

  it("closes every active remainder and preserves completed and previously resolved lines", () => {
    const partial = line("40.000000");
    const complete = line("105.000000", "completed");
    const result = resolveLines("close-early", [complete, partial, line()]);
    expect(result).toEqual([complete, { ...partial, abandoned: "60.000000", status: "closed-early" },
      { ...line(), abandoned: "100.000000", status: "closed-early" }]);
    expect(documentState(result.map(({ status }) => status))).toBe("closed-early");
    expect(partial.abandoned).toBe("0.000000");
  });

  it("counts zero-output waste as processing when the owning service supplies posting evidence", () => {
    expect(() => resolveLines("cancel", [line()], { hasProcessing: true })).toThrow(expect.objectContaining({ code: "DOCUMENT_PROCESSED" }));
    expect(resolveLines("close-early", [line()], { hasProcessing: true })[0]).toMatchObject({ status: "closed-early", abandoned: "100.000000" });
  });

  it("refuses cancellation after processing, premature early closure and terminal targets", () => {
    expect(() => resolveLines("cancel", [line("1")])).toThrow(expect.objectContaining({ code: "DOCUMENT_PROCESSED" }));
    expect(() => resolveLines("close-early", [line()])).toThrow(expect.objectContaining({ code: "DOCUMENT_UNPROCESSED" }));
    for (const state of ["completed", "cancelled", "closed-early"] as const) {
      expect(() => resolveLines("cancel", [line("0", state)])).toThrow(expect.objectContaining({ code: "DOCUMENT_NOT_OPEN" }));
    }
    expect(() => resolveLines("cancel", [])).toThrow(expect.objectContaining({ code: "DOCUMENT_NOT_OPEN" }));
  });
});
