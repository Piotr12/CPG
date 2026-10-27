import { describe, expect, it } from "vitest";
import { emptyFlows, projectBuckets } from "./project-buckets";

describe("MRP bucket projection", () => {
  it("starts a day with every flow at zero", () => {
    expect(emptyFlows("2026-10-01")).toEqual({
      date: "2026-10-01",
      firmDemand: 0n,
      forecastDemand: 0n,
      dependentDemand: 0n,
      transferOut: 0n,
      tentativeSupply: 0n,
      dependableSupply: 0n,
      atRiskSupply: 0n,
      transferIn: 0n,
      proposedReceipts: 0n,
      safetyTarget: 0n,
    });
  });

  it("adds receipts, subtracts demand, never counts at-risk supply and keeps the flows it was given", () => {
    const day = {
      ...emptyFlows("2026-10-01"),
      tentativeSupply: 1n,
      dependableSupply: 2n,
      transferIn: 4n,
      firmDemand: 8n,
      forecastDemand: 16n,
      dependentDemand: 32n,
      transferOut: 64n,
      atRiskSupply: 1000n,
      safetyTarget: 500n,
    };
    const [bucket] = projectBuckets(100n, [day]);
    expect(bucket).toEqual({ ...day, projectedBefore: -13n, projectedAfter: -13n, shortage: 13n });
  });

  it("carries the balance from day to day and adds every proposed receipt so far after proposals", () => {
    const buckets = projectBuckets(10n, [
      { ...emptyFlows("2026-10-01"), firmDemand: 25n },
      { ...emptyFlows("2026-10-02"), proposedReceipts: 20n },
      { ...emptyFlows("2026-10-03"), proposedReceipts: 5n, dependableSupply: 15n },
    ]);
    expect(buckets.map(({ projectedBefore, projectedAfter, shortage }) => [projectedBefore, projectedAfter, shortage])).toEqual([
      [-15n, -15n, 15n],
      [-15n, 5n, 15n],
      [0n, 25n, 0n],
    ]);
  });

  it("shows no shortage at zero or above", () => {
    const buckets = projectBuckets(5n, [{ ...emptyFlows("2026-10-01"), firmDemand: 5n }, emptyFlows("2026-10-02")]);
    expect(buckets.map(({ projectedBefore, shortage }) => [projectedBefore, shortage])).toEqual([
      [0n, 0n],
      [0n, 0n],
    ]);
  });
});
