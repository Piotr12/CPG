import { describe, expect, it } from "vitest";
import { summarizePlan, type SummarizedDay } from "./plan-summary";

const zero = "0.000000";
const day = (date: string, projectedBefore: string, shortage = zero, flows: Partial<SummarizedDay> = {}): SummarizedDay => ({
  date, projectedBefore, shortage, tentativeSupply: zero, dependableSupply: zero, transferIn: zero, safetyTarget: zero, ...flows,
});

describe("summarizePlan", () => {
  it("finds the lowest balance, negative and fractional, compared exactly rather than as text", () => {
    // As text "-1.500000" sorts below "-12.000000" ("." before "2") and "10.000000" below "9.000000"; as decimals -12 is lowest.
    const summary = summarizePlan([day("2026-10-01", "10.000000"), day("2026-10-02", "9.000000"), day("2026-10-03", "-1.500000", "1.500000"), day("2026-10-04", "-12.000000", "12.000000")]);
    expect(summary.lowestProjectedBefore).toBe("-12.000000");
    expect(summarizePlan([day("2026-10-01", "10.000000"), day("2026-10-02", "9.000000")]).lowestProjectedBefore).toBe("9.000000");
  });

  it("dates the first shortage, which need not be the lowest day", () => {
    const summary = summarizePlan([day("2026-10-01", "5.000000"), day("2026-10-02", "-0.000001", "0.000001"), day("2026-10-03", "-9.000000", "9.000000")]);
    expect(summary).toEqual({ lowestProjectedBefore: "-9.000000", firstShortageDate: "2026-10-02", excess: zero });
  });

  it("has no shortage date when the plan never runs short", () => {
    expect(summarizePlan([day("2026-10-01", "50.000000"), day("2026-10-05", "40.000000"), day("2026-10-07", "25.000000")])).toEqual({
      lowestProjectedBefore: "25.000000",
      firstShortageDate: null,
      excess: zero,
    });
  });

  it("takes today's balance when no later day is lower, as when supply only arrives", () => {
    expect(summarizePlan([day("2026-10-01", "-3.000000", "3.000000"), day("2026-10-02", "7.000000")])).toEqual({
      lowestProjectedBefore: "-3.000000",
      firstShortageDate: "2026-10-01",
      excess: zero,
    });
  });

  it("reports the excess from the stored figures, signed texts read exactly (E19-S02, RUN-010)", () => {
    const days = [
      day("2026-10-01", "-5.500000", "5.500000", { safetyTarget: "2.000000" }),
      day("2026-10-02", "94.500000", zero, { dependableSupply: "100.000000", safetyTarget: "2.000000" }),
      day("2026-10-03", "22.000000", zero, { tentativeSupply: "0.000001", transferIn: "1.000000", safetyTarget: "2.000000" }),
    ] as const;
    expect(summarizePlan(days).excess).toBe("20.000000");
    // Capped at the open supply: 101.000001 arrived, the last day is 1,000 above its target.
    expect(summarizePlan([days[0], days[1], { ...days[2], projectedBefore: "1002.000000" }]).excess).toBe("101.000001");
  });

  it("reads stored figures past what one entry may hold, as a balance summing two of the largest needs (R03)", () => {
    const days = [
      day("2026-10-01", "5.000000", zero, { dependableSupply: "1999999999999.000000" }),
      day("2026-10-02", "-1999999999998.000000", "1999999999998.000000"),
      day("2026-10-03", "2000000000001.500000"),
    ] as const;
    expect(summarizePlan(days)).toEqual({ lowestProjectedBefore: "-1999999999998.000000", firstShortageDate: "2026-10-02", excess: "1999999999999.000000" });
  });
});
