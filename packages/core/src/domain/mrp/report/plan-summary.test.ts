import { describe, expect, it } from "vitest";
import { summarizePlan, type SummarizedDay } from "./plan-summary";

const day = (date: string, projectedBefore: string, shortage = "0.000000"): SummarizedDay => ({ date, projectedBefore, shortage });

describe("summarizePlan", () => {
  it("finds the lowest balance, negative and fractional, compared exactly rather than as text", () => {
    // As text "-15.500000" < "-2.000000" would be false; as decimals it is the lowest.
    const summary = summarizePlan([day("2026-10-01", "40.000000"), day("2026-10-02", "-2.000000", "2.000000"), day("2026-10-03", "-15.500000", "15.500000")]);
    expect(summary.lowestProjectedBefore).toBe("-15.500000");
  });

  it("dates the first shortage, which need not be the lowest day", () => {
    const summary = summarizePlan([day("2026-10-01", "5.000000"), day("2026-10-02", "-0.000001", "0.000001"), day("2026-10-03", "-9.000000", "9.000000")]);
    expect(summary).toEqual({ lowestProjectedBefore: "-9.000000", firstShortageDate: "2026-10-02" });
  });

  it("has no shortage date when the plan never runs short", () => {
    expect(summarizePlan([day("2026-10-01", "50.000000"), day("2026-10-05", "40.000000"), day("2026-10-07", "25.000000")])).toEqual({
      lowestProjectedBefore: "25.000000",
      firstShortageDate: null,
    });
  });

  it("takes today's balance when no later day is lower, as when supply only arrives", () => {
    expect(summarizePlan([day("2026-10-01", "-3.000000", "3.000000"), day("2026-10-02", "7.000000")])).toEqual({
      lowestProjectedBefore: "-3.000000",
      firstShortageDate: "2026-10-01",
    });
  });
});
